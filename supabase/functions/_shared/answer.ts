/** The structured answer Claude returns, plus the rules code enforces on it. */

export const CONFIDENCE = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export interface RetrievedChunk {
  id: number;
  doc_id: string;
  doc_title: string;
  doc_status: string;
  heading: string;
  content: string;
  similarity: number;
}

export interface ModelAnswer {
  canAnswer: boolean;
  answer: string;
  citations: number[];
  confidence: Confidence;
  needsHuman: boolean;
  reason: string;
}

export const ANSWER_TOOL = {
  name: "answer_visitor",
  description: "Return the answer for the website visitor, based only on the sources.",
  input_schema: {
    type: "object",
    properties: {
      can_answer: { type: "boolean", description: "False if the sources do not contain the answer." },
      answer: { type: "string", description: "Short plain answer. If can_answer is false, one sentence saying so." },
      citations: { type: "array", items: { type: "integer" }, description: "Source numbers used, for example [1, 3]." },
      confidence: { type: "string", enum: [...CONFIDENCE] },
      needs_human: { type: "boolean", description: "True when a consultant should review this." },
      reason: { type: "string", description: "One short sentence on why, for the logs." },
    },
    required: ["can_answer", "answer", "citations", "confidence", "needs_human", "reason"],
  },
} as const;

/** Validate untrusted model output. Returns null when it does not fit the schema. */
export function parseModelAnswer(input: unknown): ModelAnswer | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.answer !== "string") return null;
  if (!Array.isArray(o.citations) || !o.citations.every((n) => Number.isInteger(n))) return null;
  if (!CONFIDENCE.includes(o.confidence as Confidence)) return null;
  if (typeof o.needs_human !== "boolean") return null;
  // Haiku sometimes omits can_answer. When it is missing, infer it from the citations
  // (enforceRules still demands at least one valid citation). A wrong type is still rejected.
  if (o.can_answer !== undefined && typeof o.can_answer !== "boolean") return null;
  const canAnswer = o.can_answer ?? (o.citations as number[]).length > 0;
  return {
    canAnswer,
    answer: o.answer.trim(),
    citations: o.citations as number[],
    confidence: o.confidence as Confidence,
    needsHuman: o.needs_human,
    reason: typeof o.reason === "string" ? o.reason : "",
  };
}

export interface FinalAnswer {
  answer: string;
  confidence: Confidence | "none";
  needsHuman: boolean;
  abstained: boolean;
  /** Chunks actually cited, in citation order. */
  cited: RetrievedChunk[];
}

/**
 * Rules the model must not be able to talk itself out of:
 * - citations must point at sources that were really retrieved (1 to N);
 * - an answer with no valid citation is not allowed, so it becomes "I don't know";
 * - low confidence always goes to a human.
 */
export function enforceRules(model: ModelAnswer, sources: RetrievedChunk[], dontKnow: string): FinalAnswer {
  const seen = new Set<number>();
  const cited: RetrievedChunk[] = [];
  for (const n of model.citations) {
    if (n >= 1 && n <= sources.length && !seen.has(n)) {
      seen.add(n);
      cited.push(sources[n - 1]);
    }
  }
  if (!model.canAnswer || cited.length === 0 || !model.answer) {
    return { answer: dontKnow, confidence: "none", needsHuman: true, abstained: true, cited: [] };
  }
  return {
    answer: model.answer,
    confidence: model.confidence,
    needsHuman: model.needsHuman || model.confidence === "low",
    abstained: false,
    cited,
  };
}
