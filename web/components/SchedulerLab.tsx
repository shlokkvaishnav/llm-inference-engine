"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { seqColor } from "@/lib/colors";
import { Run, staticBatchingSteps } from "@/lib/sim";
import { WORKLOADS } from "@/lib/workloads";

type Cfg = { numBlocks: number; blockSize: number; maxBatchSize: number };

function fresh(key: string, cfg?: Cfg) {
  const w = WORKLOADS[key];
  return new Run(cfg ?? { numBlocks: w.numBlocks, blockSize: w.blockSize, maxBatchSize: w.maxBatchSize }, w.requests.map((r) => ({ ...r })));
}

export function SchedulerLab() {
  const [key, setKey] = useState("mixed");
  const [cfg, setCfg] = useState<Cfg>(() => ({ numBlocks: WORKLOADS.mixed.numBlocks, blockSize: WORKLOADS.mixed.blockSize, maxBatchSize: WORKLOADS.mixed.maxBatchSize }));
  const run = useRef<Run>(fresh("mixed"));
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [prompt, setPrompt] = useState(6);
  const [maxNew, setMaxNew] = useState(8);
  const [note, setNote] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const reset = (k = key, c = cfg) => {
    setPlaying(false);
    run.current = fresh(k, c);
    setNote("");
    tick();
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      run.current.step();
      if (run.current.done) setPlaying(false);
      tick();
    }, 1100 - 100 * speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  });

  const r = run.current;
  const e = r.engine;
  const bm = e.blockManager;
  const owner = new Map<number, number>();
  for (const s of e.sequences) for (const b of s.blockTable) owner.set(b, s.id);
  const steps = Math.max(1, ...[...r.history.values()].map((h) => h.length));
  const staticSteps = staticBatchingSteps(r.requests, e.scheduler.maxBatchSize);

  const pick = (k: string) => {
    const w = WORKLOADS[k];
    const c = { numBlocks: w.numBlocks, blockSize: w.blockSize, maxBatchSize: w.maxBatchSize };
    setKey(k);
    setCfg(c);
    reset(k, c);
  };
  const change = (patch: Partial<Cfg>) => {
    const c = { ...cfg, ...patch };
    setCfg(c);
    reset(key, c);
  };
  const add = () => {
    const cap = bm.numBlocks * bm.blockSize;
    if (prompt + maxNew > cap) return setNote(`That request needs ${prompt + maxNew} token slots; the pool has ${cap}.`);
    const id = r.add({ arrival: e.stepCount, promptTokens: prompt, maxTokens: maxNew });
    setNote(`Request #${id} arrives at step ${e.stepCount}.`);
    tick();
  };

  return (
    <>
      <div className="controls" style={{ marginTop: "1.5rem" }}>
        <label>
          Workload
          <select value={key} onChange={(ev) => pick(ev.target.value)}>
            {Object.entries(WORKLOADS).map(([k, w]) => (
              <option key={k} value={k}>{w.label}</option>
            ))}
          </select>
        </label>
        <label>KV blocks <input type="number" min={4} max={96} value={cfg.numBlocks} onChange={(ev) => change({ numBlocks: Math.max(4, +ev.target.value) })} /></label>
        <label>
          Block size
          <select value={cfg.blockSize} onChange={(ev) => change({ blockSize: +ev.target.value })}>
            {[2, 4, 8, 16].map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label>Max batch <input type="number" min={1} max={12} value={cfg.maxBatchSize} onChange={(ev) => change({ maxBatchSize: Math.max(1, +ev.target.value) })} /></label>
      </div>
      <div className="controls" style={{ marginTop: ".9rem" }}>
        <button className="btn btn-primary" type="button" onClick={() => (r.done ? (reset(), setPlaying(true)) : setPlaying((p) => !p))}>{playing ? "Pause" : r.done ? "Run again" : "Run"}</button>
        <button className="btn" type="button" disabled={r.done} onClick={() => { setPlaying(false); r.step(); tick(); }}>Step</button>
        <button className="btn" type="button" onClick={() => reset()}>Reset</button>
        <label>Speed <input type="range" min={1} max={10} value={speed} onChange={(ev) => setSpeed(+ev.target.value)} /></label>
      </div>

      <div className="counters">
        <div className="counter"><b>{e.stepCount}</b><span>steps</span></div>
        <div className="counter"><b>{e.tokens}</b><span>tokens generated</span></div>
        <div className="counter"><b>{owner.size} / {bm.numBlocks}</b><span>KV blocks in use</span></div>
        <div className="counter"><b style={e.preemptions ? { color: "var(--red)" } : undefined}>{e.preemptions}</b><span>preemptions</span></div>
      </div>

      <div className="lab">
        <div className="panel">
          <b>KV-cache block pool</b>
          <div className="pool" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(2.1rem, 1fr))", gap: 4 }} role="img" aria-label={`${owner.size} of ${bm.numBlocks} blocks in use`}>
            {Array.from({ length: bm.numBlocks }, (_, b) => {
              const id = owner.get(b);
              return id == null ? (
                <div key={b} className="cell free" title={`block ${b}: free`}>{b}</div>
              ) : (
                <div key={b} className="cell" style={{ background: seqColor(id) }} title={`block ${b}: request #${id}`}>#{id}</div>
              );
            })}
          </div>
          <div className="grid-2" style={{ marginTop: "1rem", gap: "1rem" }}>
            <div>
              <span className="muted" style={{ fontSize: ".85rem" }}>Waiting, first in line on the left</span>
              <ol className="chips">
                {e.scheduler.waiting.map((s) => (
                  <li key={s.id} className="chip" style={{ background: seqColor(s.id) }}>#{s.id} <small>{s.length} tok</small></li>
                ))}
              </ol>
            </div>
            <div>
              <span className="muted" style={{ fontSize: ".85rem" }}>Running batch</span>
              <ol className="chips">
                {e.scheduler.running.map((s) => (
                  <li key={s.id} className="chip" style={{ background: seqColor(s.id) }}>#{s.id} <small>{s.length} tok · {s.blockTable.length} blk</small></li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <div className="panel">
          <b>What the engine did</b>
          <div className="log mono" ref={logRef} aria-live="polite" style={{ marginTop: ".6rem" }}>
            {r.log.length === 0 ? <p className="muted">Press Run or Step.</p> : null}
            {r.log.map((l, i) => (
              <p key={i} className={`k-${l.kind}`}>step {l.step}: {l.text}</p>
            ))}
          </div>
        </div>
      </div>

      <h3>Timeline</h3>
      <div className="timeline" style={{ gridTemplateColumns: `2.6rem repeat(${steps}, minmax(.55rem, 1fr))` }}>
        {[...r.history.entries()].sort((a, b) => a[0] - b[0]).flatMap(([id, row]) => [
          <div key={`l${id}`} className="tl-label">#{id}</div>,
          ...Array.from({ length: steps }, (_, i) => {
            const st = row[i] ?? "none";
            return <div key={`${id}-${i}`} className={`tl ${st}`} style={st === "running" ? { background: seqColor(id) } : undefined} title={`#${id}, step ${i}: ${st}`} />;
          }),
        ])}
      </div>
      <p className="muted" style={{ fontSize: ".85rem" }}>Each row is a request, each column a step. Grey: waiting. Colour: running. Red: preempted.</p>

      {r.done ? (
        <p className="note">
          Continuous batching finished in <b>{e.stepCount}</b> steps. Static batching with the same batch size would take <b>{staticSteps}</b>: each batch waits for its
          longest request, and new requests wait for the whole batch. Static batching here has no memory limit, so this is its best case.
        </p>
      ) : null}

      <h3>Add a request</h3>
      <div className="controls">
        <label>Prompt tokens <input type="number" min={1} max={200} value={prompt} onChange={(ev) => setPrompt(Math.max(1, +ev.target.value))} /></label>
        <label>Max new tokens <input type="number" min={1} max={200} value={maxNew} onChange={(ev) => setMaxNew(Math.max(1, +ev.target.value))} /></label>
        <button className="btn" type="button" onClick={add}>Add request</button>
        {note ? <span className="muted">{note}</span> : null}
      </div>
    </>
  );
}
