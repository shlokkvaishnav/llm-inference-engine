import type { Metadata } from "next";
import { REPO } from "@/components/Shell";

export const metadata: Metadata = { title: "Docs" };

const CONFIG = [
  ["MINI_VLLM_MODEL", "TinyLlama/TinyLlama-1.1B-Chat-v1.0", "Hugging Face model name or local path"],
  ["MINI_VLLM_DEVICE", "cuda if available, else cpu", "Device to run on"],
  ["MINI_VLLM_MAX_BATCH_SIZE", "8", "Maximum requests decoded together"],
  ["MINI_VLLM_NUM_BLOCKS", "512", "KV-cache blocks in the pool (paged runner only)"],
  ["MINI_VLLM_BLOCK_SIZE", "16", "Token slots per block (paged runner only)"],
  ["MINI_VLLM_CORS_ORIGINS", "none", "Browser origins allowed to call the API, for example this site"],
];

export default function DocsPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Run it locally</h1>
        <p>Install the engine, start the server, and call the OpenAI-compatible API.</p>
      </header>
      <div className="prose" style={{ maxWidth: "48rem" }}>
        <h2 style={{ fontSize: "1.3rem" }}>Install</h2>
        <pre><code>{`git clone ${REPO}.git
cd llm-inference-engine
pip install -e ".[dev]"`}</code></pre>

        <h2 style={{ fontSize: "1.3rem", marginTop: "2rem" }}>Start the server</h2>
        <pre><code>{`# GPT-2 on a CPU, for a laptop
MINI_VLLM_MODEL=gpt2 MINI_VLLM_DEVICE=cpu uvicorn mini_vllm.api.server:app --port 8000

# TinyLlama on a GPU, with the paged runner and the Triton kernel
uvicorn mini_vllm.api.server:app --port 8000`}</code></pre>
        <p>The paged runner is used for Llama-family models on CUDA. Other models use the dense runner.</p>

        <h2 style={{ fontSize: "1.3rem", marginTop: "2rem" }}>Call the API</h2>
        <pre><code>{`curl http://localhost:8000/v1/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt2", "prompt": "The capital of France is", "max_tokens": 16, "temperature": 0}'`}</code></pre>
        <p>
          Set <code>&quot;stream&quot;: true</code> for server-sent events. Fields: <code>max_tokens</code>, <code>temperature</code>, <code>top_p</code>, <code>top_k</code>,{" "}
          <code>stop</code>, <code>stream</code>. A list of prompts returns one choice per prompt. <code>GET /v1/models</code> lists the model and{" "}
          <code>GET /health</code> reports its status.
        </p>

        <h2 style={{ fontSize: "1.3rem", marginTop: "2rem" }}>Configuration</h2>
      </div>
      <div className="table-wrap" style={{ maxWidth: "56rem" }}>
        <table>
          <thead><tr><th scope="col">Variable</th><th scope="col">Default</th><th scope="col">Meaning</th></tr></thead>
          <tbody>
            {CONFIG.map(([k, d, m]) => (
              <tr key={k}><td><code>{k}</code></td><td>{d}</td><td>{m}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prose" style={{ maxWidth: "48rem" }}>
        <h2 style={{ fontSize: "1.3rem", marginTop: "2rem" }}>Tests</h2>
        <pre><code>{`pytest tests/ -v              # CPU subset; GPU-only tests skip without CUDA
cd web && npm test           # the site's scheduler port against the Python engine`}</code></pre>
        <p>
          Docker: <code>docker compose up api</code> (GPU) or <code>docker compose up api-cpu</code>. The full README is on <a href={REPO}>GitHub</a>.
        </p>
      </div>
    </div>
  );
}
