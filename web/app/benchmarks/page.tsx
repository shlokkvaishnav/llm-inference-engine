import type { Metadata } from "next";
import { LoadLatency, LoadThroughput, QuantBars } from "@/components/BenchCharts";
import bench from "@/data/benchmarks.json";

export const metadata: Metadata = { title: "Benchmarks" };

export default function BenchmarksPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Benchmarks</h1>
        <p>
          {bench.hardware}. Last run {bench.lastRun}. The numbers are the same as the README results tables, and the scripts are in <code>benchmarks/</code>.
        </p>
      </header>

      <section className="block" style={{ borderTop: 0, paddingTop: 0 }}>
        <h2>Throughput against Hugging Face</h2>
        <p className="lead">8 prompts, 32 new tokens each. Compare rows within one run: the Hugging Face baselines moved by about 15% between the last two runs.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th scope="col">System</th><th scope="col">Tokens per second</th><th scope="col">Seconds</th><th scope="col">Peak GPU memory</th></tr>
            </thead>
            <tbody>
              {bench.throughput.map((r) => (
                <tr key={r.system}>
                  <th scope="row" style={{ fontWeight: r.system.startsWith("mini") ? 600 : 400 }}>{r.system}</th>
                  <td>{r.tokensPerSecond.toFixed(1)}</td>
                  <td>{r.seconds.toFixed(2)}</td>
                  <td>{r.peakMemoryMB.toLocaleString("en")} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <h2>Under concurrent load</h2>
        <p className="lead">A load test against the running server, warmed up first. The server&apos;s default maximum batch size is 8.</p>
        <div className="grid-2">
          <div className="panel"><b>Throughput</b><LoadThroughput /><p className="muted" style={{ fontSize: ".88rem", margin: 0 }}>Rises up to 8 concurrent requests, then stops growing.</p></div>
          <div className="panel"><b>Time to first token</b><LoadLatency /><p className="muted" style={{ fontSize: ".88rem", margin: 0 }}>Low up to 8 requests. At 16, requests queue and it rises sharply.</p></div>
        </div>
      </section>

      <section className="block">
        <h2>Quantization: smaller, but slower</h2>
        <p className="lead">
          Weight-only, symmetric, per channel. INT8 halves the size and INT4 cuts it to a quarter, at a cosine similarity of 1.0000 and 0.9785 to fp16. Decode is
          slower, because the weights are converted back to fp16 before each matrix multiplication. A real speed-up needs a fused low-precision kernel, which is not
          implemented.
        </p>
        <div className="grid-2">
          <div className="panel"><b>Model size (MB)</b><QuantBars field="sizeMB" unit="MB" /></div>
          <div className="panel"><b>Decode speed (tokens per second)</b><QuantBars field="tokensPerSecond" unit="tok/s" /></div>
        </div>
      </section>

      <section className="block">
        <h2>What these numbers do not show</h2>
        <ul className="prose bullets">
          <li>All results come from one GPU and one small model, TinyLlama-1.1B.</li>
          <li>The decode path still loops over the model&apos;s 22 layers in Python, and prefill uses the dense Hugging Face forward pass. Neither is profiled yet.</li>
          <li>The comparison with vLLM itself is opt-in in the benchmark script, and it was not run.</li>
        </ul>
      </section>
    </div>
  );
}
