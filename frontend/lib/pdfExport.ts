/**
 * PDF de una parte de la página, hecho en el propio navegador. Hace falta en la web instalada como app en el
 * iPad/iPhone, donde Apple no deja abrir el menú de imprimir (window.print no hace nada). Luego se abre el menú
 * de compartir (Guardar en Archivos, Imprimir, enviar…) o, si no lo hay, se descarga.
 */

/**
 * Si conviene hacer el PDF aquí en vez de abrir el menú de imprimir: en el iPad/iPhone y en Android (instalada como
 * app el menú de imprimir no se abre, y en el navegador del móvil a veces tampoco). En el ordenador, imprimir.
 */
export function shouldMakePdf() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    /iPad|iPhone|iPod|Android/i.test(nav.userAgent) ||
    // iPad con iPadOS se presenta como un Mac, pero tiene pantalla táctil.
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
  );
}

// A4 en milímetros, con márgenes.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
// Ancho (en píxeles de pantalla) con el que se maqueta el PDF.
const PRINT_WIDTH = 740;
// Lo que no se parte entre dos páginas (si cabe en una).
const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,tr,img,figure,pre,blockquote,svg,dt,dd,table,section > div";

/**
 * Dónde se corta cada página (en píxeles de la pantalla, desde arriba del elemento): una página entera cada vez, pero
 * subiendo el corte hasta el principio del párrafo, imagen o fila que quedaría partido.
 */
function pageBreaks(element: HTMLElement, pageHeight: number) {
  const top = element.getBoundingClientRect().top;
  const total = element.scrollHeight;
  const blocks = [...element.querySelectorAll<HTMLElement>(BLOCKS)]
    .filter((b) => !b.closest(".no-print"))
    .map((b) => {
      const r = b.getBoundingClientRect();
      return { el: b, top: r.top - top, bottom: r.bottom - top };
    });
  // Final de cada línea de texto de un bloque (para cortar un párrafo largo entre dos líneas).
  const lineEnds = (el: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].map((r) => r.bottom - top);
  };
  const breaks: [number, number][] = [];
  let start = 0;
  while (start < total - 1) {
    let end = Math.min(start + pageHeight, total);
    if (end < total) {
      const limit = end;
      for (const b of blocks) {
        if (!(b.top < limit && b.bottom > limit)) continue;
        // Partido por el corte: si cabe en una página, entero a la siguiente; si no, se corta entre líneas.
        if (b.top > start + pageHeight * 0.3) end = Math.min(end, b.top);
        else {
          const line = Math.max(...lineEnds(b.el).filter((y) => y <= limit && y > start + pageHeight * 0.3), -1);
          if (line > 0) end = Math.min(end, line + 1);
        }
      }
    }
    breaks.push([start, Math.ceil(end)]);
    start = Math.ceil(end);
  }
  return breaks;
}

/**
 * Hace el PDF de `element` (lo que tiene la clase no-print no sale). Se fotografía página a página: en el iPad y el
 * iPhone, Safari no deja hacer una imagen de más de ~16 millones de píxeles y un apunte largo entero no cabe.
 */
export async function makePdf(
  element: HTMLElement,
  fileName: string,
  onProgress?: (page: number, pages: number) => void,
) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  // Siempre con el ancho de un folio (en el móvil la página es estrecha y saldría con letra enorme y el triple de hojas).
  const saved = element.style.cssText;
  element.style.width = `${PRINT_WIDTH}px`;
  element.style.maxWidth = "none";
  try {
    return await render(element, fileName, html2canvas, jsPDF, onProgress);
  } finally {
    element.style.cssText = saved;
  }
}

async function render(
  element: HTMLElement,
  fileName: string,
  html2canvas: typeof import("html2canvas-pro").default,
  jsPDF: typeof import("jspdf").jsPDF,
  onProgress?: (page: number, pages: number) => void,
) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const contentW = PAGE_W - 2 * MARGIN;
  const width = Math.ceil(element.getBoundingClientRect().width);
  const pxPerMm = width / contentW;
  const breaks = pageBreaks(element, Math.floor((PAGE_H - 2 * MARGIN) * pxPerMm));
  // Resolución: el doble que la pantalla, con un tope de píxeles por página que Safari aguanta de sobra.
  const scale = Math.min(2, Math.sqrt(6_000_000 / (width * (PAGE_H - 2 * MARGIN) * pxPerMm)));

  for (const [i, [start, end]] of breaks.entries()) {
    onProgress?.(i + 1, breaks.length);
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      imageTimeout: 8000,
      logging: false,
      // html2canvas-pro: x/y desde la esquina del propio elemento.
      x: 0,
      y: start,
      width,
      height: end - start,
      // Lo que no sale al imprimir (botones, herramientas…) tampoco sale en el PDF.
      ignoreElements: (el) => el.classList?.contains("no-print") ?? false,
    });
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", MARGIN, MARGIN, contentW, (end - start) / pxPerMm);
    // Se libera la memoria de la página antes de la siguiente.
    canvas.width = canvas.height = 0;
  }

  const name = `${fileName.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "apuntes"}.pdf`;
  return new File([pdf.output("blob")], name, { type: "application/pdf" });
}

/**
 * Abre el menú de compartir con el PDF (Guardar en Archivos, Imprimir…). Apple solo lo deja abrir justo después de tocar
 * un botón: si hacer el PDF ha tardado, se niega ("needs-tap") y hay que pedirle que toque otra vez.
 */
export async function sharePdf(file: File): Promise<"done" | "needs-tap"> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "done";
    } catch (err) {
      const name = (err as Error).name;
      // Si cierra el menú sin elegir nada, no es un error.
      if (name === "AbortError") return "done";
      if (name === "NotAllowedError") return "needs-tap";
    }
  }
  // Sin menú de compartir: se abre el PDF (desde el visor se puede guardar o imprimir) o se descarga.
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "done";
}
