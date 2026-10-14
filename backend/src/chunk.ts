import type { ExtractedPage } from "./extract";

export interface Chunk {
  position: number;
  page: number | null;
  content: string;
}

const TARGET = 1500;
const OVERLAP = 200;
const MIN_SIZE = 300;

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Divide un texto en fragmentos de ~1.500 caracteres, respetando párrafos, con 200 de solapamiento. */
function splitText(text: string): string[] {
  const paragraphs = normalize(text)
    .split(/\n\s*\n/)
    .flatMap((p) => (p.length > TARGET ? p.match(new RegExp(`[\\s\\S]{1,${TARGET}}(?=\\s|$)`, "g")) ?? [p] : [p]))
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    // No cerramos fragmentos muy pequeños (p. ej., un título suelto).
    if (current.length >= MIN_SIZE && current.length + paragraph.length + 2 > TARGET) {
      chunks.push(current);
      const tail = current.slice(-OVERLAP);
      const cut = tail.indexOf(" ");
      current = (cut >= 0 ? tail.slice(cut + 1) : tail) + "\n\n" + paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export function chunkPages(pages: ExtractedPage[]): Chunk[] {
  const result: Chunk[] = [];
  for (const page of pages) {
    for (const content of splitText(page.text)) {
      result.push({ position: result.length, page: page.page, content });
    }
  }
  return result;
}
