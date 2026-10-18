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
  /** Lo que muestra, en español (la descripción va en portugués, como sus apuntes). */
  captionEs?: string;
  /** Las etiquetas que se leen en la imagen (en portugués) con su traducción al español. */
  labelsEs?: { pt: string; es: string }[];
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
  figures: z.array(
    z.object({
      ref: z.number().int(),
      description: z.string(),
      visual: z.boolean().optional(),
      caption_es: z.string().optional(),
      labels_es: z
        .array(z.object({ pt: z.string(), es: z.string() }))
        .optional()
        .catch(undefined),
    }),
  ),
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
async function toJpeg(
  data: Uint8Array,
  small = false,
  /** Zona a recortar, en fracciones de la imagen: [izquierda, arriba, derecha, abajo]. */
  crop: [number, number, number, number] | null = null,
): Promise<LlmImage | null> {
  try {
    const img = await loadImage(Buffer.from(data));
    const sx = crop ? crop[0] * img.width : 0;
    const sy = crop ? crop[1] * img.height : 0;
    const sw = crop ? (crop[2] - crop[0]) * img.width : img.width;
    const sh = crop ? (crop[3] - crop[1]) * img.height : img.height;
    // Una fórmula suele ser una imagen ancha y baja: en las asignaturas de fórmulas se aceptan.
    if (small ? sw < 40 || sh < 16 : sw < MIN_PIXELS || sh < MIN_PIXELS) return null;
    const scale = Math.min(1, WIDTH / sw);
    const w = Math.round(sw * scale);
    const h = Math.round(sh * scale);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    // Fondo blanco: las imágenes PNG transparentes se verían negras en JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
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
  getPage(n: number): Promise<{
    view: number[];
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  }>;
}

// Más códigos de pdf.js: guardar/recuperar el estado gráfico, cambiar la posición y los "formularios" (grupos).
const OP_SAVE = 10;
const OP_RESTORE = 11;
const OP_TRANSFORM = 12;
const OP_FORM_BEGIN = 74;
const OP_FORM_END = 75;

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

/** Una imagen de la página: su tamaño en píxeles y dónde está dibujada (en fracciones de la página, desde arriba). */
interface PdfImage {
  key: string;
  box: [number, number, number, number];
}

/**
 * Las imágenes de cada página y dónde están. pdf-parse tiene getImage(), pero se queda colgado al decodificarlas
 * en el servidor; nos basta con la lista de operaciones de cada página (y siguiendo sus transformaciones
 * se sabe dónde está cada imagen, para recortar solo las figuras y no la diapositiva entera).
 */
async function pdfImages(parser: PDFParse): Promise<{ total: number; pages: PdfImage[][] }> {
  const doc = (await (parser as unknown as { load(): Promise<PdfDoc> }).load()) as PdfDoc;
  const pages: PdfImage[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [vx0, vy0, vx1, vy1] = page.view;
    const ops = await page.getOperatorList();
    const found: PdfImage[] = [];
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    ops.fnArray.forEach((fn, j) => {
      const args = (ops.argsArray[j] ?? []) as unknown[];
      if (fn === OP_SAVE) stack.push(ctm);
      else if (fn === OP_RESTORE || fn === OP_FORM_END) ctm = stack.pop() ?? ctm;
      else if (fn === OP_TRANSFORM && args.length === 6) ctm = mul(args as Matrix, ctm);
      else if (fn === OP_FORM_BEGIN) {
        stack.push(ctm);
        const m = args[0] as number[] | null;
        if (Array.isArray(m) && m.length === 6) ctm = mul(m as Matrix, ctm);
      } else if (OPS_PAINT_IMAGE.has(fn)) {
        const [, w, h] = args as [string?, number?, number?];
        if ((w ?? 0) <= MIN_PIXELS || (h ?? 0) <= MIN_PIXELS) return;
        // La imagen ocupa el cuadrado unidad transformado por la matriz actual.
        const xs: number[] = [];
        const ys: number[] = [];
        for (const [u, v] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          xs.push(u * ctm[0] + v * ctm[2] + ctm[4]);
          ys.push(u * ctm[1] + v * ctm[3] + ctm[5]);
        }
        const fx = (x: number) => Math.min(1, Math.max(0, (x - vx0) / (vx1 - vx0)));
        const fy = (y: number) => Math.min(1, Math.max(0, (vy1 - y) / (vy1 - vy0)));
        found.push({
          key: `${w}x${h}`,
          box: [fx(Math.min(...xs)), fy(Math.max(...ys)), fx(Math.max(...xs)), fy(Math.min(...ys))],
        });
      }
    });
    pages.push(found);
  }
  return { total: doc.numPages, pages };
}

const boxArea = (b: PdfImage["box"]) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
// Imágenes que ocupan menos de esto de la página: iconos, viñetas o logotipos.
const MIN_PAGE_FRACTION = 0.015;

type Box = PdfImage["box"];

/** Junta las imágenes que se tocan o están casi pegadas (una figura hecha de varias piezas sale entera). */
function clusters(boxes: Box[], gap = 0.01): Box[] {
  let out = boxes.map((b) => [...b] as Box);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++)
      for (let j = i + 1; j < out.length && !merged; j++) {
        const [a, c] = [out[i], out[j]];
        const near = a[0] - gap < c[2] && c[0] - gap < a[2] && a[1] - gap < c[3] && c[1] - gap < a[3];
        if (near) {
          out[i] = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])];
          out = out.filter((_, k) => k !== j);
          merged = true;
        }
      }
  }
  return out;
}

async function pdfCandidates(buffer: Buffer, allPages = false): Promise<Candidate[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const { total, pages: images } = await pdfImages(parser);
    // Zonas de cada página que se recortan: cada figura por separado (sin títulos, tablas de texto ni logotipos).
    // En las páginas de fórmulas (y las escaneadas) se manda la página entera.
    const crops = new Map<number, (Box | null)[]>();
    if (allPages) {
      for (let p = 1; p <= Math.min(total, FORMULA_MAX_PAGES); p++) crops.set(p, [null]);
    } else {
      const area = (key: string) =>
        key
          .split("x")
          .map(Number)
          .reduce((a, b) => a * b, 1);
      // En el PDF solo se sabe el tamaño de cada imagen, no si es la misma: muchas figuras distintas pueden
      // medir lo mismo (p. ej., exportadas de PowerPoint). Solo se descartan las repetidas pequeñas (logotipos).
      const skip = new Set(
        [...repeated(images.map((p) => p.map((im) => im.key)))].filter((k) => area(k) < LOGO_MAX_AREA),
      );
      const pad = 0.012;
      const all = images.flatMap((list, i) =>
        clusters(list.filter((im) => !skip.has(im.key) && boxArea(im.box) >= MIN_PAGE_FRACTION).map((im) => im.box))
          .filter((box) => boxArea(box) >= MIN_PAGE_FRACTION)
          .map((box) => ({ page: i + 1, box })),
      );
      // Si hay demasiadas, nos quedamos con las figuras más grandes.
      for (const f of all.sort((x, y) => boxArea(y.box) - boxArea(x.box)).slice(0, MAX_FIGURES)) {
        const box: Box = [
          Math.max(0, f.box[0] - pad),
          Math.max(0, f.box[1] - pad),
          Math.min(1, f.box[2] + pad),
          Math.min(1, f.box[3] + pad),
        ];
        crops.set(f.page, [...(crops.get(f.page) ?? []), boxArea(box) > 0.85 ? null : box]);
      }
    }
    const pages = [...crops.keys()].sort((a, b) => a - b);
    if (pages.length === 0) return [];
    // Más resolución al recortar, para que la figura recortada siga viéndose bien.
    const shots = await parser.getScreenshot({ partial: pages, desiredWidth: WIDTH * 2, imageDataUrl: false });
    const out: Candidate[] = [];
    for (const shot of shots.pages) {
      const zones = (crops.get(shot.pageNumber) ?? [null]).sort((x, y) => (x?.[1] ?? 0) - (y?.[1] ?? 0));
      for (const zone of zones) {
        const image = await toJpeg(shot.data, false, zone);
        // En las páginas enteras la referencia es la página (la usa la transcripción de PDF escaneados).
        if (image)
          out.push({
            ref: allPages ? shot.pageNumber : out.length + 1,
            page: shot.pageNumber,
            label: `página ${shot.pageNumber}`,
            image,
          });
      }
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
          captionEs: f.caption_es?.trim() || undefined,
          labelsEs: f.labels_es?.filter((l) => l.pt.trim() && l.es.trim()).slice(0, 20),
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
    : askInBatches(candidates, figuresPrompt, 12000);
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
