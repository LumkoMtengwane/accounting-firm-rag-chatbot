/** Split a Markdown document into chunks by heading. Pure code, no AI. */

export interface DocChunk {
  docId: string;
  heading: string;
  content: string;
  ord: number;
}

export interface ParsedDoc {
  id: string;
  title: string;
  status: string;
  sourceFile: string;
  chunks: DocChunk[];
}

/** Split text into pieces of at most maxChars, breaking on blank lines. */
export function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let current = "";
  for (const para of text.split(/\n\s*\n/)) {
    if (current && current.length + para.length + 2 > maxChars) {
      parts.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function parseDoc(fileName: string, markdown: string, maxChars: number): ParsedDoc {
  const id = fileName.replace(/\.md$/i, "");
  const text = markdown.replace(/\r\n/g, "\n").trim();
  const titleMatch = /^#\s+(.+)$/m.exec(text);
  const title = titleMatch ? titleMatch[1].trim() : id;
  const statusMatch = /^Document status:\s*(.+)$/m.exec(text);
  const status = statusMatch ? statusMatch[1].trim() : "unknown";

  const body = titleMatch ? text.replace(titleMatch[0], "").trim() : text;
  const sections = body.split(/^## /m);
  const chunks: DocChunk[] = [];
  let ord = 0;
  sections.forEach((section, i) => {
    const trimmed = section.trim();
    if (!trimmed) return;
    let heading = "Overview";
    let content = trimmed;
    if (i > 0) {
      const nl = trimmed.indexOf("\n");
      heading = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
      content = nl === -1 ? "" : trimmed.slice(nl + 1).trim();
    }
    if (!content) return;
    for (const piece of splitLong(content, maxChars)) {
      chunks.push({ docId: id, heading, content: piece, ord: ord++ });
    }
  });
  return { id, title, status, sourceFile: fileName, chunks };
}

/** The text that gets embedded: title and heading give each chunk its context. */
export const embedInput = (doc: Pick<ParsedDoc, "title">, chunk: DocChunk) =>
  `${doc.title}\n${chunk.heading}\n${chunk.content}`;
