// Checks the TypeScript port in lib/sim.ts against step-by-step traces of the Python engine.
// Regenerate the traces from the repo root with: PYTHONPATH=. python web/tests/make_golden.py
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Engine, Sequence, staticBatchingSteps } from "../lib/sim";

type Config = { num_blocks: number; block_size: number; max_batch_size: number; arrivals: [number, number, number][] };
const golden: Record<string, { config: Config; trace: unknown[] }> = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

function run({ num_blocks, block_size, max_batch_size, arrivals }: Config) {
  const engine = new Engine({ numBlocks: num_blocks, blockSize: block_size, maxBatchSize: max_batch_size });
  const pending = arrivals.map(([at, prompt, max], id) => ({ at, prompt, max, id }));
  const trace = [];
  let step = 0;
  while (pending.length || engine.scheduler.hasWork()) {
    for (const p of pending.filter((x) => x.at <= step)) {
      engine.addRequest(new Sequence(p.id, p.prompt, p.max));
      pending.splice(pending.indexOf(p), 1);
    }
    const out = engine.step();
    trace.push({
      step,
      scheduled: out.scheduled.map((s) => s.id),
      preempted: out.preempted.map((s) => s.id),
      waiting: engine.scheduler.waiting.map((s) => s.id),
      running: engine.scheduler.running.map((s) => s.id),
      free_blocks: engine.blockManager.numFreeBlocks,
      seqs: Object.fromEntries(
        engine.sequences.map((s) => [String(s.id), { status: s.status, length: s.length, prompt: s.promptTokens, generated: s.numTotalGenerated, blocks: [...s.blockTable] }]),
      ),
    });
    step += 1;
  }
  return trace;
}

describe("the TypeScript port matches the Python engine step for step", () => {
  for (const [name, { config, trace }] of Object.entries(golden)) {
    test(name, () => {
      expect(run(config)).toEqual(trace);
    });
  }
});

test("the tight scenario preempts, so preemption is covered", () => {
  const steps = golden.tight.trace as { preempted: number[] }[];
  expect(steps.reduce((n, s) => n + s.preempted.length, 0)).toBeGreaterThan(0);
});

test("static batching waits for the longest request in each batch", () => {
  expect(staticBatchingSteps([{ arrival: 0, maxTokens: 10 }, { arrival: 0, maxTokens: 2 }, { arrival: 0, maxTokens: 3 }], 2)).toBe(13);
});
