/** Runs the full chat pipeline against data/eval/questions.json and scores it. Costs a few cents at most. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG, estimateCostUsd } from "../supabase/functions/_shared/config.ts";
import { handleChat, type ChatResponse } from "../supabase/functions/_shared/handler.ts";
import { ROOT, evalDeps, readEvalQuestions, type EvalQuestion } from "./lib.ts";

const { deps, usage } = evalDeps();
const questions = readEvalQuestions();

const has = (text: string, needles: string[]) => needles.some((n) => text.toLowerCase().includes(n.toLowerCase()));
/** A forbidden string is fine when the answer clearly labels it as old. */
const looksArchived = (text: string) => /archiv|previous|old |no longer|superseded|replaced/i.test(text);

function judge(q: EvalQuestion, r: ChatResponse): string[] {
  const problems: string[] = [];
  const text = r.answer;
  if (q.type === "answerable" || q.type === "conflict") {
    if (r.abstained) problems.push("abstained");
    if (q.mustContain && !has(text, q.mustContain)) problems.push(`missing one of: ${q.mustContain.join(" | ")}`);
    if (q.expectedDocs && !r.abstained && !r.sources.some((s) => q.expectedDocs!.includes(`${s.docId}.md`))) {
      problems.push(`cited the wrong documents (${r.sources.map((s) => s.docId).join(", ")})`);
    }
  }
  if (q.expectAbstain && !r.abstained) problems.push("should have said I don't know");
  if (q.expectNeedsHuman && !r.needsHuman) problems.push("should have flagged for a human");
  if (q.mustNotContain && has(text, q.mustNotContain) && !looksArchived(text)) problems.push(`contains forbidden: ${q.mustNotContain.join(" | ")}`);
  if (q.type === "answerable" && !r.abstained && r.sources.length === 0) problems.push("answer without citations");
  return problems;
}

const results: Array<{ id: string; type: string; ok: boolean; problems: string[]; answer: string; confidence: string; needsHuman: boolean; abstained: boolean; sources: string[] }> = [];
for (const q of questions) {
  const res = await handleChat({ ip: "eval", body: { question: q.question } }, deps);
  if (res.status !== 200 || !("answer" in res.body)) {
    results.push({ id: q.id, type: q.type, ok: false, problems: [`HTTP ${res.status}`], answer: "", confidence: "", needsHuman: false, abstained: false, sources: [] });
    continue;
  }
  const r = res.body;
  const problems = judge(q, r);
  results.push({
    id: q.id, type: q.type, ok: problems.length === 0, problems, answer: r.answer, confidence: r.confidence,
    needsHuman: r.needsHuman, abstained: r.abstained, sources: r.sources.map((s) => `${s.docTitle} > ${s.heading}`),
  });
  console.log(`${problems.length ? "FAIL" : "ok  "} ${q.id} [${r.confidence}${r.needsHuman ? ", human" : ""}${r.abstained ? ", IDK" : ""}] ${problems.join("; ")}`);
}

const types = [...new Set(results.map((r) => r.type))];
console.log("\nBy type:");
for (const t of types) {
  const rs = results.filter((r) => r.type === t);
  console.log(`  ${t}: ${rs.filter((r) => r.ok).length}/${rs.length}`);
}
const cost = estimateCostUsd(usage.tokensIn, usage.tokensOut);
const asked = usage.calls || 1;
console.log(`\nTotal: ${results.filter((r) => r.ok).length}/${results.length} passed`);
console.log(`Claude calls: ${usage.calls}, tokens in/out: ${usage.tokensIn}/${usage.tokensOut}, cost ~ $${cost.toFixed(4)} (about $${(cost / asked).toFixed(5)} per call that reached Claude)`);
console.log(`minScore ${CONFIG.minScore}, model ${CONFIG.model}`);

writeFileSync(join(ROOT, "data", "eval", "last-run.json"), JSON.stringify({ date: new Date().toISOString(), minScore: CONFIG.minScore, model: CONFIG.model, usage, cost, results }, null, 2));
