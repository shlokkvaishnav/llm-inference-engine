// A line-by-line JavaScript port of mini-vLLM's scheduling code, for the scheduler lab.
// Sources: mini_vllm/kv_cache/block_manager.py, mini_vllm/engine/scheduler.py,
// mini_vllm/engine/sequence.py and LLMEngine.step() in mini_vllm/engine/llm_engine.py.
// The model is replaced by a runner that returns a fixed token, so only the bookkeeping
// runs. site/test/sim.test.mjs checks every step against traces of the Python code.

export const Status = { WAITING: 'WAITING', RUNNING: 'RUNNING', FINISHED: 'FINISHED', PREEMPTED: 'PREEMPTED' }

export class Sequence {
  constructor(id, promptLength, maxTokens) {
    this.id = id
    this.promptTokens = promptLength
    this.originalPromptLength = promptLength
    this.outputTokens = 0
    this.maxTokens = maxTokens
    this.status = Status.WAITING
    this.blockTable = []
    this.preemptions = 0
  }

  get length() { return this.promptTokens + this.outputTokens }
  get numGeneratedTokens() { return this.outputTokens }
  get numTotalGenerated() { return this.length - this.originalPromptLength }
  appendToken() { this.outputTokens += 1 }

  // Preemption recompute: fold the generated tokens into the prompt.
  resetForRecompute() {
    this.promptTokens += this.outputTokens
    this.outputTokens = 0
  }

  checkStop() { return this.outputTokens > 0 && this.numTotalGenerated >= this.maxTokens }
}

export class BlockManager {
  constructor(numBlocks, blockSize) {
    this.numBlocks = numBlocks
    this.blockSize = blockSize
    // Python pops from the end of a list built as [0, 1, ..., n-1]: same order here.
    this.free_ = Array.from({ length: numBlocks }, (_, i) => i)
  }

  get numFreeBlocks() { return this.free_.length }
  blocksNeeded(tokens) { return tokens <= 0 ? 0 : Math.ceil(tokens / this.blockSize) }
  canAllocate(seq) { return this.blocksNeeded(seq.length) - seq.blockTable.length <= this.numFreeBlocks }

  allocate(seq) {
    const needed = this.blocksNeeded(seq.length) - seq.blockTable.length
    if (needed > this.numFreeBlocks) throw new Error(`Cannot allocate ${needed} blocks`)
    for (let i = 0; i < needed; i++) seq.blockTable.push(this.free_.pop())
  }

  hasCapacityForNextToken(seq) {
    if (seq.length + 1 <= seq.blockTable.length * this.blockSize) return true
    if (this.numFreeBlocks === 0) return false
    seq.blockTable.push(this.free_.pop())
    return true
  }

  free(seq) {
    for (const id of seq.blockTable) this.free_.push(id)
    seq.blockTable = []
  }
}

export class Scheduler {
  constructor(maxBatchSize, blockManager) {
    this.maxBatchSize = maxBatchSize
    this.blockManager = blockManager
    this.waiting = []
    this.running = []
  }

  addRequest(seq) {
    seq.status = Status.WAITING
    this.waiting.push(seq)
  }

  step() {
    const preempted = this.preemptIfNeeded()
    this.admitWaiting()
    return { scheduled: [...this.running], preempted }
  }

  // LIFO: the most recently admitted sequence is checked (and evicted) first.
  preemptIfNeeded() {
    const preempted = []
    for (let i = this.running.length - 1; i >= 0; i--) {
      const seq = this.running[i]
      if (!this.blockManager.hasCapacityForNextToken(seq)) {
        const [victim] = this.running.splice(i, 1)
        victim.status = Status.PREEMPTED
        victim.preemptions += 1
        this.blockManager.free(victim)
        this.waiting.unshift(victim) // resumes before any newer request
        preempted.push(victim)
      }
    }
    return preempted
  }

  // FCFS with head-of-line blocking; admission never preempts.
  admitWaiting() {
    while (this.waiting.length && this.running.length < this.maxBatchSize) {
      const seq = this.waiting[0]
      if (!this.blockManager.canAllocate(seq)) break
      this.blockManager.allocate(seq)
      this.waiting.shift()
      seq.status = Status.RUNNING
      this.running.push(seq)
    }
  }

  free(seq) {
    this.running = this.running.filter((s) => s !== seq)
    this.waiting = this.waiting.filter((s) => s !== seq)
    this.blockManager.free(seq)
  }

  hasWork() { return this.waiting.length > 0 || this.running.length > 0 }
}

// LLMEngine.step() with the runner replaced by bookkeeping.
export class Engine {
  constructor({ numBlocks, blockSize, maxBatchSize }) {
    this.blockManager = new BlockManager(numBlocks, blockSize)
    this.scheduler = new Scheduler(maxBatchSize, this.blockManager)
    this.sequences = []
    this.stepCount = 0
    this.tokens = 0
    this.preemptions = 0
    this.prefills = 0
  }

  addRequest(seq) {
    this.scheduler.addRequest(seq)
    this.sequences.push(seq)
  }

  step() {
    const out = this.scheduler.step()
    for (const victim of out.preempted) victim.resetForRecompute()
    const toPrefill = out.scheduled.filter((s) => s.numGeneratedTokens === 0)
    const toDecode = out.scheduled.filter((s) => s.numGeneratedTokens > 0)
    for (const seq of toPrefill) {
      this.blockManager.allocate(seq) // PagedLlamaRunner.prefill_and_store: a no-op after admission
      seq.appendToken()
      seq.status = Status.RUNNING
    }
    for (const seq of toDecode) {
      if (!this.blockManager.hasCapacityForNextToken(seq)) throw new Error('pool exhausted in decode')
      seq.appendToken()
    }
    const finished = []
    for (const seq of out.scheduled) {
      if (seq.checkStop()) {
        seq.status = Status.FINISHED
        seq.finishedAt = this.stepCount
        this.scheduler.free(seq)
        finished.push(seq)
      }
    }
    this.stepCount += 1
    this.tokens += out.scheduled.length
    this.prefills += toPrefill.length
    this.preemptions += out.preempted.length
    return { ...out, finished, prefilled: toPrefill }
  }
}

// Static batching for comparison: take up to maxBatchSize requests in order, run the
// batch until its longest member finishes, then take the next batch. No memory limit.
export function staticBatchingSteps(requests, maxBatchSize) {
  let steps = 0
  const queue = [...requests].sort((a, b) => a.arrival - b.arrival)
  while (queue.length) {
    const ready = queue.filter((r) => r.arrival <= steps)
    if (!ready.length) { steps = queue[0].arrival; continue }
    const batch = ready.slice(0, maxBatchSize)
    for (const r of batch) queue.splice(queue.indexOf(r), 1)
    steps += Math.max(...batch.map((r) => r.maxTokens))
  }
  return steps
}
