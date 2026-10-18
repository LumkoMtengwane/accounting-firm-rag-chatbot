/** Minimal Supabase REST helpers (PostgREST) using the service role key. No SDK. */
import type { RetrievedChunk } from "./answer.ts";
import { fetchJson } from "./http.ts";
import type { LogRow } from "./handler.ts";

export interface SupabaseEnv {
  url: string;
  serviceKey: string;
}

const headers = (env: SupabaseEnv, extra: Record<string, string> = {}) => ({
  apikey: env.serviceKey,
  authorization: `Bearer ${env.serviceKey}`,
  "content-type": "application/json",
  ...extra,
});

/** pgvector accepts '[0.1,0.2,...]'. */
export const vectorLiteral = (v: number[]) => `[${v.join(",")}]`;

async function rpc<T>(env: SupabaseEnv, fn: string, args: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(
    `${env.url}/rest/v1/rpc/${fn}`,
    { method: "POST", headers: headers(env), body: JSON.stringify(args) },
    { retries: 2, backoffMs: 500, label: `Supabase ${fn}` },
  );
}

export const matchChunks = (env: SupabaseEnv, embedding: number[], k: number) =>
  rpc<RetrievedChunk[]>(env, "match_chunks", { query_embedding: vectorLiteral(embedding), match_count: k });

export const bumpRate = (env: SupabaseEnv, key: string) => rpc<number>(env, "bump_rate", { p_key: key });

async function write(env: SupabaseEnv, path: string, init: RequestInit, label: string): Promise<Response> {
  const res = await fetch(`${env.url}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${label} failed with ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function insertRows(env: SupabaseEnv, table: string, rows: unknown[], returning = false) {
  const res = await write(
    env,
    table,
    {
      method: "POST",
      headers: headers(env, { prefer: returning ? "return=representation" : "return=minimal" }),
      body: JSON.stringify(rows),
    },
    `Insert into ${table}`,
  );
  return returning ? ((await res.json()) as Array<Record<string, unknown>>) : [];
}

/** Delete every row of a table (PostgREST needs a filter, so match all ids). */
export async function clearTable(env: SupabaseEnv, table: string, idColumn: string) {
  await write(env, `${table}?${idColumn}=not.is.null`, { method: "DELETE", headers: headers(env) }, `Clear ${table}`);
}

export const insertLog = (env: SupabaseEnv, row: LogRow) => insertRows(env, "chat_logs", [row]).then(() => undefined);
