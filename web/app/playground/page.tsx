import type { Metadata } from "next";
import { Playground } from "@/components/Playground";

export const metadata: Metadata = { title: "Playground" };

export default function PlaygroundPage() {
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Playground</h1>
        <p>
          The engine needs a GPU, or a CPU with GPT-2, so this page cannot run the model itself. Start the server on your machine, connect, and send several requests
          at once. Each request streams on its own lane, and you can see continuous batching in the time to first token.
        </p>
      </header>
      <Playground />
    </div>
  );
}
