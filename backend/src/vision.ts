import { createCanvas, loadImage } from "@napi-rs/canvas";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { completeJson } from "./ai";
import type { ExtractedPage } from "./extract";
import type { LlmImage } from "./llm/types";
import { figuresPrompt, formulasPrompt, transcribePrompt } from "./prompts";

/**
 * Lectura de las imágenes de los apuntes (esquemas, figuras legendadas, radiografías…).
 * El texto ya se saca con pdf-parse / officeparser; aquí la IA "mira" las páginas o diapositivas
 * con figuras y las describe. Las descripciones se guardan como fragmentos más del documento,
 * así entran en el resumen, las flashcards, los tests y el chat sin cambiar nada más.
 */

// Límite de coste: como mucho estas páginas o imágenes por documento (cada una ≈ 1.000 tokens).
const MAX_FIGURES = 40;
const BATCH = 8;
// Ancho al que se envían las imágenes (suficiente para leer las leyendas).
const WIDTH = 1200;
// Por debajo de este tamaño suelen ser iconos o adornos.
const MIN_PIXELS = 120;
const MIN_BYTES = 15_000;
// Un logotipo o adorno de plantilla repetido rara vez pasa de unos 600×400 px.
const LOGO_MAX_AREA = 250_000;

export interface Figure {
  /** Página (PDF) o diapositiva (PPTX); null en Word. */
  page: number | null;
  label: string;
  description: string;
  /** Imagen (JPEG en base64) que vio la IA: se guarda para las preguntas con imágenes. */
  image?: string;
  /** false si solo tenía fórmulas o texto (se usa lo transcrito, pero la imagen no se enseña en el resumen). */
  visual?: boolean;
}

export interface Candidate {
  ref: number;
  page: number | null;
  label: string;
  image: LlmImage;
}

const figuresSchema = z.object({
  figures: z.array(z.object({ ref: z.number().int(), description: z.string(), visual: z.boolean().optional() })),
});

/**
 * Asignaturas de fórmulas (Biomatemática, Estadística…): las fórmulas suelen ir como imagen pequeña o dibujadas
 * en el PDF, y la IA las descartaba como "adornos". En estas se mira cada página y no se tira nada pequeño.
 */
export interface FigureOptions {
  formulas?: boolean;
}
const FORMULA_MAX_PAGES = 60;

/** Reduce la imagen a JPEG de como mucho WIDTH px de ancho. Null si el formato no se puede leer (EMF, WMF…). */
async function toJpeg(data: Uint8Array, small = false): Promise<LlmImage | null> {
  try {
    const img = await loadImage(Buffer.from(data));
    // Una fórmula suele ser una imagen ancha y baja: en las asignaturas de fórmulas se aceptan.
    if (small ? img.width < 40 || img.height < 16 : img.width < MIN_PIXELS || img.height < MIN_PIXELS) return null;
    const scale = Math.min(1, WIDTH / img.width);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    // Fondo blanco: las imágenes PNG transparentes se verían negras en JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { mediaType: "image/jpeg", data: (await canvas.encode("jpeg", 82)).toString("base64") };
  } catch {
    return null;
  }
}

/** Imágenes que se repiten en muchas páginas (logotipos, fondos de plantilla): no aportan nada. */
function repeated(keysPerPage: string[][]): Set<string> {
  const pages = keysPerPage.length;
  const count = new Map<string, number>();
  for (const keys of keysPerPage) for (const k of new Set(keys)) count.set(k, (count.get(k) ?? 0) + 1);
  return new Set(pages >= 4 ? [...count].filter(([, n]) => n >= Math.max(3, pages * 0.4)).map(([k]) => k) : []);
}

// Códigos de pdf.js para "pintar una imagen" (estables desde hace años).
const OPS_PAINT_IMAGE = new Set([85, 86]);

interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<{ getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }> }>;
}

/**
 * Tamaño en píxeles de las imágenes de cada página. pdf-parse tiene getImage(), pero se queda colgado
 * al decodificarlas en el servidor; nos basta con la lista de operaciones de cada página.
 */
async function pdfImageSizes(parser: PDFParse): Promise<{ total: number; sizes: string[][] }> {
  const doc = (await (parser as unknown as { load(): Promise<PdfDoc> }).load()) as PdfDoc;
  const sizes: string[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const ops = await (await doc.getPage(i)).getOperatorList();
    const page: string[] = [];
    ops.fnArray.forEach((fn, j) => {
      if (!OPS_PAINT_IMAGE.has(fn)) return;
      const [, w, h] = (ops.argsArray[j] ?? []) as [string?, number?, number?];
      if ((w ?? 0) > MIN_PIXELS && (h ?? 0) > MIN_PIXELS) page.push(`${w}x${h}`);
    });
    sizes.push(page);
  }
  return { total: doc.numPages, sizes };
}

async function pdfCandidates(buffer: Buffer, allPages = false): Promise<Candidate[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const { total, sizes } = await pdfImageSizes(parser);
    let pages: number[];
    if (allPages) {
      pages = Array.from({ length: Math.min(total, FORMULA_MAX_PAGES) }, (_, i) => i + 1);
    } else {
      const area = (key: string) =>
        key
          .split("x")
          .map(Number)
          .reduce((a, b) => a * b, 1);
      // En el PDF solo se sabe el tamaño de cada imagen, no si es la misma: muchas figuras distintas pueden
      // medir lo mismo (p. ej., exportadas de PowerPoint). Solo se descartan las repetidas pequeñas (logotipos).
      const skip = new Set([...repeated(sizes)].filter((k) => area(k) < LOGO_MAX_AREA));
      pages = sizes
        .map((keys, i) => ({
          page: i + 1,
          area: keys.filter((k) => !skip.has(k)).reduce((sum, k) => sum + area(k), 0),
        }))
        .filter((p) => p.area > 0)
        // Si hay demasiadas, nos quedamos con las de figuras más grandes.
        .sort((a, b) => b.area - a.area)
        .slice(0, MAX_FIGURES)
        .map((p) => p.page)
        .sort((a, b) => a - b);
    }
    if (pages.length === 0) return [];
    const shots = await parser.getScreenshot({ partial: pages, desiredWidth: WIDTH, imageDataUrl: false });
    const out: Candidate[] = [];
    for (const shot of shots.pages) {
      const image = await toJpeg(shot.data);
      if (image) out.push({ ref: shot.pageNumber, page: shot.pageNumber, label: `página ${shot.pageNumber}`, image });
    }
    return out;
  } finally {
    await parser.destroy();
  }
}

/** Imágenes de cada diapositiva (sin las de la plantilla, que están en el patrón y no en la diapositiva). */
async function pptxCandidates(buffer: Buffer, small = false): Promise<Candidate[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .map((name) => Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const media: string[][] = [];
  for (const n of slides) {
    const rels = (await zip.file(`ppt/slides/_rels/slide${n}.xml.rels`)?.async("string")) ?? "";
    const targets = [...rels.matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map((m) => `ppt/media/${m[1]}`);
    media.push([...new Set(targets)]);
  }
  const skip = repeated(media);
  const out: Candidate[] = [];
  for (const [i, files] of media.entries()) {
    for (const file of files) {
      if (out.length >= (small ? FORMULA_MAX_PAGES : MAX_FIGURES)) return out;
      if (skip.has(file)) continue;
      const data = await zip.file(file)?.async("uint8array");
      if (!data || data.length < (small ? 500 : MIN_BYTES)) continue;
      const image = await toJpeg(data, small);
      if (image) out.push({ ref: out.length + 1, page: slides[i], label: `diapositivo ${slides[i]}`, image });
    }
  }
  return out;
}

async function docxCandidates(buffer: Buffer, small = false): Promise<Candidate[]> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files).filter((n) => n.startsWith("word/media/"));
  const out: Candidate[] = [];
  for (const file of files) {
    if (out.length >= (small ? FORMULA_MAX_PAGES : MAX_FIGURES)) break;
    const data = await zip.file(file)!.async("uint8array");
    if (data.length < (small ? 500 : MIN_BYTES)) continue;
    const image = await toJpeg(data, small);
    if (image) out.push({ ref: out.length + 1, page: null, label: `imagem ${out.length + 1}`, image });
  }
  return out;
}

async function askInBatches(candidates: Candidate[], prompt: (labels: string) => string, maxTokens: number) {
  const figures: Figure[] = [];
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const labels = batch.map((c, j) => `Imagem ${j + 1} → ref ${c.ref} (${c.label})`).join("\n");
    const result = await completeJson(prompt(labels), figuresSchema, {
      lang: "pt",
      effort: "low",
      maxTokens,
      images: batch.map((c) => c.image),
    });
    for (const f of result.figures) {
      const c = batch.find((x) => x.ref === f.ref);
      if (c && f.description.trim())
        figures.push({
          page: c.page,
          label: c.label,
          description: f.description.trim(),
          image: c.image.data,
          visual: f.visual,
        });
    }
  }
  return figures;
}

/** Páginas o imágenes que merece la pena enseñar a la IA. */
export async function figureCandidates(buffer: Buffer, kind: string, opts: FigureOptions = {}): Promise<Candidate[]> {
  if (kind === "pdf") return pdfCandidates(buffer, opts.formulas);
  if (kind === "pptx") return pptxCandidates(buffer, opts.formulas);
  if (kind === "docx") return docxCandidates(buffer, opts.formulas);
  return [];
}

/** Describe las figuras de un documento. Devuelve [] si no tiene imágenes útiles. */
export async function describeFigures(buffer: Buffer, kind: string, opts: FigureOptions = {}): Promise<Figure[]> {
  const candidates = await figureCandidates(buffer, kind, opts);
  if (candidates.length === 0) return [];
  return opts.formulas
    ? askInBatches(candidates, formulasPrompt, 16000)
    : askInBatches(candidates, figuresPrompt, 8000);
}

/** PDF escaneado (sin texto): la IA lee cada página. Devuelve las páginas como si fueran texto extraído. */
export async function transcribePdf(buffer: Buffer): Promise<ExtractedPage[]> {
  const candidates = await pdfCandidates(buffer, true);
  const pages = await askInBatches(candidates, transcribePrompt, 16000);
  return pages.map((p) => ({ page: p.page, text: p.description }));
}

/** Texto con el que se guarda cada figura entre los fragmentos del documento. */
export const figureChunk = (f: Figure) => `[Figura – ${f.label}] ${f.description}`;
export const FIGURE_PREFIX = "[Figura – ";
