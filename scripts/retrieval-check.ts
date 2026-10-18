/** Retrieval only, no Claude call. Shows whether the right document is in the top 5 and helps tune minScore. */
import { CONFIG } from "../supabase/functions/_shared/config.ts";
import { matchChunks } from "../supabase/functions/_shared/db.ts";
import { embedTexts, readEvalQuestions, supabaseEnv } from "./lib.ts";

const env = supabaseEnv();
const questions = readEvalQuestions();
const vectors = await embedTexts(questions.map((q) => q.question));

let withDocs = 0;
let hits = 0;
const topAnswerable: number[] = [];
const topUnanswerable: number[] = [];

for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  const chunks = await matchChunks(env, vectors[i], CONFIG.topK);
  const top = chunks[0]?.similarity ?? 0;
  const found = q.expectedDocs ? chunks.some((c) => q.expectedDocs!.includes(`${c.doc_id}.md`)) : null;
  if (q.expectedDocs) {
    withDocs++;
    if (found) hits++;
    if (q.type === "answerable" || q.type === "conflict") topAnswerable.push(top);
  }
  if (q.type === "unanswerable") topUnanswerable.push(top);
  const flag = found === null ? "  -  " : found ? " HIT " : " MISS";
  console.log(`${q.id} ${flag} top=${top.toFixed(3)} ${chunks[0]?.doc_id ?? "-"} | ${q.question.slice(0, 60)}`);
}

console.log(`\nRetrieval hit rate (right doc in top ${CONFIG.topK}): ${hits}/${withDocs}`);
if (topAnswerable.length) console.log(`Lowest top score on answerable questions: ${Math.min(...topAnswerable).toFixed(3)}`);
if (topUnanswerable.length) console.log(`Highest top score on unanswerable questions: ${Math.max(...topUnanswerable).toFixed(3)}`);
console.log(`Current minScore: ${CONFIG.minScore}`);
