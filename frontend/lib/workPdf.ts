/**
 * PDF del trabajo con el formato de la guía de la ESSCVP (el mismo contenido que el Word).
 * El PDF se ve igual en cualquier sitio (también en la vista previa del iPad o del iPhone, que no respeta
 * los saltos de página de los Word) y el índice lleva las páginas exactas.
 */

export interface PdfInline {
  text: string;
  bold?: boolean;
  italics?: boolean;
}

export interface WorkPdfModel {
  fileName: string;
  logo: string | null; // data URL del logo de la escuela
  cover: {
    course: string;
    yearSemester: string;
    subject: string;
    title: string;
    subtitle: string;
    authors: string[];
    teacherLine: string;
    placeDate: string;
  };
  labels: { toc: string; acronyms: string; symbols: string; references: string };
  sections: {
    title: string;
    level: 1 | 2;
    blocks: { kind: "p" | "li" | "h"; parts: PdfInline[] }[];
  }[];
  references: PdfInline[][];
  numberedRefs: boolean; // Vancouver
  siglas: { sigla: string; significado: string }[];
  simbolos: { simbolo: string; significado: string }[];
}

// A4 con márgenes de 2,54 cm, en puntos.
const PAGE_W = 595.28;
const MARGIN = 72;
const TEXT_W = PAGE_W - 2 * MARGIN;
const PAGE_COL = 28;

const ROMAN: [number, string][] = [
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];
function roman(n: number) {
  let out = "";
  for (const [v, s] of ROMAN)
    while (n >= v) {
      out += s;
      n -= v;
    }
  return out;
}

async function base64(url: string) {
  const buf = await (await fetch(url)).arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const FONT_FILES = {
  "Carlito-Regular.ttf": "/fonts/Carlito-Regular.ttf",
  "Carlito-Bold.ttf": "/fonts/Carlito-Bold.ttf",
  "Carlito-Italic.ttf": "/fonts/Carlito-Italic.ttf",
  "Carlito-BoldItalic.ttf": "/fonts/Carlito-BoldItalic.ttf",
};

/* eslint-disable @typescript-eslint/no-explicit-any -- pdfmake no trae tipos */
type Node = any;

function definition(m: WorkPdfModel, pages: Map<string, number>, bodyStart: number) {
  const runs = (parts: PdfInline[]) => parts.map((p) => ({ text: p.text, bold: p.bold, italics: p.italics }));
  const center = (text: string, o: Node = {}) => ({ text, alignment: "center", ...o });

  // ---- Capa y folha de rosto ----
  const coverPage = (rosto: boolean): Node[] => [
    m.logo
      ? { image: m.logo, width: 128, alignment: "center", pageBreak: rosto ? "before" : undefined }
      : center("Escola Superior de Saúde Cruz Vermelha Portuguesa – Alto Tâmega", {
          bold: true,
          pageBreak: rosto ? "before" : undefined,
        }),
    center(m.cover.course.toUpperCase(), { margin: [0, 36, 0, 3] }),
    m.cover.yearSemester ? center(m.cover.yearSemester, { fontSize: 10 }) : null,
    m.cover.subject ? center(m.cover.subject, { fontSize: 10, margin: [0, 15, 0, 0] }) : null,
    center(m.cover.title, { fontSize: 14, bold: true, margin: [0, 130, 0, 3] }),
    m.cover.subtitle ? center(m.cover.subtitle, { fontSize: 12 }) : null,
    ...m.cover.authors.map((l, i) => ({ text: l, alignment: "right", bold: true, margin: [0, i === 0 ? 120 : 0, 0, 3] })),
    rosto && m.cover.teacherLine ? { text: m.cover.teacherLine, alignment: "right", margin: [0, 18, 0, 0] } : null,
    !rosto && m.cover.placeDate ? center(m.cover.placeDate, { margin: [0, 130, 0, 0] }) : null,
  ].filter(Boolean);

  const pageTitle = (text: string, id?: string): Node => ({
    text,
    id,
    bold: true,
    fontSize: 12,
    alignment: "center",
    pageBreak: "before",
    margin: [0, 0, 0, 18],
  });

  // ---- Índice geral: título, puntos y página (en la numeración del cuerpo) ----
  const tocEntry = (text: string, key: string, o: { bold?: boolean; indent?: number } = {}): Node => {
    const abs = pages.get(key);
    const page = abs && bodyStart ? String(abs - bodyStart + 1) : "";
    const indent = o.indent ?? 0;
    const width = TEXT_W - PAGE_COL - indent;
    return {
      margin: [indent, 0, 0, 9],
      columns: [
        {
          width,
          stack: [
            {
              canvas: [{ type: "line", x1: 0, y1: 10.5, x2: width, y2: 10.5, lineWidth: 0.8, dash: { length: 0.8, space: 2.5 } }],
            },
            { text: text + " ", bold: o.bold, background: "white", relativePosition: { x: 0, y: -13 }, lineHeight: 1.2 },
          ],
        },
        { width: PAGE_COL, text: page, alignment: "right", bold: o.bold, lineHeight: 1.2, relativePosition: { x: 0, y: -3.5 } },
      ],
    };
  };

  const listTable = (rows: [string, string][]): Node => ({
    layout: "noBorders",
    table: {
      widths: [80, "*"],
      body: rows.map(([a, b]) => [
        { text: a, margin: [0, 0, 0, 4] },
        { text: b, margin: [0, 0, 0, 4] },
      ]),
    },
  });

  const content: Node[] = [...coverPage(false), ...coverPage(true)];
  content.push(pageTitle(m.labels.toc));
  m.sections.forEach((s, i) =>
    content.push(tocEntry(s.title, `h${i}`, { bold: s.level === 1, indent: s.level === 2 ? 18 : 0 })),
  );
  if (m.references.length) content.push(tocEntry(m.labels.references, "refs", { bold: true }));
  if (m.siglas.length) {
    content.push(pageTitle(m.labels.acronyms));
    content.push(listTable(m.siglas.map((x) => [x.sigla, x.significado])));
  }
  if (m.simbolos.length) {
    content.push(pageTitle(m.labels.symbols));
    content.push(listTable(m.simbolos.map((x) => [x.simbolo, x.significado])));
  }

  // ---- Cuerpo ----
  m.sections.forEach((s, i) => {
    content.push({
      text: s.title,
      id: `h${i}`,
      bold: true,
      fontSize: s.level === 1 ? 12 : 11,
      headlineLevel: 1,
      margin: [0, i === 0 ? 0 : 12, 0, 6],
    });
    for (const b of s.blocks) {
      if (b.kind === "li")
        content.push({ ul: [{ text: runs(b.parts) }], margin: [12, 0, 0, 4], alignment: "justify" });
      else if (b.kind === "h")
        content.push({ text: runs(b.parts), bold: true, headlineLevel: 1, margin: [0, 6, 0, 4] });
      else content.push({ text: runs(b.parts), alignment: "justify", margin: [0, 0, 0, 6] });
    }
  });
  if (m.references.length) {
    content.push({ ...pageTitle(m.labels.references, "refs"), pageBreak: undefined });
    m.references.forEach((r, i) =>
      content.push({
        text: [...(m.numberedRefs ? [{ text: `${i + 1}. ` }] : []), ...runs(r)],
        margin: [36, 0, 0, 6],
        leadingIndent: -36,
      }),
    );
  }

  return {
    pageSize: "A4",
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
    info: { title: m.cover.title },
    defaultStyle: { font: "Carlito", fontSize: 11, lineHeight: 1.5 },
    content,
    // La capa no lleva número; la folha de rosto cuenta (i) pero no se ve; luego romanos; desde la introducción, 1, 2, 3…
    footer: (current: number) => {
      if (current <= 2) return null;
      const label = bodyStart && current >= bodyStart ? String(current - bodyStart + 1) : roman(current - 1);
      return { text: label, alignment: "center", fontSize: 10, margin: [0, 30, 0, 0] };
    },
    // La introducción y las referencias empiezan página; un título no se queda solo al final de una página.
    // De paso se apunta en qué página cae cada título (para el índice).
    pageBreakBefore: (
      node: Node,
      q: { getFollowingNodesOnPage: () => Node[]; getPreviousNodesOnPage: () => Node[] },
    ) => {
      const page = node.startPosition?.pageNumber ?? 0;
      const breakHere =
        ((node.id === "h0" || node.id === "refs") && q.getPreviousNodesOnPage().length > 0) ||
        (node.headlineLevel === 1 && q.getFollowingNodesOnPage().length === 0);
      if (node.id) pages.set(node.id, breakHere ? page + 1 : page);
      return breakHere;
    },
  };
}

/** Genera el PDF (dos pasadas: la primera mide en qué página cae cada título) y lo descarga. */
export async function downloadWorkPdf(m: WorkPdfModel) {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default as any;
  const vfs: Record<string, string> = {};
  await Promise.all(Object.entries(FONT_FILES).map(async ([name, url]) => (vfs[name] = await base64(url))));
  pdfMake.addVirtualFileSystem(vfs);
  pdfMake.addFonts({
    Carlito: {
      normal: "Carlito-Regular.ttf",
      bold: "Carlito-Bold.ttf",
      italics: "Carlito-Italic.ttf",
      bolditalics: "Carlito-BoldItalic.ttf",
    },
  });
  const pages = new Map<string, number>();
  await pdfMake.createPdf(definition(m, pages, 0)).getBuffer();
  const bodyStart = pages.get("h0") ?? 0;
  const measured = new Map(pages);
  const blob: Blob = await pdfMake.createPdf(definition(m, measured, bodyStart)).getBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${m.fileName}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
