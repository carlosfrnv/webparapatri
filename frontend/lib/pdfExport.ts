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

/** Hace el PDF de `element` (lo que tiene la clase no-print no sale). */
export async function makePdf(element: HTMLElement, fileName: string) {
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
