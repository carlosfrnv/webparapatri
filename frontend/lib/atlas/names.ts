import { BONES } from "./bones";
import { MUSCLES } from "./muscles";
import { NERVES } from "./nerves";
import { ORGANS } from "./organs";
import { VESSELS } from "./vessels";

export type AtlasLang = "es" | "pt";
export type Layer = "bones" | "muscles" | "organs" | "vessels" | "nerves";
export const LAYERS: Layer[] = ["bones", "muscles", "organs", "vessels", "nerves"];

const ORD_EN = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
];
const ORD = {
  es: {
    m: ["primer", "segundo", "tercer", "cuarto", "quinto"],
    f: [
      "primera",
      "segunda",
      "tercera",
      "cuarta",
      "quinta",
      "sexta",
      "séptima",
      "octava",
      "novena",
      "décima",
      "undécima",
      "duodécima",
    ],
  },
  pt: {
    m: ["primeiro", "segundo", "terceiro", "quarto", "quinto"],
    f: [
      "primeira",
      "segunda",
      "terceira",
      "quarta",
      "quinta",
      "sexta",
      "sétima",
      "oitava",
      "nona",
      "décima",
      "décima primeira",
      "décima segunda",
    ],
  },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Huesos con nombre "de serie": costillas, falanges, metacarpianos, vértebras y dientes. */
function patterned(en: string, lang: AtlasLang): string | null {
  let m = en.match(/^(\w+) rib$/);
  if (m) return cap(`${ORD[lang].f[ORD_EN.indexOf(m[1].toLowerCase())]} ${lang === "es" ? "costilla" : "costela"}`);

  m = en.match(/^Costal cartilage of (\w+) rib$/);
  if (m) {
    const n = ORD[lang].f[ORD_EN.indexOf(m[1])];
    return lang === "es" ? `Cartílago costal de la ${n} costilla` : `Cartilagem costal da ${n} costela`;
  }

  m = en.match(/^(Distal|Middle|Proximal) phalanx of (\w+) finger of (hand|foot)$/);
  if (m) {
    const kind = { Distal: "distal", Middle: lang === "es" ? "media" : "média", Proximal: "proximal" }[m[1]]!;
    const n = ORD[lang].m[ORD_EN.indexOf(m[2])];
    const where = lang === "es" ? (m[3] === "hand" ? "de la mano" : "del pie") : m[3] === "hand" ? "da mão" : "do pé";
    return lang === "es" ? `Falange ${kind} del ${n} dedo ${where}` : `Falange ${kind} do ${n} dedo ${where}`;
  }

  m = en.match(/^(\w+) (metacarpal|metatarsal) bone$/);
  if (m) {
    const n = cap(ORD[lang].m[ORD_EN.indexOf(m[1].toLowerCase())]);
    const bone =
      lang === "es"
        ? m[2] === "metacarpal"
          ? "metacarpiano"
          : "metatarsiano"
        : m[2] === "metacarpal"
          ? "metacarpo"
          : "metatarso";
    return `${n} ${bone}`;
  }

  m = en.match(/^Vertebra ([CTL])(\d+)$/);
  if (m) {
    const region = {
      C: lang === "es" ? "cervical" : "cervical",
      T: lang === "es" ? "torácica" : "torácica",
      L: lang === "es" ? "lumbar" : "lombar",
    }[m[1]]!;
    return `Vértebra ${region} ${m[1]}${m[2]}`;
  }

  m = en.match(/^(Upper|Lower) (first |second )?(medial incisor|lateral incisor|canine|premolar|molar tooth)$/);
  if (m) {
    const jaw = m[1] === "Upper" ? "superior" : "inferior";
    const n = m[2] ? ORD[lang].m[ORD_EN.indexOf(m[2].trim())] + " " : "";
    const tooth = {
      "medial incisor": lang === "es" ? "incisivo central" : "incisivo central",
      "lateral incisor": "incisivo lateral",
      canine: "canino",
      premolar: lang === "es" ? "premolar" : "pré-molar",
      "molar tooth": "molar",
    }[m[3]]!;
    return cap(`${n}${tooth} ${jaw}`);
  }
  return null;
}

/** Nombre de la pieza en el idioma de la web (o el original si no hay traducción). */
export function translate(en: string, lang: AtlasLang): string {
  const pair = BONES[en] ?? MUSCLES[en] ?? ORGANS[en] ?? VESSELS[en] ?? NERVES[en];
  if (pair) return lang === "es" ? pair[0] : pair[1];
  return patterned(en, lang) ?? en;
}

export interface Part {
  /** Nombre del nodo en el modelo, p. ej. "Femur.r". */
  id: string;
  /** Nombre en inglés sin el lado: "Femur". */
  en: string;
  side: "l" | "r" | null;
  layer: Layer;
}

export function parsePart(nodeName: string, layer: Layer): Part {
  const m = nodeName.match(/^(.*)\.([lr])$/);
  return { id: nodeName, en: m ? m[1] : nodeName, side: m ? (m[2] as "l" | "r") : null, layer };
}

export function sideLabel(side: Part["side"], lang: AtlasLang) {
  if (!side) return "";
  return lang === "es" ? (side === "l" ? "izquierdo" : "derecho") : side === "l" ? "esquerdo" : "direito";
}

/** Para buscar sin tildes ni mayúsculas. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
