import Link from "next/link";
import { EngineVisual } from "@/components/EngineVisual";
import { REPO } from "@/components/Shell";
import bench from "@/data/benchmarks.json";

const STEPS = [
  { title: "API", text: "FastAPI takes an OpenAI-style request and streams tokens back over server-sent events." },
  { title: "Scheduler", text: "Every step, it admits waiting requests first-come, first-served, and preempts the newest one if memory runs out." },
  { title: "Block manager", text: "It gives each request a table of fixed-size KV-cache blocks from one shared pool, like pages of virtual memory." },
  { title: "Runner", text: "One batched forward pass per layer for the whole running batch, with a Triton paged-attention kernel on CUDA." },
  { title: "Stream", text: "Each new token goes back to its request. Finished requests free their blocks for the next ones." },
];

export default function Home() {
  const rows = bench.throughput;
  const max = Math.max(...rows.map((r) => r.tokensPerSecond));
  const naive = rows.find((r) => r.system.includes("naive"))!.tokensPerSecond;
  const ours = rows.find((r) => r.system.includes("batch size 8"))!.tokensPerSecond;

  return (
    <>
      <div className="wrap hero">
        <div>
          <h1>Serve many prompts at once, without wasting GPU memory.</h1>
          <p className="lede">
            mini-vLLM is an LLM inference engine built from scratch: continuous batching, a paged KV-cache and an OpenAI-compatible API, checked token for token
            against Hugging Face. The panel is its real scheduler, running in your browser.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/lab/">
              Open the scheduler lab
            </Link>
            <Link className="btn" href="/playground/">
              Stream from your server
            </Link>
          </div>
        </div>
        <EngineVisual />
      </div>

      <section className="block">
        <div className="wrap">
          <h2>{(ours / naive).toFixed(1)}× the throughput of one-at-a-time generation</h2>
          <p className="lead">
            8 prompts, 32 new tokens each, TinyLlama-1.1B in fp16 on a Kaggle T4. With all 8 prompts in one batch, mini-vLLM matches batched Hugging Face within
            run-to-run noise; the gain over calling <code>generate()</code> once per prompt comes from batching.
          </p>
          <div className="compare">
            {rows.map((r) => (
              <div className="cmp-row" key={r.system}>
                <div className="cmp-label">
                  {r.system}
                  <small>
                    {r.seconds.toFixed(2)} s · peak {r.peakMemoryMB.toLocaleString("en")} MB
                  </small>
                </div>
                <div className="cmp-bar" aria-hidden="true">
                  <span className={r.system.startsWith("mini-vLLM") ? "ours" : ""} style={{ width: `${(100 * r.tokensPerSecond) / max}%` }} />
                </div>
                <div className="cmp-val">{r.tokensPerSecond.toFixed(0)} tok/s</div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: ".88rem", marginTop: "1rem" }}>
            Last run {bench.lastRun}. <Link href="/benchmarks/">All benchmarks</Link>, including the concurrent load test and quantization.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <h2>How a request moves through the engine</h2>
          <p className="lead">Five parts, each tested on its own and together.</p>
          <ol className="path">
            {STEPS.map((s) => (
              <li key={s.title}>
                <b>{s.title}</b>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="block">
        <div className="wrap grid-2">
          <div>
            <h2>Checked, not assumed</h2>
            <p className="lead" style={{ marginBottom: 0 }}>
              Every decode path is compared token for token with Hugging Face transformers. All 50 tests pass on the GPU. The scheduler you see on this site is
              checked step by step against traces of the Python engine.
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Suite</th>
                  <th scope="col">Tests</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Dense runner against <code>generate()</code></td><td>3 of 3</td></tr>
                <tr><td>Block manager, scheduler, paged attention</td><td>23 of 23</td></tr>
                <tr><td>Paged runner on a real model (GPU)</td><td>4 of 4</td></tr>
                <tr><td>Quantization error bounds</td><td>6 of 6</td></tr>
                <tr><td>API server</td><td>8 of 8</td></tr>
                <tr><td>Engine robustness (preemption, aborts)</td><td>6 of 6</td></tr>
                <tr><td>This site&apos;s scheduler port against Python</td><td>5 of 5</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <h2>Try it</h2>
          <div className="grid-2">
            <Link href="/lab/" className="panel" style={{ textDecoration: "none" }}>
              <b>Scheduler lab</b>
              <p className="muted" style={{ margin: ".4rem 0 0" }}>Step through admission, block allocation and preemption under memory pressure. Add your own requests.</p>
            </Link>
            <Link href="/docs/" className="panel" style={{ textDecoration: "none" }}>
              <b>Run it locally</b>
              <p className="muted" style={{ margin: ".4rem 0 0" }}>Install, start the server with GPT-2 on a CPU or TinyLlama on a GPU, and call the API.</p>
            </Link>
          </div>
          <p className="muted" style={{ marginTop: "1.2rem" }}>
            Source code and the full results: <a href={REPO}>github.com/shlokkvaishnav/llm-inference-engine</a>
          </p>
        </div>
      </section>
    </>
  );
}
