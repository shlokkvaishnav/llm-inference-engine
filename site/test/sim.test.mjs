// Checks the JavaScript port in site/sim.js against step-by-step traces of the Python engine.
// Regenerate the traces with: PYTHONPATH=. python site/test/make_golden.py
// Run: node --test site/test/

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Engine, Sequence, staticBatchingSteps } from '../sim.js'

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)))

function run({ num_blocks, block_size, max_batch_size, arrivals }) {
  const engine = new Engine({ numBlocks: num_blocks, blockSize: block_size, maxBatchSize: max_batch_size })
  const pending = arrivals.map(([at, prompt, max], id) => ({ at, prompt, max, id }))
  const trace = []
  let step = 0
  while (pending.length || engine.scheduler.hasWork()) {
    for (const p of pending.filter((x) => x.at <= step)) {
      engine.addRequest(new Sequence(p.id, p.prompt, p.max))
      pending.splice(pending.indexOf(p), 1)
    }
    const out = engine.step()
    trace.push({
      step,
      scheduled: out.scheduled.map((s) => s.id),
      preempted: out.preempted.map((s) => s.id),
      waiting: engine.scheduler.waiting.map((s) => s.id),
      running: engine.scheduler.running.map((s) => s.id),
      free_blocks: engine.blockManager.numFreeBlocks,
      seqs: Object.fromEntries(engine.sequences.map((s) => [String(s.id), { status: s.status, length: s.length, prompt: s.promptTokens, generated: s.numTotalGenerated, blocks: [...s.blockTable] }])),
    })
    step += 1
  }
  return trace
}

for (const [name, { config, trace }] of Object.entries(golden)) {
  test(`JS port matches the Python engine step for step: ${name}`, () => {
    const ours = run(config)
    assert.equal(ours.length, trace.length, 'number of steps')
    ours.forEach((s, i) => assert.deepEqual(s, trace[i], `step ${i}`))
  })
}

test('the tight scenario preempts, so preemption is covered', () => {
  const pre = golden.tight.trace.reduce((n, s) => n + s.preempted.length, 0)
  assert.ok(pre > 0)
})

test('static batching waits for the longest request in each batch', () => {
  const reqs = [{ arrival: 0, maxTokens: 10 }, { arrival: 0, maxTokens: 2 }, { arrival: 0, maxTokens: 3 }]
  assert.equal(staticBatchingSteps(reqs, 2), 10 + 3)
})
