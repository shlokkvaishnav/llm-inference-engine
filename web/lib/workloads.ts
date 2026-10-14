import type { Request } from "./sim";

type Workload = { label: string; numBlocks: number; blockSize: number; maxBatchSize: number; requests: Request[] };
const r = (arrival: number, promptTokens: number, maxTokens: number): Request => ({ arrival, promptTokens, maxTokens });

export const WORKLOADS: Record<string, Workload> = {
  mixed: { label: "Mixed lengths", numBlocks: 24, blockSize: 4, maxBatchSize: 4, requests: [r(0, 8, 6), r(0, 5, 12), r(0, 11, 4), r(1, 4, 9), r(2, 9, 5), r(3, 6, 14), r(4, 12, 3), r(5, 3, 7)] },
  tail: { label: "One long request, many short", numBlocks: 48, blockSize: 4, maxBatchSize: 4, requests: [r(0, 6, 40), r(0, 5, 4), r(0, 7, 4), r(0, 4, 5), r(2, 6, 4), r(3, 5, 3), r(5, 8, 4), r(6, 4, 5), r(8, 6, 3), r(10, 5, 4)] },
  burst: { label: "A burst arrives mid-run", numBlocks: 32, blockSize: 4, maxBatchSize: 4, requests: [r(0, 6, 10), r(0, 8, 8), r(0, 5, 12), r(6, 7, 6), r(6, 4, 9), r(6, 9, 5), r(6, 6, 7), r(6, 5, 4)] },
  pressure: { label: "Memory pressure (preemption)", numBlocks: 10, blockSize: 4, maxBatchSize: 4, requests: [r(0, 6, 12), r(0, 5, 14), r(0, 7, 10), r(0, 4, 9), r(2, 3, 6)] },
};

// A random but repeatable stream of requests for the hero animation.
export function randomWorkload(seed: number, count = 14): Request[] {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let t = 0;
  return Array.from({ length: count }, () => {
    t += rand() < 0.45 ? 0 : 1 + Math.floor(rand() * 3);
    return r(t, 3 + Math.floor(rand() * 10), 3 + Math.floor(rand() * (rand() < 0.2 ? 26 : 10)));
  });
}
