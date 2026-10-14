// A line-by-line TypeScript port of mini-vLLM's scheduling code.
// Sources: mini_vllm/kv_cache/block_manager.py, mini_vllm/engine/scheduler.py,
// mini_vllm/engine/sequence.py and LLMEngine.step() in mini_vllm/engine/llm_engine.py.
// The model is replaced by a runner that returns one token per running sequence,
// so only the bookkeeping runs. tests/sim.test.ts checks every step against
// traces of the Python engine (tests/golden.json, written by tests/make_golden.py).

export type Status = "WAITING" | "RUNNING" | "FINISHED" | "PREEMPTED";

export class Sequence {
  promptTokens: number;
  readonly originalPromptLength: number;
  outputTokens = 0;
  status: Status = "WAITING";
  blockTable: number[] = [];
  preemptions = 0;
  finishedAt: number | null = null;

  constructor(
    readonly id: number,
    promptLength: number,
    readonly maxTokens: number,
  ) {
    this.promptTokens = promptLength;
    this.originalPromptLength = promptLength;
  }

  get length() {
    return this.promptTokens + this.outputTokens;
  }
  get numGeneratedTokens() {
    return this.outputTokens;
  }
  get numTotalGenerated() {
    return this.length - this.originalPromptLength;
  }
  appendToken() {
    this.outputTokens += 1;
  }
  // Preemption recompute: the KV cache is gone, so the generated tokens are folded into the prompt.
  resetForRecompute() {
    this.promptTokens += this.outputTokens;
    this.outputTokens = 0;
  }
  checkStop() {
    return this.outputTokens > 0 && this.numTotalGenerated >= this.maxTokens;
  }
}

export class BlockManager {
  private free: number[];

  constructor(
    readonly numBlocks: number,
    readonly blockSize: number,
  ) {
    // Python pops from the end of a list built as [0, 1, ..., n-1]: same order here.
    this.free = Array.from({ length: numBlocks }, (_, i) => i);
  }

  get numFreeBlocks() {
    return this.free.length;
  }
  blocksNeeded(tokens: number) {
    return tokens <= 0 ? 0 : Math.ceil(tokens / this.blockSize);
  }
  canAllocate(seq: Sequence) {
    return this.blocksNeeded(seq.length) - seq.blockTable.length <= this.numFreeBlocks;
  }
  allocate(seq: Sequence) {
    const needed = this.blocksNeeded(seq.length) - seq.blockTable.length;
    if (needed > this.numFreeBlocks) throw new Error(`Cannot allocate ${needed} blocks`);
    for (let i = 0; i < needed; i++) seq.blockTable.push(this.free.pop()!);
  }
  hasCapacityForNextToken(seq: Sequence) {
    if (seq.length + 1 <= seq.blockTable.length * this.blockSize) return true;
    if (this.numFreeBlocks === 0) return false;
    seq.blockTable.push(this.free.pop()!);
    return true;
  }
  release(seq: Sequence) {
    for (const id of seq.blockTable) this.free.push(id);
    seq.blockTable = [];
  }
}

export class Scheduler {
  waiting: Sequence[] = [];
  running: Sequence[] = [];

  constructor(
    readonly maxBatchSize: number,
    readonly blockManager: BlockManager,
  ) {}

  addRequest(seq: Sequence) {
    seq.status = "WAITING";
    this.waiting.push(seq);
  }

  step() {
    const preempted = this.preemptIfNeeded();
    this.admitWaiting();
    return { scheduled: [...this.running], preempted };
  }

  // LIFO: the most recently admitted sequence is checked (and evicted) first.
  private preemptIfNeeded() {
    const preempted: Sequence[] = [];
    for (let i = this.running.length - 1; i >= 0; i--) {
      const seq = this.running[i];
      if (!this.blockManager.hasCapacityForNextToken(seq)) {
        const [victim] = this.running.splice(i, 1);
        victim.status = "PREEMPTED";
        victim.preemptions += 1;
        this.blockManager.release(victim);
        this.waiting.unshift(victim); // resumes before any newer request
        preempted.push(victim);
      }
    }
    return preempted;
  }

  // FCFS with head-of-line blocking; admission never preempts.
  private admitWaiting() {
    while (this.waiting.length && this.running.length < this.maxBatchSize) {
      const seq = this.waiting[0];
      if (!this.blockManager.canAllocate(seq)) break;
      this.blockManager.allocate(seq);
      this.waiting.shift();
      seq.status = "RUNNING";
      this.running.push(seq);
    }
  }

  free(seq: Sequence) {
    this.running = this.running.filter((s) => s !== seq);
    this.waiting = this.waiting.filter((s) => s !== seq);
    this.blockManager.release(seq);
  }

  hasWork() {
    return this.waiting.length > 0 || this.running.length > 0;
  }
}

export type StepResult = { scheduled: Sequence[]; preempted: Sequence[]; finished: Sequence[]; prefilled: Sequence[] };

// LLMEngine.step() with the runner replaced by bookkeeping.
export class Engine {
  readonly blockManager: BlockManager;
  readonly scheduler: Scheduler;
  sequences: Sequence[] = [];
  stepCount = 0;
  tokens = 0;
  preemptions = 0;

  constructor({ numBlocks, blockSize, maxBatchSize }: { numBlocks: number; blockSize: number; maxBatchSize: number }) {
    this.blockManager = new BlockManager(numBlocks, blockSize);
    this.scheduler = new Scheduler(maxBatchSize, this.blockManager);
  }

  addRequest(seq: Sequence) {
    this.scheduler.addRequest(seq);
    this.sequences.push(seq);
  }

  step(): StepResult {
    const out = this.scheduler.step();
    for (const victim of out.preempted) victim.resetForRecompute();
    const toPrefill = out.scheduled.filter((s) => s.numGeneratedTokens === 0);
    const toDecode = out.scheduled.filter((s) => s.numGeneratedTokens > 0);
    for (const seq of toPrefill) {
      this.blockManager.allocate(seq); // PagedLlamaRunner.prefill_and_store: a no-op after admission
      seq.appendToken();
      seq.status = "RUNNING";
    }
    for (const seq of toDecode) {
      if (!this.blockManager.hasCapacityForNextToken(seq)) throw new Error("pool exhausted in decode");
      seq.appendToken();
    }
    const finished: Sequence[] = [];
    for (const seq of out.scheduled) {
      if (seq.checkStop()) {
        seq.status = "FINISHED";
        seq.finishedAt = this.stepCount;
        this.scheduler.free(seq);
        finished.push(seq);
      }
    }
    this.stepCount += 1;
    this.tokens += out.scheduled.length;
    this.preemptions += out.preempted.length;
    return { ...out, finished, prefilled: toPrefill };
  }
}

export type Request = { arrival: number; promptTokens: number; maxTokens: number };

// Static batching for comparison: take up to maxBatchSize waiting requests, run the
// batch until its longest member finishes, then take the next. No memory limit.
export function staticBatchingSteps(requests: { arrival: number; maxTokens: number }[], maxBatchSize: number) {
  let steps = 0;
  const queue = [...requests].sort((a, b) => a.arrival - b.arrival);
  while (queue.length) {
    const ready = queue.filter((r) => r.arrival <= steps);
    if (!ready.length) {
      steps = queue[0].arrival;
      continue;
    }
    const batch = ready.slice(0, maxBatchSize);
    for (const r of batch) queue.splice(queue.indexOf(r), 1);
    steps += Math.max(...batch.map((r) => r.maxTokens));
  }
  return steps;
}

// Drives an engine through a list of requests that arrive at given steps.
export class Run {
  engine: Engine;
  pending: (Request & { id: number })[];
  history = new Map<number, string[]>();
  log: { step: number; kind: "arrive" | "admit" | "preempt" | "finish"; text: string }[] = [];
  done = false;

  constructor(
    config: { numBlocks: number; blockSize: number; maxBatchSize: number },
    readonly requests: Request[],
  ) {
    this.engine = new Engine(config);
    this.pending = requests.map((r, id) => ({ ...r, id }));
  }

  add(r: Request) {
    const id = this.requests.length;
    this.requests.push(r);
    this.pending.push({ ...r, id });
    this.done = false;
    return id;
  }

  step() {
    const e = this.engine;
    const step = e.stepCount;
    for (const r of this.pending.filter((x) => x.arrival <= step)) {
      e.addRequest(new Sequence(r.id, r.promptTokens, r.maxTokens));
      this.pending.splice(this.pending.indexOf(r), 1);
      this.log.push({ step, kind: "arrive", text: `#${r.id} arrives: ${r.promptTokens} prompt tokens, up to ${r.maxTokens} new` });
    }
    if (!e.scheduler.hasWork()) {
      if (!this.pending.length) this.done = true;
      else e.stepCount += 1; // idle until the next arrival
      return;
    }
    const out = e.step();
    for (const s of out.preempted) this.log.push({ step, kind: "preempt", text: `#${s.id} preempted: no free block for its next token. Its blocks are freed and it recomputes later.` });
    for (const s of out.prefilled) this.log.push({ step, kind: "admit", text: `#${s.id} admitted: prefill ${s.promptTokens} tokens into ${s.blockTable.length} block(s)${s.preemptions ? " (recompute)" : ""}` });
    for (const s of out.finished) this.log.push({ step, kind: "finish", text: `#${s.id} finished. Its blocks return to the pool.` });
    const ran = new Set(out.scheduled.map((s) => s.id));
    const pre = new Set(out.preempted.map((s) => s.id));
    for (const s of e.sequences) {
      const row = this.history.get(s.id) ?? [];
      while (row.length < step) row.push("none");
      row.push(pre.has(s.id) ? "preempted" : ran.has(s.id) ? "running" : s.status === "FINISHED" ? "finished" : "waiting");
      this.history.set(s.id, row);
    }
    if (!e.scheduler.hasWork() && !this.pending.length) this.done = true;
  }
}
