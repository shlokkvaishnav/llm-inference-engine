"use client";

import { useRef, useState } from "react";

type Lane = { i: number; t0: number; first: number | null; end: number | null; tokens: number; text: string; finish: string | null; error: string | null };

const PAGE_ORIGIN = "https://shlokkvaishnav.github.io";

async function stream(base: string, body: object, signal: AbortSignal, lane: Lane, update: () => void) {
  try {
    const res = await fetch(`${base}/v1/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const event = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        for (const line of event.split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          const chunk = JSON.parse(line.slice(6));
          const choice = chunk.choices?.[0];
          if (choice?.text) {
            lane.first ??= performance.now();
            lane.tokens += 1;
            lane.text += choice.text;
          }
          if (choice?.finish_reason) lane.finish = choice.finish_reason;
          if (chunk.usage) lane.tokens = chunk.usage.completion_tokens;
        }
      }
      update();
    }
  } catch (error) {
    const e = error as Error;
    lane.error = e.name === "AbortError" ? "stopped" : e.message;
  }
  lane.end = performance.now();
  update();
}

export function Playground() {
  const [base, setBase] = useState("http://localhost:8000");
  const [model, setModel] = useState<string | null>(null);
  const [conn, setConn] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "Not connected.", kind: "" });
  const [prompt, setPrompt] = useState("The three main ideas behind continuous batching are");
  const [copies, setCopies] = useState(4);
  const [maxTokens, setMaxTokens] = useState(48);
  const [temperature, setTemperature] = useState(0.8);
  const [topP, setTopP] = useState(0.95);
  const [stop, setStop] = useState("");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const controller = useRef<AbortController | null>(null);
  const url = base.replace(/\/+$/, "");

  const connect = async () => {
    setConn({ text: "Connecting…", kind: "" });
    try {
      const health = await fetch(`${url}/health`);
      if (!health.ok) throw new Error(`the health check returned ${health.status}`);
      const models = await (await fetch(`${url}/v1/models`)).json();
      setModel(models.data?.[0]?.id ?? "default");
      setConn({ text: `Connected to ${url}. Model: ${models.data?.[0]?.id ?? "default"}.`, kind: "ok" });
    } catch (error) {
      setModel(null);
      setConn({ text: `Could not connect (${(error as Error).message}). Check that the server runs and that MINI_VLLM_CORS_ORIGINS includes this page's address.`, kind: "err" });
    }
  };

  const send = async () => {
    const body = { model, prompt, max_tokens: maxTokens, temperature, top_p: topP, stream: true, ...(stop ? { stop } : {}) };
    controller.current = new AbortController();
    const t0 = performance.now();
    const live: Lane[] = Array.from({ length: copies }, (_, i) => ({ i, t0, first: null, end: null, tokens: 0, text: "", finish: null, error: null }));
    setLanes(live.map((l) => ({ ...l })));
    setBusy(true);
    setSummary(`Sending ${copies} request(s) at the same moment…`);
    const update = () => setLanes(live.map((l) => ({ ...l })));
    await Promise.all(live.map((lane) => stream(url, body, controller.current!.signal, lane, update)));
    const ok = live.filter((l) => !l.error);
    const ttfts = ok.filter((l) => l.first).map((l) => l.first! - l.t0).sort((a, b) => a - b);
    const wall = (Math.max(...live.map((l) => l.end!)) - t0) / 1000;
    const tokens = ok.reduce((n, l) => n + l.tokens, 0);
    setSummary(
      ok.length
        ? `${ok.length} of ${copies} finished: ${tokens} tokens in ${wall.toFixed(2)} s, ${(tokens / wall).toFixed(1)} tok/s overall. Median time to first token ${Math.round(ttfts[Math.floor(ttfts.length / 2)] ?? 0)} ms.`
        : `No request finished: ${live[0]?.error ?? "unknown error"}`,
    );
    setBusy(false);
  };

  const now = performance.now();
  const tMax = Math.max(1, ...lanes.map((l) => (l.end ?? now) - l.t0));

  return (
    <>
      <div className="grid-2" style={{ marginTop: "1.5rem", alignItems: "start" }}>
        <div className="panel">
          <b>1. Start the server</b>
          <pre style={{ marginTop: ".7rem" }}>
            <code>{`pip install -e .
MINI_VLLM_MODEL=gpt2 MINI_VLLM_DEVICE=cpu \\
MINI_VLLM_CORS_ORIGINS=${PAGE_ORIGIN} \\
uvicorn mini_vllm.api.server:app --port 8000`}</code>
          </pre>
          <p className="muted" style={{ fontSize: ".88rem", margin: 0 }}>
            <code>MINI_VLLM_CORS_ORIGINS</code> lets this page call your server. Your browser can ask for permission to reach a local address. Leave out the GPT-2 settings to
            serve TinyLlama on a GPU.
          </p>
        </div>
        <div className="panel">
          <b>2. Connect</b>
          <div className="controls" style={{ marginTop: ".7rem" }}>
            <input type="url" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Server address" style={{ flex: 1, minWidth: "12rem" }} />
            <button className="btn" type="button" onClick={connect}>Connect</button>
          </div>
          <p className={`status ${conn.kind}`} aria-live="polite">{conn.text}</p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1.2rem" }}>
        <b>3. Send</b>
        <label className="muted" style={{ display: "block", margin: ".7rem 0 .3rem", fontSize: ".9rem" }} htmlFor="prompt">Prompt</label>
        <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="controls" style={{ marginTop: ".8rem" }}>
          <label>Concurrent copies <input type="number" min={1} max={16} value={copies} onChange={(e) => setCopies(Math.min(16, Math.max(1, +e.target.value)))} /></label>
          <label>Max tokens <input type="number" min={1} max={512} value={maxTokens} onChange={(e) => setMaxTokens(+e.target.value)} /></label>
          <label>Temperature <input type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(+e.target.value)} /></label>
          <label>Top-p <input type="number" min={0.05} max={1} step={0.05} value={topP} onChange={(e) => setTopP(+e.target.value)} /></label>
          <label>Stop <input type="text" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="optional" size={8} /></label>
        </div>
        <div className="controls" style={{ marginTop: ".9rem" }}>
          <button className="btn btn-primary" type="button" disabled={!model || busy} onClick={send}>Send</button>
          <button className="btn" type="button" disabled={!busy} onClick={() => controller.current?.abort()}>Stop</button>
          {!model ? <span className="muted">Connect to a server first.</span> : null}
        </div>
        <p className="status" aria-live="polite">{summary}</p>
      </div>

      {lanes.length ? (
        <div className="panel" style={{ marginTop: "1.2rem" }}>
          <b>When each request got its tokens</b>
          <p className="muted" style={{ fontSize: ".85rem", margin: ".3rem 0 .6rem" }}>All requests were sent at the same moment. Grey: waiting for the first token. Amber: streaming.</p>
          {lanes.map((l) => {
            const first = (l.first ?? l.end ?? now) - l.t0;
            const end = (l.end ?? now) - l.t0;
            return (
              <div className="gbar" key={l.i}>
                <span>Req {l.i + 1}</span>
                <div className="gtrack">
                  <div className="w" style={{ left: 0, width: `${(100 * first) / tMax}%` }} />
                  <div className="g" style={{ left: `${(100 * first) / tMax}%`, width: `${(100 * Math.max(0, end - first)) / tMax}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: ".8rem", marginTop: "1.2rem" }}>
        {lanes.map((l) => {
          const gen = l.first ? ((l.end ?? now) - l.first) / 1000 : 0;
          return (
            <article className="req" key={l.i}>
              <header>
                <strong>Request {l.i + 1}</strong>
                <span>first token {l.first ? `${Math.round(l.first - l.t0)} ms` : "…"}</span>
                <span>{l.tokens} tokens</span>
                <span>{gen > 0 && l.tokens > 1 ? `${((l.tokens - 1) / gen).toFixed(1)} tok/s` : "…"}</span>
                <span>{l.error ? `error: ${l.error}` : l.end ? `finished: ${l.finish ?? "–"}` : "streaming…"}</span>
              </header>
              <p className="text"><span className="p">{prompt}</span>{l.text}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}
