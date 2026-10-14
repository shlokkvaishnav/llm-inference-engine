"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { seqColor } from "@/lib/colors";
import { Run } from "@/lib/sim";
import { randomWorkload } from "@/lib/workloads";

const CONFIG = { numBlocks: 40, blockSize: 4, maxBatchSize: 5 };

// The hero: mini-vLLM's own scheduler (ported to TypeScript) serving a random stream
// of requests. Every block, lane and counter comes from the engine state at that step.
export function EngineVisual() {
  const seed = useRef(1);
  const run = useRef<Run>(new Run(CONFIG, randomWorkload(seed.current)));
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (run.current.done) {
        seed.current += 1;
        run.current = new Run(CONFIG, randomWorkload(seed.current));
      }
      run.current.step();
      tick();
    }, 650);
    return () => clearInterval(id);
  }, [playing]);

  const e = run.current.engine;
  const owner = new Map<number, number>();
  for (const s of e.sequences) for (const b of s.blockTable) owner.set(b, s.id);
  const used = owner.size;
  const running = e.scheduler.running;
  const lastPreempt = [...run.current.log].reverse().find((l) => l.kind === "preempt");

  return (
    <figure className="engine" aria-label="The mini-vLLM scheduler running in your browser">
      <div className="engine-head">
        <span>
          <strong>KV-cache pool</strong> · {used} of {CONFIG.numBlocks} blocks in use
        </span>
        <button className="icon-btn" type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause the engine" : "Run the engine"} style={{ width: "1.9rem", height: "1.9rem" }}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>
      <div className="pool" style={{ gridTemplateColumns: `repeat(${CONFIG.numBlocks / 2}, 1fr)` }} aria-hidden="true">
        {Array.from({ length: CONFIG.numBlocks }, (_, b) => {
          const id = owner.get(b);
          return <div key={b} className="blk" style={id == null ? undefined : { background: seqColor(id) }} />;
        })}
      </div>
      <div className="lanes" aria-hidden="true">
        {running.map((s) => {
          const total = s.originalPromptLength + s.maxTokens;
          return (
            <div className="lane" key={s.id}>
              <span>#{s.id}</span>
              <div className="lane-track">
                <div className="lane-prompt" style={{ width: `${(100 * s.originalPromptLength) / total}%`, background: seqColor(s.id) }} />
                <div className="lane-gen" style={{ left: `${(100 * s.originalPromptLength) / total}%`, width: `${(100 * s.numTotalGenerated) / total}%`, background: seqColor(s.id) }} />
              </div>
              <span className="mono">
                {s.numTotalGenerated}/{s.maxTokens}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="engine-foot">
        <span>
          step <b>{e.stepCount}</b>
        </span>
        <span>
          running <b>{running.length}</b>/{CONFIG.maxBatchSize}
        </span>
        <span>
          waiting <b>{e.scheduler.waiting.length}</b>
        </span>
        <span>
          tokens <b>{e.tokens}</b>
        </span>
        <span>
          preemptions <b>{e.preemptions}</b>
        </span>
        {lastPreempt ? <span style={{ color: "var(--red)" }}>last preempted: {lastPreempt.text.split(" ")[0]}</span> : null}
      </figcaption>
    </figure>
  );
}
