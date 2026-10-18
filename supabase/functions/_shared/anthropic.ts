/** One Claude call that must return the answer_visitor tool. Plain fetch, no SDK. */
import { ANSWER_TOOL } from "./answer.ts";
import { CONFIG } from "./config.ts";
import { fetchJson } from "./http.ts";
import type { ChatMessage } from "./prompt.ts";

interface MessagesResponse {
  content: Array<{ type: string; input?: unknown }>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ClaudeResult {
  input: unknown;
  tokensIn: number;
  tokensOut: number;
}

export async function askClaude(apiKey: string, system: string, messages: ChatMessage[]): Promise<ClaudeResult> {
  const res = await fetchJson<MessagesResponse>(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.model,
        max_tokens: CONFIG.maxOutputTokens,
        thinking: { type: "disabled" },
        system,
        messages,
        tools: [ANSWER_TOOL],
        tool_choice: { type: "tool", name: ANSWER_TOOL.name },
      }),
    },
    { retries: 2, backoffMs: 800, label: "Claude" },
  );
  const block = res.content.find((b) => b.type === "tool_use");
  return { input: block?.input, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens };
}
