// Public chat endpoint. Wires the real services into the tested pipeline in _shared/handler.ts.
// Deno runtime: this file is checked by `supabase functions deploy`, not by the local tsc.
// deno-lint-ignore-file no-explicit-any
declare const Supabase: any;
declare const Deno: any;

import { askClaude } from "../_shared/anthropic.ts";
import { bumpRate, insertLog, matchChunks, type SupabaseEnv } from "../_shared/db.ts";
import { handleChat, type Deps } from "../_shared/handler.ts";

const session = new Supabase.ai.Session("gte-small");

const env: SupabaseEnv = {
  url: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
};
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);

const corsHeaders = (origin: string | null) => ({
  "access-control-allow-origin": origin && allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? ""),
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  vary: "origin",
});

const deps: Deps = {
  embed: async (text) => Array.from((await session.run(text, { mean_pool: true, normalize: true })) as ArrayLike<number>),
  matchChunks: (embedding, k) => matchChunks(env, embedding, k),
  bumpRate: (key) => bumpRate(env, key),
  ask: (system, messages) => askClaude(Deno.env.get("ANTHROPIC_API_KEY") ?? "", system, messages),
  log: (row) => insertLog(env, row),
  chatEnabled: (Deno.env.get("CHAT_ENABLED") ?? "true") !== "false",
  salt: Deno.env.get("VISITOR_HASH_SALT") ?? "",
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  // Browsers from other origins are refused. Direct calls still hit the rate limits.
  if (origin && !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // handler returns a friendly 400
  }
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  try {
    const result = await handleChat({ ip, body }, deps);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("chat error", err instanceof Error ? err.message : "unknown");
    return new Response(JSON.stringify({ error: "server_error", message: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
});
