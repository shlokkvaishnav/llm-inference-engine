"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import bench from "@/data/benchmarks.json";

const axis = { stroke: "var(--muted)", fontSize: 12 };
const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }, labelStyle: { color: "var(--ink)" } };

export function LoadThroughput() {
  return (
    <div className="chart-box" role="img" aria-label="Throughput rises with concurrency up to 8 requests, then stops growing">
      <ResponsiveContainer>
        <LineChart data={bench.load} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="concurrency" tick={axis} stroke="var(--line)" label={{ value: "Concurrent requests", position: "insideBottom", offset: -6, fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={axis} stroke="var(--line)" width={48} />
          <Tooltip {...tip} formatter={(v) => [`${Number(v).toFixed(1)} tok/s`, "Throughput"]} />
          <Line type="monotone" dataKey="tokensPerSecond" stroke="var(--amber)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--amber)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LoadLatency() {
  return (
    <div className="chart-box" role="img" aria-label="Time to first token stays low up to 8 requests and rises sharply at 16">
      <ResponsiveContainer>
        <LineChart data={bench.load} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="concurrency" tick={axis} stroke="var(--line)" label={{ value: "Concurrent requests", position: "insideBottom", offset: -6, fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={axis} stroke="var(--line)" width={48} tickFormatter={(v) => `${v}`} label={{ value: "ms", position: "insideTopLeft", offset: 0, fill: "var(--muted)", fontSize: 12 }} />
          <Tooltip {...tip} formatter={(v, n) => [`${v} ms`, n]} />
          <Legend verticalAlign="top" align="right" height={24} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
          <Line name="P50" dataKey="p50" stroke="var(--amber)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          <Line name="P95" dataKey="p95" stroke="var(--cyan)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} isAnimationActive={false} />
          <Line name="P99" dataKey="p99" stroke="var(--muted)" strokeWidth={2} strokeDasharray="2 4" dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function QuantBars({ field, unit }: { field: "sizeMB" | "tokensPerSecond"; unit: string }) {
  return (
    <div className="chart-box" style={{ height: "14rem" }} role="img" aria-label={field === "sizeMB" ? "Model size: fp16 1938 MB, INT8 971 MB, INT4 486 MB" : "Decode speed: fp16 150, INT8 42, INT4 22 tokens per second"}>
      <ResponsiveContainer>
        <BarChart data={bench.quantization} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" tick={axis} stroke="var(--line)" />
          <YAxis tick={axis} stroke="var(--line)" width={52} />
          <Tooltip {...tip} cursor={{ fill: "var(--surface-2)" }} formatter={(v) => [`${Number(v).toFixed(1)} ${unit}`, field === "sizeMB" ? "Size" : "Decode speed"]} />
          <Bar dataKey={field} fill={field === "sizeMB" ? "var(--cyan)" : "var(--amber)"} radius={[5, 5, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
