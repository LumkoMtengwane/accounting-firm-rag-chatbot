import { describe, expect, it } from "vitest";
import { enforceRules, parseModelAnswer } from "../supabase/functions/_shared/answer.ts";
import { checkLimits, passesGate, visitorKey } from "../supabase/functions/_shared/limits.ts";
import { buildMessages, cleanHistory } from "../supabase/functions/_shared/prompt.ts";
import { chunk } from "./helpers.ts";

const good = { can_answer: true, answer: "Yes.", citations: [1, 2], confidence: "high", needs_human: false, reason: "r" };

describe("parseModelAnswer", () => {
  it("accepts a valid answer and rejects bad shapes", () => {
    expect(parseModelAnswer(good)?.citations).toEqual([1, 2]);
    expect(parseModelAnswer(null)).toBeNull();
    expect(parseModelAnswer({ ...good, confidence: "certain" })).toBeNull();
    expect(parseModelAnswer({ ...good, citations: ["1"] })).toBeNull();
    expect(parseModelAnswer({ ...good, can_answer: "yes" })).toBeNull();
  });

  it("infers can_answer when the model leaves it out", () => {
    const { can_answer: _omit, ...withoutFlag } = good;
    expect(parseModelAnswer(withoutFlag)?.canAnswer).toBe(true);
    expect(parseModelAnswer({ ...withoutFlag, citations: [] })?.canAnswer).toBe(false);
  });
});

describe("enforceRules", () => {
  const sources = [chunk(1), chunk(2), chunk(3)];
  const idk = "I don't know";

  it("keeps valid citations in order and drops invented ones", () => {
    const m = parseModelAnswer({ ...good, citations: [3, 9, 3, 0, 1] })!;
    const f = enforceRules(m, sources, idk);
    expect(f.cited.map((c) => c.id)).toEqual([3, 1]);
    expect(f.abstained).toBe(false);
  });

  it("turns an answer with no valid citation into I don't know", () => {
    const f = enforceRules(parseModelAnswer({ ...good, citations: [7] })!, sources, idk);
    expect(f.abstained).toBe(true);
    expect(f.answer).toBe(idk);
    expect(f.needsHuman).toBe(true);
    expect(f.cited).toEqual([]);
  });

  it("abstains when the model says it cannot answer", () => {
    const f = enforceRules(parseModelAnswer({ ...good, can_answer: false })!, sources, idk);
    expect(f.abstained).toBe(true);
  });

  it("always flags low confidence for a human", () => {
    const f = enforceRules(parseModelAnswer({ ...good, confidence: "low", needs_human: false })!, sources, idk);
    expect(f.needsHuman).toBe(true);
    expect(f.abstained).toBe(false);
  });
});

describe("limits", () => {
  it("gate needs a finite score at or above the minimum", () => {
    expect(passesGate(0.8, 0.78)).toBe(true);
    expect(passesGate(0.78, 0.78)).toBe(true);
    expect(passesGate(0.5, 0.78)).toBe(false);
    expect(passesGate(undefined, 0.78)).toBe(false);
    expect(passesGate(Number.NaN, 0.78)).toBe(false);
  });

  it("checkLimits reports which limit was hit", () => {
    const limits = { visitor: 20, global: 200 };
    expect(checkLimits({ visitor: 20, global: 200 }, limits)).toBe("ok");
    expect(checkLimits({ visitor: 21 }, limits)).toBe("visitor");
    expect(checkLimits({ visitor: 1, global: 201 }, limits)).toBe("global");
  });

  it("visitorKey is stable, salted and never contains the IP", async () => {
    const a = await visitorKey("1.2.3.4", "salt");
    expect(a).toBe(await visitorKey("1.2.3.4", "salt"));
    expect(a).not.toBe(await visitorKey("1.2.3.4", "other"));
    expect(a).not.toContain("1.2.3.4");
    expect(a).toHaveLength(32);
  });
});

describe("prompt", () => {
  it("cleans history: trims, alternates, ends with an assistant turn", () => {
    const h = cleanHistory([
      { role: "assistant", content: "stray" },
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
    expect(h).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
    ]);
    expect(cleanHistory("nope")).toEqual([]);
    expect(cleanHistory([{ role: "system", content: "x" }])).toEqual([]);
    expect(cleanHistory([{ role: "user", content: "a" }, { role: "user", content: "b" }, { role: "assistant", content: "c" }])).toEqual([]);
  });

  it("puts numbered sources and the question in the last user message", () => {
    const msgs = buildMessages("How long?", [chunk(1), chunk(2)], []);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain("[1] Document 1 (current) > Heading 1");
    expect(msgs[0].content).toContain("[2] Document 2");
    expect(msgs[0].content).toContain("VISITOR QUESTION:\nHow long?");
  });
});
