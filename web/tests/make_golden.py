"""Record step-by-step traces of the real scheduler, for the JS port's tests.

The engine, scheduler, block manager and sequence code are pure bookkeeping,
so a fake runner without a model gives the engine's exact scheduling. The
fake runner calls the same block-manager methods as PagedLlamaRunner:
allocate() in prefill and has_capacity_for_next_token() in decode.

Run from the repo root (no torch needed):
    python web/tests/make_golden.py
"""

from __future__ import annotations

import json
from pathlib import Path

from mini_vllm.engine.llm_engine import LLMEngine
from mini_vllm.engine.sequence import SamplingParams, Sequence
from mini_vllm.kv_cache.block_manager import BlockManager


class FakeTokenizer:
    eos_token_id = None

    def decode(self, ids, skip_special_tokens=True):
        return ""


class FakeRunner:
    def __init__(self, block_manager):
        self.block_manager = block_manager
        self.tokenizer = FakeTokenizer()

    def prefill_and_store(self, sequences):
        for seq in sequences:
            self.block_manager.allocate(seq)
        return [7] * len(sequences)

    def decode_batch(self, sequences):
        for seq in sequences:
            assert self.block_manager.has_capacity_for_next_token(seq)
        return [7] * len(sequences)

    def free_seq(self, seq_id):
        pass


SCENARIOS = {
    "roomy": {"num_blocks": 64, "block_size": 4, "max_batch_size": 4,
              "arrivals": [[0, 5, 6], [0, 9, 3], [0, 3, 8], [0, 12, 4], [0, 4, 5], [0, 7, 7]]},
    "tight": {"num_blocks": 10, "block_size": 4, "max_batch_size": 4,
              "arrivals": [[0, 6, 12], [0, 5, 14], [0, 7, 10], [0, 4, 9], [2, 3, 6]]},
    "staggered": {"num_blocks": 9, "block_size": 2, "max_batch_size": 3,
                  "arrivals": [[0, 3, 5], [1, 4, 4], [1, 2, 7], [3, 5, 3], [4, 1, 6], [6, 3, 4], [6, 2, 2]]},
}


def snapshot(step, out, engine, bm, seqs):
    return {
        "step": step,
        "scheduled": [s.seq_id for s in out.scheduled],
        "preempted": [s.seq_id for s in out.preempted],
        "waiting": [s.seq_id for s in engine.scheduler.waiting],
        "running": [s.seq_id for s in engine.scheduler.running],
        "free_blocks": bm.num_free_blocks,
        "seqs": {str(s.seq_id): {"status": s.status.name, "length": s.length, "prompt": s.prompt_length,
                                 "generated": s.num_total_generated, "blocks": list(s.block_table)} for s in seqs},
    }


def run(cfg):
    bm = BlockManager(cfg["num_blocks"], cfg["block_size"])
    engine = LLMEngine(FakeRunner(bm), max_batch_size=cfg["max_batch_size"], block_manager=bm)
    pending = [(at, i, p, m) for i, (at, p, m) in enumerate(cfg["arrivals"])]
    seqs, trace, step = [], [], 0
    while pending or engine.scheduler.has_work():
        for at, i, p, m in [x for x in pending if x[0] <= step]:
            seq = Sequence([1] * p, SamplingParams(max_tokens=m), seq_id=i)
            engine.add_request(seq)
            seqs.append(seq)
            pending.remove((at, i, p, m))
        out = engine.step()
        trace.append(snapshot(step, out, engine, bm, seqs))
        step += 1
        assert step < 500, "no progress"
    return trace


golden = {name: {"config": cfg, "trace": run(cfg)} for name, cfg in SCENARIOS.items()}
path = Path(__file__).with_name("golden.json")  # web/tests/golden.json
path.write_text(json.dumps(golden, indent=1) + "\n")
for name, g in golden.items():
    pre = sum(len(t["preempted"]) for t in g["trace"])
    print(f"{name}: {len(g['trace'])} steps, {pre} preemptions")
