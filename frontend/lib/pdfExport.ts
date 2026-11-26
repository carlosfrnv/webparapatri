/**
 * PDF de una parte de la página, hecho en el propio navegador. Hace falta en la web instalada como app en el
 * iPad/iPhone, donde Apple no deja abrir el menú de imprimir (window.print no hace nada). Luego se abre el menú
 * de compartir (Guardar en Archivos, Imprimir, enviar…) o, si no lo hay, se descarga.
 */

/** Si la web está instalada como app (pantalla de inicio), sin las barras del navegador. */
export function isInstalledApp() {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

// A4 en milímetros, con márgenes.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;

/** Fila de la imagen que está toda en blanco cerca de `y` (para no cortar una línea de texto por la mitad). */
function blankRowNear(ctx: CanvasRenderingContext2D, width: number, y: number, maxUp: number) {
  for (let row = y; row > y - maxUp; row--) {
    const data = ctx.getImageData(0, row, width, 1).data;
    let white = true;
    for (let i = 0; i < data.length; i += 16)
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) {
        white = false;
        break;
      }
    if (white) return row;
  }
  return y;
}

export async function exportElementToPdf(element: HTMLElement, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    // Lo que no sale al imprimir (botones, herramientas…) tampoco sale en el PDF.
    ignoreElements: (el) => el.classList?.contains("no-print") ?? false,
  });
  const ctx = canvas.getContext("2d")!;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const contentW = PAGE_W - 2 * MARGIN;
  const pxPerMm = canvas.width / contentW;
  const pageHeightPx = Math.floor((PAGE_H - 2 * MARGIN) * pxPerMm);

  let y = 0;
  let first = true;
  while (y < canvas.height) {
    let end = Math.min(y + pageHeightPx, canvas.height);
    // Se corta por una zona en blanco (entre líneas), como mucho subiendo un 15 % de la página.
    if (end < canvas.height) end = blankRowNear(ctx, canvas.width, end, Math.floor(pageHeightPx * 0.15));
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = end - y;
    const sctx = slice.getContext("2d")!;
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, slice.width, slice.height);
    sctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.8), "JPEG", MARGIN, MARGIN, contentW, slice.height / pxPerMm);
    first = false;
    y = end;
  }

  const name = `${fileName.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "apuntes"}.pdf`;
  const blob = pdf.output("blob");
  const file = new File([blob], name, { type: "application/pdf" });
  // iPad/iPhone: menú de compartir (Guardar en Archivos, Imprimir…).
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (err) {
      // Si ella cierra el menú sin elegir nada, no es un error.
      if ((err as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
