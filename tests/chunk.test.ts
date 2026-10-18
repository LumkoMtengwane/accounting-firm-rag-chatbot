import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { embedInput, parseDoc, splitLong } from "../supabase/functions/_shared/chunk.ts";

const MD = `# Sample Policy

Document status: current. Last updated: 1 January 2026.
Intro line.

## First heading

Alpha text.

## Second heading

Beta text.

## Empty heading
`;

describe("parseDoc", () => {
  it("reads title, status and splits by heading", () => {
    const doc = parseDoc("01-sample.md", MD, 1800);
    expect(doc.id).toBe("01-sample");
    expect(doc.title).toBe("Sample Policy");
    expect(doc.status).toContain("current");
    expect(doc.chunks.map((c) => c.heading)).toEqual(["Overview", "First heading", "Second heading"]);
    expect(doc.chunks.map((c) => c.ord)).toEqual([0, 1, 2]);
  });

  it("handles Windows line endings", () => {
    const doc = parseDoc("x.md", MD.replace(/\n/g, "\r\n"), 1800);
    expect(doc.chunks).toHaveLength(3);
  });

  it("falls back when there is no title or status", () => {
    const doc = parseDoc("plain.md", "## A\n\nText", 1800);
    expect(doc.title).toBe("plain");
    expect(doc.status).toBe("unknown");
  });

  it("puts the title and heading in the embedded text", () => {
    const doc = parseDoc("01-sample.md", MD, 1800);
    expect(embedInput(doc, doc.chunks[1])).toBe("Sample Policy\nFirst heading\nAlpha text.");
  });
});

describe("splitLong", () => {
  it("keeps short text whole and splits long text on blank lines", () => {
    expect(splitLong("short", 100)).toEqual(["short"]);
    const long = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ${"x".repeat(40)}`).join("\n\n");
    const parts = splitLong(long, 120);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 120)).toBe(true);
    expect(parts.join("\n\n")).toBe(long);
  });
});

describe("the real demo documents", () => {
  const dir = join(__dirname, "..", "data", "docs");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

  it("all parse, have a status and are not too big", () => {
    expect(files.length).toBeGreaterThanOrEqual(18);
    for (const f of files) {
      const doc = parseDoc(f, readFileSync(join(dir, f), "utf8"), 1800);
      expect(doc.status, f).not.toBe("unknown");
      expect(doc.chunks.length, f).toBeGreaterThan(0);
      for (const c of doc.chunks) expect(c.content.length, f).toBeLessThanOrEqual(1800);
    }
  });

  it("marks the old fee schedule as archived", () => {
    const doc = parseDoc("03.md", readFileSync(join(dir, "03-services-and-fees-2025-archived.md"), "utf8"), 1800);
    expect(doc.status).toMatch(/ARCHIVED/);
  });

  it("contains no em dashes", () => {
    for (const f of files) expect(readFileSync(join(dir, f), "utf8"), f).not.toContain("—");
  });
});
