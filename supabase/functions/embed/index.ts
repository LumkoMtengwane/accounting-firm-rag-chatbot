// Embeds text with Supabase's built-in gte-small model (384 dimensions, English).
// Used by the ingest script and the retrieval/eval scripts. Protected by ADMIN_KEY.
// Deno runtime: this file is checked by `supabase functions deploy`, not by the local tsc.
// deno-lint-ignore-file no-explicit-any
declare const Supabase: any;
declare const Deno: any;

const session = new Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  const adminKey = Deno.env.get("ADMIN_KEY");
  if (!adminKey || req.headers.get("x-admin-key") !== adminKey) {
    return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let texts: unknown;
  try {
    ({ texts } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 16 || !texts.every((t) => typeof t === "string")) {
    return new Response(JSON.stringify({ error: "texts must be 1 to 16 strings" }), { status: 400 });
  }

  const embeddings: number[][] = [];
  for (const text of texts as string[]) {
    const out = await session.run(text.slice(0, 8000), { mean_pool: true, normalize: true });
    embeddings.push(Array.from(out as ArrayLike<number>));
  }
  return new Response(JSON.stringify({ embeddings }), { headers: { "content-type": "application/json" } });
});
