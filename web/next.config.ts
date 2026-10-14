import type { NextConfig } from "next";

// A static export for GitHub Pages, served under /llm-inference-engine.
// The site has no server: the scheduler lab runs in the browser, and the
// playground calls the user's own mini-vLLM server directly.
const basePath = process.env.NEXT_BASE_PATH ?? "/llm-inference-engine";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
