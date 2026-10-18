import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";

// Lo poco del DOM que se usa aquí (el servidor no tiene los tipos del navegador).
interface Node {
  nodeType: number;
  textContent: string | null;
  parentNode: Node | null;
  childNodes: ArrayLike<Node>;
}
interface Element extends Node {
  localName: string;
  namespaceURI: string | null;
  getAttribute(name: string): string | null;
  getAttributeNS(ns: string, name: string): string | null;
  getElementsByTagNameNS(ns: string, name: string): ArrayLike<Element>;
  replaceChild(a: Node, b: Node): void;
  appendChild(a: Node): void;
  setAttribute(name: string, value: string): void;
}
interface Doc extends Element {
  createElementNS(ns: string, name: string): Element;
  createTextNode(text: string): Node;
}

/**
 * Fórmulas del editor de ecuaciones de Word y PowerPoint (OMML). Los extractores de texto se las saltan,
 * así que antes de extraer el texto se cambian por su versión escrita en una línea: (a+b)/(2c), x^2, √(x)…
 */

const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";

const kids = (el: Element) =>
  Array.from({ length: el.childNodes.length }, (_, i) => el.childNodes[i]).filter(
    (n): n is Element => n.nodeType === 1,
  );
const child = (el: Element, name: string) => kids(el).find((k) => k.localName === name && k.namespaceURI === M);
const attr = (el: Element | undefined, name: string) =>
  el?.getAttributeNS(M, "val") || el?.getAttribute(`m:${name}`) || el?.getAttribute("m:val") || "";

/** Entre paréntesis si es más que un símbolo o un número. */
const group = (s: string) => (/^[\p{L}\p{N}.,]+$/u.test(s) || /^\(.*\)$/.test(s) ? s : `(${s})`);

function lin(node: Node | undefined): string {
  if (!node) return "";
  const el = node as Element;
  if (node.nodeType !== 1) return "";
  if (el.namespaceURI !== M) return kids(el).map(lin).join("");
  const part = (name: string) => lin(child(el, name));
  switch (el.localName) {
    case "t":
      return el.textContent ?? "";
    case "f":
      return `${group(part("num"))}/${group(part("den"))}`;
    case "sSup":
      return `${group(part("e"))}^${group(part("sup"))}`;
    case "sSub":
      return `${part("e")}_${group(part("sub"))}`;
    case "sSubSup":
      return `${part("e")}_${group(part("sub"))}^${group(part("sup"))}`;
    case "sPre":
      return `_${group(part("sub"))}^${group(part("sup"))}${part("e")}`;
    case "rad": {
      const deg = part("deg");
      return `${deg ? `${deg}√` : "√"}(${part("e")})`;
    }
    case "nary": {
      const chr = attr(child(child(el, "naryPr") ?? el, "chr"), "chr") || "∫";
      const sub = part("sub");
      const sup = part("sup");
      return `${chr}${sub ? `_${group(sub)}` : ""}${sup ? `^${group(sup)}` : ""} ${part("e")}`;
    }
    case "d": {
      const pr = child(el, "dPr");
      const beg = pr && child(pr, "begChr") ? attr(child(pr, "begChr"), "begChr") : "(";
      const end = pr && child(pr, "endChr") ? attr(child(pr, "endChr"), "endChr") : ")";
      const sep = pr && child(pr, "sepChr") ? attr(child(pr, "sepChr"), "sepChr") : ", ";
      return `${beg}${kids(el)
        .filter((k) => k.localName === "e")
        .map(lin)
        .join(sep)}${end}`;
    }
    case "func":
      return `${part("fName")}(${part("e")})`;
    case "limLow":
      return `${part("e")}_${group(part("lim"))}`;
    case "limUpp":
      return `${part("e")}^${group(part("lim"))}`;
    case "bar":
    case "acc":
    case "groupChr":
    case "box":
    case "borderBox":
      return part("e");
    case "m":
      return kids(el)
        .filter((k) => k.localName === "mr")
        .map((r) => `[${kids(r).map(lin).join(", ")}]`)
        .join(" ");
    case "eqArr":
      return kids(el)
        .filter((k) => k.localName === "e")
        .map(lin)
        .join("; ");
    default:
      // rPr, ctrlPr y propiedades: nada. Contenedores (oMath, e, num…): su contenido.
      if (el.localName.endsWith("Pr")) return "";
      return kids(el).map(lin).join("");
  }
}

/** Una fórmula OMML escrita en una línea. */
export function ommlToText(el: Element) {
  return lin(el).replace(/\s+/g, " ").trim();
}

/**
 * Cambia cada fórmula del XML por un trozo de texto normal con la fórmula escrita en una línea.
 * `run(text)` devuelve el XML de texto propio del formato (Word: w:r/w:t; PowerPoint: a:r/a:t).
 */
function replaceFormulas(xml: string, run: (doc: Doc, text: string) => Element) {
  if (!xml.includes("oMath")) return xml;
  const doc = new DOMParser().parseFromString(xml, "text/xml") as unknown as Doc;
  const maths = Array.from(doc.getElementsByTagNameNS(M, "oMath")).filter(
    // Las que van dentro de un oMathPara se cambian con él.
    (m) => !(m.parentNode as Element | null)?.localName?.startsWith("oMath"),
  );
  const paras = Array.from(doc.getElementsByTagNameNS(M, "oMathPara"));
  let changed = false;
  for (const el of [...paras, ...maths]) {
    const text = ` ${ommlToText(el)} `;
    // En PowerPoint la fórmula va dentro de mc:AlternateContent (con una imagen de reserva): se cambia todo.
    let target: Element = el;
    for (let p = el.parentNode as Element | null; p; p = p.parentNode as Element | null)
      if (p.localName === "AlternateContent") {
        target = p;
        break;
      }
    if (!target.parentNode) continue;
    (target.parentNode as Element).replaceChild(run(doc, text), target);
    changed = true;
  }
  return changed ? new XMLSerializer().serializeToString(doc as never) : xml;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";

function textRun(doc: Doc, ns: string, prefix: string, text: string) {
  const r = doc.createElementNS(ns, `${prefix}:r`);
  const t = doc.createElementNS(ns, `${prefix}:t`);
  if (prefix === "w") t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(text));
  r.appendChild(t);
  return r;
}

/** Word o PowerPoint con sus fórmulas cambiadas por texto (si no tiene fórmulas, el mismo archivo). */
export async function withLinearFormulas(buffer: Buffer, kind: "docx" | "pptx"): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files).filter((n) =>
      kind === "docx" ? /^word\/(document|footnotes|endnotes)\.xml$/.test(n) : /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    let changed = false;
    for (const name of files) {
      const xml = await zip.file(name)!.async("string");
      const out = replaceFormulas(xml, (doc, text) =>
        kind === "docx" ? textRun(doc, W, "w", text) : textRun(doc, A, "a", text),
      );
      if (out !== xml) {
        zip.file(name, out);
        changed = true;
      }
    }
    return changed ? await zip.generateAsync({ type: "nodebuffer" }) : buffer;
  } catch (err) {
    console.error("No se han podido convertir las fórmulas:", err);
    return buffer;
  }
}
