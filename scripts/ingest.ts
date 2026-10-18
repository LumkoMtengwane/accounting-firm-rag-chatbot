/** Read data/docs, chunk, embed and load into Supabase. Safe to re-run: it replaces everything. */
import { parseDoc, embedInput } from "../supabase/functions/_shared/chunk.ts";
import { CONFIG } from "../supabase/functions/_shared/config.ts";
import { clearTable, insertRows, vectorLiteral } from "../supabase/functions/_shared/db.ts";
import { embedTexts, readDocs, supabaseEnv } from "./lib.ts";

const env = supabaseEnv();
const docs = readDocs().map((d) => parseDoc(d.file, d.markdown, CONFIG.chunk.maxChars));

const inputs = docs.flatMap((d) => d.chunks.map((c) => ({ doc: d, chunk: c, text: embedInput(d, c) })));
console.log(`${docs.length} documents, ${inputs.length} chunks. Embedding...`);
const vectors = await embedTexts(inputs.map((i) => i.text));
if (vectors.length !== inputs.length || vectors.some((v) => v.length !== 384)) {
  throw new Error("Unexpected embedding size (expected 384 numbers per chunk).");
}

await clearTable(env, "documents", "id"); // cascades to chunks
await insertRows(
  env,
  "documents",
  docs.map((d) => ({ id: d.id, title: d.title, status: d.status, source_file: d.sourceFile })),
);
const rows = inputs.map((inp, i) => ({
  doc_id: inp.doc.id,
  ord: inp.chunk.ord,
  heading: inp.chunk.heading,
  content: inp.chunk.content,
  embedding: vectorLiteral(vectors[i]),
}));
for (let i = 0; i < rows.length; i += 40) await insertRows(env, "chunks", rows.slice(i, i + 40));
console.log(`Loaded ${docs.length} documents and ${rows.length} chunks.`);
