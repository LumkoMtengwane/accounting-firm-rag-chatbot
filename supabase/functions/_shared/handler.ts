/** The whole chat pipeline, with every outside call injected so it can be tested offline. */
import { enforceRules, parseModelAnswer, type RetrievedChunk } from "./answer.ts";
import { CONFIG, estimateCostUsd } from "./config.ts";
import { checkLimits, passesGate, visitorKey } from "./limits.ts";
import { buildMessages, buildSystem, cleanHistory, type ChatMessage } from "./prompt.ts";

export interface LogRow {
  visitor_hash: string;
  question: string;
  answer: string;
  confidence: string;
  needs_human: boolean;
  abstained: boolean;
  cited_chunks: number[];
  best_score: number | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export interface Deps {
  embed(text: string): Promise<number[]>;
  matchChunks(embedding: number[], k: number): Promise<RetrievedChunk[]>;
  /** Increments today's counter for the key and returns the new count. */
  bumpRate(key: string): Promise<number>;
  ask(system: string, messages: ChatMessage[]): Promise<{ input: unknown; tokensIn: number; tokensOut: number }>;
  log(row: LogRow): Promise<void>;
  chatEnabled: boolean;
  salt: string;
}

export interface ChatSource {
  docId: string;
  docTitle: string;
  docStatus: string;
  heading: string;
  snippet: string;
}

export interface ChatResponse {
  answer: string;
  confidence: string;
  needsHuman: boolean;
  abstained: boolean;
  sources: ChatSource[];
}

export interface HandlerResult {
  status: number;
  body: ChatResponse | { error: string; message: string };
}

const fail = (status: number, error: string, message: string): HandlerResult => ({ status, body: { error, message } });

export async function handleChat(input: { ip: string; body: unknown }, deps: Deps): Promise<HandlerResult> {
  if (!deps.chatEnabled) return fail(503, "paused", CONFIG.messages.paused);

  const body = (typeof input.body === "object" && input.body !== null ? input.body : {}) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return fail(400, "bad_request", "Please type a question.");
  if (question.length > CONFIG.maxQuestionChars) {
    return fail(400, "too_long", `Please keep your question under ${CONFIG.maxQuestionChars} characters.`);
  }

  const vhash = await visitorKey(input.ip, deps.salt);
  const visitorCount = await deps.bumpRate(`v:${vhash}`);
  if (checkLimits({ visitor: visitorCount }, { visitor: CONFIG.perVisitorDailyLimit, global: CONFIG.globalDailyLimit }) === "visitor") {
    return fail(429, "visitor_limit", CONFIG.messages.visitorLimit);
  }
  const globalCount = await deps.bumpRate("global");
  if (checkLimits({ visitor: visitorCount, global: globalCount }, { visitor: CONFIG.perVisitorDailyLimit, global: CONFIG.globalDailyLimit }) === "global") {
    return fail(429, "global_limit", CONFIG.messages.globalLimit);
  }

  const embedding = await deps.embed(question);
  const sources = await deps.matchChunks(embedding, CONFIG.topK);
  const bestScore = sources.length ? sources[0].similarity : null;

  const base = { visitor_hash: vhash, question, best_score: bestScore };
  const respond = async (
    answer: string,
    confidence: string,
    needsHuman: boolean,
    abstained: boolean,
    cited: RetrievedChunk[],
    tokensIn: number,
    tokensOut: number,
  ): Promise<HandlerResult> => {
    try {
      await deps.log({
        ...base,
        answer,
        confidence,
        needs_human: needsHuman,
        abstained,
        cited_chunks: cited.map((c) => c.id),
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: estimateCostUsd(tokensIn, tokensOut),
      });
    } catch {
      // Logging must never break the answer.
    }
    return {
      status: 200,
      body: {
        answer,
        confidence,
        needsHuman,
        abstained,
        sources: cited.map((c) => ({
          docId: c.doc_id,
          docTitle: c.doc_title,
          docStatus: c.doc_status,
          heading: c.heading,
          snippet: c.content.slice(0, 220),
        })),
      },
    };
  };

  // No AI call when nothing in the documents is close to the question.
  if (!passesGate(bestScore ?? undefined, CONFIG.minScore)) {
    return respond(CONFIG.messages.dontKnow, "none", true, true, [], 0, 0);
  }

  let result;
  try {
    result = await deps.ask(buildSystem(), buildMessages(question, sources, cleanHistory(body.history)));
  } catch {
    return respond(CONFIG.messages.couldNotAnswer, "none", true, true, [], 0, 0);
  }
  const parsed = parseModelAnswer(result.input);
  if (!parsed) return respond(CONFIG.messages.couldNotAnswer, "none", true, true, [], result.tokensIn, result.tokensOut);

  const final = enforceRules(parsed, sources, CONFIG.messages.dontKnow);
  return respond(final.answer, final.confidence, final.needsHuman, final.abstained, final.cited, result.tokensIn, result.tokensOut);
}
