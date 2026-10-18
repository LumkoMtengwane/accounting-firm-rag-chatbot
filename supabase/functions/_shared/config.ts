/** Every tunable in one place. */
export const CONFIG = {
  firmName: "Marula Ridge Accountants",
  model: "claude-haiku-5-5",
  /** Chunks retrieved per question. 5 missed facts ranked 6th and 8th in the first eval, so 8. */
  topK: 8,
  /** Below this best-match cosine similarity we say "I don't know" without calling Claude. Tune with `npm run retrieval`. */
  minScore: 0.78,
  maxQuestionChars: 500,
  /** Previous messages (user and assistant) kept for follow-up questions. */
  maxHistoryMessages: 4,
  maxHistoryChars: 600,
  maxOutputTokens: 500,
  perVisitorDailyLimit: 20,
  globalDailyLimit: 200,
  /** Haiku 5.5 list price per million tokens, prompts up to 100K (same figures as the real estate project, checked 2026-10-15). */
  usdPerMIn: 0.1,
  usdPerMOut: 0.5,
  chunk: { maxChars: 1800 },
  embedBatchSize: 8,
  messages: {
    dontKnow:
      "I don't know the answer to that from our documents. A consultant can help. Please contact the office using the details on this page.",
    visitorLimit: "You have reached the daily limit for this demo. Please try again tomorrow.",
    globalLimit: "This demo has reached its daily limit. Please try again tomorrow.",
    paused: "The demo is paused right now. Please try again later.",
    couldNotAnswer: "I could not produce a reliable answer. A consultant can help. Please contact the office.",
  },
} as const;

export const estimateCostUsd = (tokensIn: number, tokensOut: number) =>
  (tokensIn * CONFIG.usdPerMIn + tokensOut * CONFIG.usdPerMOut) / 1_000_000;
