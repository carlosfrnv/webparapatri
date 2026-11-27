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
// Ancho (en píxeles de pantalla) con el que se maqueta cada hoja del PDF.
const PRINT_WIDTH = 740;
// Lo que nunca se parte entre dos hojas.
const ATOMS = new Set([
  "P",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "TR",
  "IMG",
  "FIGURE",
  "SVG",
  "PRE",
  "BLOCKQUOTE",
  "DT",
  "DD",
  "CANVAS",
]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

interface Atom {
  el: Element;
  // Contenedores de los que cuelga (de fuera adentro), para repetirlos en cada hoja: tarjetas, listas, tablas…
  chain: Element[];
}

const hasOwnText = (el: Element) =>
  [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");

/** Las piezas que no se parten, en orden: párrafos, viñetas, filas, imágenes, y bloques pequeños enteros. */
function collectAtoms(root: Element, pageHeight: number) {
  const atoms: Atom[] = [];
  const walk = (el: Element, chain: Element[]) => {
    for (const child of el.children) {
      if (child.classList.contains("no-print")) continue;
      const tag = child.tagName.toUpperCase();
      const small = child.getBoundingClientRect().height <= pageHeight * 0.35;
      if (ATOMS.has(tag) || child.children.length === 0 || hasOwnText(child) || (small && tag !== "TABLE"))
        atoms.push({ el: child, chain });
      else walk(child, [...chain, child]);
    }
  };
  walk(root, []);
  return atoms;
}

/**
 * Reparte el contenido en hojas: se van metiendo piezas en una hoja (con el mismo estilo que la página) hasta que no
 * caben, y se empieza otra. Así nunca se corta una línea por la mitad. Cada hoja es un elemento de verdad, fuera de la
 * pantalla, que luego se fotografía entera.
 */
async function paginate(source: HTMLElement, host: HTMLElement, pageHeight: number) {
  const atoms = collectAtoms(source, pageHeight);
  const pages: HTMLElement[] = [];
  let page!: HTMLElement;
  // Contenedores ya abiertos en la hoja actual: [original, copia en la hoja].
  let open: [Element, Element][] = [];
  let last: Element | null = null;
  const newPage = () => {
    page = source.cloneNode(false) as HTMLElement;
    page.removeAttribute("id");
    Object.assign(page.style, {
      width: `${PRINT_WIDTH}px`,
      maxWidth: "none",
      margin: "0",
      boxShadow: "none",
      border: "0",
      borderRadius: "0",
    });
    host.appendChild(page);
    pages.push(page);
    open = [];
    last = null;
  };
  const place = (atom: Atom) => {
    let keep = 0;
    while (keep < open.length && keep < atom.chain.length && open[keep][0] === atom.chain[keep]) keep++;
    open = open.slice(0, keep);
    const created: Element[] = [];
    for (const original of atom.chain.slice(keep)) {
      const copy = original.cloneNode(false) as Element;
      (open.length ? open[open.length - 1][1] : page).appendChild(copy);
      open.push([original, copy]);
      created.push(copy);
    }
    const copy = atom.el.cloneNode(true) as Element;
    (open.length ? open[open.length - 1][1] : page).appendChild(copy);
    return { copy, created, keep };
  };
  newPage();
  for (const atom of atoms) {
    const before = open;
    const { copy, created } = place(atom);
    if (page.getBoundingClientRect().height > pageHeight && page.childNodes.length > 1 && last !== null) {
      // No cabe: se quita de esta hoja (con los contenedores abiertos solo para ella) y va a la siguiente.
      copy.remove();
      if (created.length) created[0].remove();
      open = before;
      // Un título no se queda solo al final de la hoja: se lleva a la siguiente con lo que le sigue.
      const moved: Element | null = last && HEADINGS.has((last as Element).tagName.toUpperCase()) ? last : null;
      const movedAtom = moved ? atoms[atoms.indexOf(atom) - 1] : null;
      if (moved && page.getBoundingClientRect().height > 0) (moved as Element).remove();
      newPage();
      if (movedAtom) place(movedAtom);
      last = place(atom).copy;
    } else last = copy;
  }
  // Las imágenes de las copias tienen que estar cargadas antes de la foto.
  await Promise.all(
    [...host.querySelectorAll("img")].map((img) => (img.complete ? null : img.decode().catch(() => undefined))),
  );
  return pages.filter((p) => p.childNodes.length > 0);
}

/** Hace el PDF de `element` (lo que tiene la clase no-print no sale), hoja a hoja. */
export async function makePdf(
  element: HTMLElement,
  fileName: string,
  onProgress?: (page: number, pages: number) => void,
) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const contentW = PAGE_W - 2 * MARGIN;
  const contentH = PAGE_H - 2 * MARGIN;
  const pageHeight = Math.floor((contentH * PRINT_WIDTH) / contentW);
  // Copia de trabajo fuera de la pantalla, con el ancho de un folio (en el móvil la página es más estrecha).
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-30000px;top:0;width:" + PRINT_WIDTH + "px";
  document.body.appendChild(host);
  try {
    const source = element.cloneNode(true) as HTMLElement;
    source.removeAttribute("id");
    Object.assign(source.style, { width: `${PRINT_WIDTH}px`, maxWidth: "none", margin: "0" });
    host.appendChild(source);
    const pages = await paginate(source, host, pageHeight);
    source.remove();

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    for (const [i, page] of pages.entries()) {
      onProgress?.(i + 1, pages.length);
      const h = page.getBoundingClientRect().height;
      // Tope de píxeles por hoja que Safari (iPhone/iPad) aguanta de sobra.
      const scale = Math.min(2, Math.sqrt(6_000_000 / (PRINT_WIDTH * h)));
      const canvas = await html2canvas(page, {
        scale,
        backgroundColor: "#ffffff",
        useCORS: true,
        imageTimeout: 8000,
        logging: false,
        ignoreElements: (el) => el.classList?.contains("no-print") ?? false,
      });
      if (i > 0) pdf.addPage();
      // Si una pieza sola no cabía en una hoja (una imagen enorme), se reduce para que quepa.
      let w = contentW;
      let hMm = (h * contentW) / PRINT_WIDTH;
      if (hMm > contentH) {
        w = (w * contentH) / hMm;
        hMm = contentH;
      }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", MARGIN + (contentW - w) / 2, MARGIN, w, hMm);
      canvas.width = canvas.height = 0;
    }
    const name = `${fileName.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "apuntes"}.pdf`;
    return new File([pdf.output("blob")], name, { type: "application/pdf" });
  } finally {
    host.remove();
  }
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
