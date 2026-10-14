import type { Metadata } from "next";
import { SchedulerLab } from "@/components/SchedulerLab";

export const metadata: Metadata = { title: "Scheduler lab" };

export default function LabPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Scheduler lab</h1>
        <p>
          This is mini-vLLM&apos;s own scheduling code: the continuous-batching scheduler, the paged KV-cache block manager and the engine step, ported line by line to
          TypeScript. A test checks the port step by step against traces of the Python engine. Only the model is left out: each step, every running request gets one
          token.
        </p>
      </header>
      <SchedulerLab />
    </div>
  );
}
