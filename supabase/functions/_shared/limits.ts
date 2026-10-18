/** Retrieval gate and rate-limit helpers. Pure code. */

/** Answer only when the best retrieved chunk is similar enough to the question. */
export const passesGate = (topScore: number | undefined, minScore: number) =>
  typeof topScore === "number" && Number.isFinite(topScore) && topScore >= minScore;

export type LimitResult = "ok" | "visitor" | "global";

export function checkLimits(
  counts: { visitor: number; global?: number },
  limits: { visitor: number; global: number },
): LimitResult {
  if (counts.visitor > limits.visitor) return "visitor";
  if (counts.global !== undefined && counts.global > limits.global) return "global";
  return "ok";
}

/** Hash the visitor's IP with a secret salt. The raw IP is never stored. */
export async function visitorKey(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
