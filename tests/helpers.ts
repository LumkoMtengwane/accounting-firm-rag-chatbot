import type { RetrievedChunk } from "../supabase/functions/_shared/answer.ts";
import type { Deps, LogRow } from "../supabase/functions/_shared/handler.ts";

export const chunk = (n: number, over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  id: n,
  doc_id: `doc-${n}`,
  doc_title: `Document ${n}`,
  doc_status: "current",
  heading: `Heading ${n}`,
  content: `Content of chunk ${n}.`,
  similarity: 0.9 - n * 0.01,
  ...over,
});

export function fakeDeps(over: Partial<Deps> = {}): { deps: Deps; logs: LogRow[]; calls: { ask: number; rates: string[] } } {
  const logs: LogRow[] = [];
  const calls = { ask: 0, rates: [] as string[] };
  const counters = new Map<string, number>();
  const deps: Deps = {
    embed: async () => [0.1, 0.2],
    matchChunks: async () => [chunk(1), chunk(2), chunk(3)],
    bumpRate: async (key) => {
      calls.rates.push(key);
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      return n;
    },
    ask: async () => {
      calls.ask++;
      return {
        input: { can_answer: true, answer: "Seven days.", citations: [1], confidence: "high", needs_human: false, reason: "stated" },
        tokensIn: 2000,
        tokensOut: 100,
      };
    },
    log: async (row) => {
      logs.push(row);
    },
    chatEnabled: true,
    salt: "test-salt",
    ...over,
  };
  return { deps, logs, calls };
}
