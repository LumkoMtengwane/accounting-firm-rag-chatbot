/** Helpers shared by the Node scripts. Values come from .env and are never printed. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { askClaude } from "../supabase/functions/_shared/anthropic.ts";
import { matchChunks, type SupabaseEnv } from "../supabase/functions/_shared/db.ts";
import { CONFIG } from "../supabase/functions/_shared/config.ts";
import { fetchJson } from "../supabase/functions/_shared/http.ts";
import type { Deps } from "../supabase/functions/_shared/handler.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Add it to .env (see .env.example).`);
  return v;
}

export const supabaseEnv = (): SupabaseEnv => ({
  url: requireEnv("SUPABASE_URL").replace(/\/$/, ""),
  serviceKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
});

/** Embed texts through the deployed embed function, in small batches. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const env = supabaseEnv();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += CONFIG.embedBatchSize) {
    const batch = texts.slice(i, i + CONFIG.embedBatchSize);
    const res = await fetchJson<{ embeddings: number[][] }>(
      `${env.url}/functions/v1/embed`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": requireEnv("ADMIN_KEY"),
          ...(process.env.SUPABASE_ANON_KEY ? { authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } : {}),
        },
        body: JSON.stringify({ texts: batch }),
      },
      { retries: 2, backoffMs: 1000, label: "embed function", timeoutMs: 60_000 },
    );
    out.push(...res.embeddings);
  }
  return out;
}

export function readDocs(): Array<{ file: string; markdown: string }> {
  const dir = join(ROOT, "data", "docs");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => ({ file, markdown: readFileSync(join(dir, file), "utf8") }));
}

export interface EvalQuestion {
  id: string;
  type: "answerable" | "unanswerable" | "conflict" | "advice" | "injection";
  question: string;
  expectedDocs?: string[];
  mustContain?: string[];
  mustNotContain?: string[];
  expectAbstain?: boolean;
  expectNeedsHuman?: boolean;
}

export const readEvalQuestions = (): EvalQuestion[] =>
  JSON.parse(readFileSync(join(ROOT, "data", "eval", "questions.json"), "utf8")).questions;

/** Real services without rate limits or logging, for the eval. Tracks token use. */
export function evalDeps(): { deps: Deps; usage: { tokensIn: number; tokensOut: number; calls: number } } {
  const env = supabaseEnv();
  const usage = { tokensIn: 0, tokensOut: 0, calls: 0 };
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const deps: Deps = {
    embed: async (text) => (await embedTexts([text]))[0],
    matchChunks: (embedding, k) => matchChunks(env, embedding, k),
    bumpRate: async () => 1,
    ask: async (system, messages) => {
      const r = await askClaude(apiKey, system, messages);
      usage.tokensIn += r.tokensIn;
      usage.tokensOut += r.tokensOut;
      usage.calls += 1;
      return r;
    },
    log: async () => undefined,
    chatEnabled: true,
    salt: "eval",
  };
  return { deps, usage };
}
