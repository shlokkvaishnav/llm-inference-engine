import { barChart, dataTable, lineChart, loadJson, showError } from './charts.js'

const $ = (id) => document.getElementById(id)
const one = (n) => n.toFixed(1)

try {
  const data = await loadJson('data/benchmarks.json')

  // Throughput against the baselines
  const maxTps = Math.max(...data.throughput.map((r) => r.tokensPerSecond))
  barChart($('chart-throughput'), {
    caption: 'Throughput in tokens per second',
    max: maxTps,
    items: data.throughput.map((r) => ({
      label: r.system,
      value: r.tokensPerSecond,
      text: `${one(r.tokensPerSecond)} tok/s`,
      muted: r.system.startsWith('Hugging Face'),
    })),
  })
  dataTable($('chart-throughput'), {
    caption: `8 prompts, 32 output tokens each (${data.hardware})`,
    columns: ['System', 'Tokens per second', 'Seconds', 'Peak GPU memory (MB)'],
    rows: data.throughput.map((r) => [r.system, one(r.tokensPerSecond), r.seconds, r.peakMemoryMB]),
  })

  // Concurrent load: throughput, then time to first token
  const xs = data.load.map((r) => r.concurrency)
  lineChart($('chart-load-throughput'), {
    series: [{ name: 'Throughput (tokens per second)', points: data.load.map((r) => ({ x: r.concurrency, y: r.tokensPerSecond })) }],
    xTicks: xs,
    xLabel: 'Concurrent requests',
    yLabel: 'Tokens per second',
    summary: 'Throughput rises with concurrency up to 8 requests, then stops growing.',
  })
  lineChart($('chart-load-ttft'), {
    series: [
      { name: 'P50', points: data.load.map((r) => ({ x: r.concurrency, y: r.p50 })) },
      { name: 'P95', points: data.load.map((r) => ({ x: r.concurrency, y: r.p95 })), dashed: true },
      { name: 'P99', points: data.load.map((r) => ({ x: r.concurrency, y: r.p99 })), dashed: true },
    ],
    xTicks: xs,
    xLabel: 'Concurrent requests',
    yLabel: 'Time to first token (ms)',
    summary: 'Time to first token stays low up to 8 requests and rises sharply at 16.',
  })
  dataTable($('chart-load-ttft'), {
    caption: 'Load test against the running server',
    columns: ['Concurrency', 'P50 TTFT (ms)', 'P95 TTFT (ms)', 'P99 TTFT (ms)', 'Tokens per second'],
    rows: data.load.map((r) => [r.concurrency, r.p50, r.p95, r.p99, one(r.tokensPerSecond)]),
  })

  // Quantization: size and speed
  barChart($('chart-quant-size'), {
    caption: 'Model size in megabytes',
    items: data.quantization.map((q) => ({ label: q.name, value: q.sizeMB, text: `${one(q.sizeMB)} MB` })),
  })
  barChart($('chart-quant-speed'), {
    caption: 'Decode speed in tokens per second',
    items: data.quantization.map((q) => ({ label: q.name, value: q.tokensPerSecond, text: `${one(q.tokensPerSecond)} tok/s`, muted: q.name !== 'fp16' })),
  })
  dataTable($('chart-quant-speed'), {
    caption: 'Weight-only symmetric per-channel quantization',
    columns: ['Weights', 'Size (MB)', 'Cosine similarity to fp16', 'Tokens per second'],
    rows: data.quantization.map((q) => [q.name, one(q.sizeMB), q.cosineSimilarity.toFixed(4), one(q.tokensPerSecond)]),
  })
} catch (error) {
  for (const id of ['chart-throughput', 'chart-load-throughput', 'chart-load-ttft', 'chart-quant-size', 'chart-quant-speed']) showError($(id), error)
}
