import mammoth from "mammoth";
import { withLinearFormulas } from "./omml";
import { OfficeParser } from "officeparser";
import { PDFParse } from "pdf-parse";
import { PROCESSING_ERRORS } from "./i18n";

export interface ExtractedPage {
  page: number | null;
  text: string;
}

export class ExtractionError extends Error {}

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "txt",
};

export function detectKind(mime: string, filename: string): string | null {
  if (ALLOWED_TYPES[mime]) return ALLOWED_TYPES[mime];
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  // Clases grabadas (ya convertidas a M4A al subirlas).
  if (mime.startsWith("audio/") || ext === "m4a") return "audio";
  if (["pdf", "docx", "pptx"].includes(ext)) return ext;
  // OpenDocument (LibreOffice): los lee el mismo lector que el PowerPoint.
  if (["odt", "odp"].includes(ext)) return "office";
  if (["txt", "md"].includes(ext)) return "txt";
  return null;
}

async function extractPdf(buffer: Buffer): Promise<ExtractedPage[]> {
  const parser = new PDFParse({ data: buffer });
  let pages: ExtractedPage[];
  try {
    // Guardamos el texto página a página para poder citar la página en las fuentes.
    const result = await parser.getText();
    pages = result.pages.map((p) => ({ page: p.num, text: p.text }));
  } finally {
    await parser.destroy();
  }
  const totalChars = pages.reduce((n, p) => n + p.text.trim().length, 0);
  if (totalChars < 50) {
    throw new ExtractionError(PROCESSING_ERRORS.scanned);
  }
  return pages;
}

export async function extractText(buffer: Buffer, kind: string): Promise<ExtractedPage[]> {
  let pages: ExtractedPage[];
  switch (kind) {
    case "pdf":
      pages = await extractPdf(buffer);
      break;
    case "docx": {
      const result = await mammoth.extractRawText({ buffer: await withLinearFormulas(buffer, "docx") });
      pages = [{ page: null, text: result.value }];
      break;
    }
    case "pptx": {
      const ast = await OfficeParser.parseOffice(await withLinearFormulas(buffer, "pptx"));
      const out = await ast.to("text");
      pages = [{ page: null, text: String(out.value) }];
      break;
    }
    case "office": {
      const ast = await OfficeParser.parseOffice(buffer);
      const out = await ast.to("text");
      pages = [{ page: null, text: String(out.value) }];
      break;
    }
    case "txt":
      pages = [{ page: null, text: buffer.toString("utf8") }];
      break;
    default:
      throw new ExtractionError(PROCESSING_ERRORS.unsupported);
  }
  if (pages.every((p) => p.text.trim().length === 0)) {
    throw new ExtractionError(PROCESSING_ERRORS.noText);
  }
  return pages;
}
