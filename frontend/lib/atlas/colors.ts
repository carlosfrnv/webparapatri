import type { Layer } from "./names";

/** Colores de cada pieza del atlas (los usan el Atlas 3D y los cortes). */

// Gama de rojos de los músculos (de más claro a más oscuro y algún tono más anaranjado o granate).
const MUSCLE_TONES = [
  "#d9534f",
  "#b83b3b",
  "#e06c5a",
  "#9e2f35",
  "#c9473f",
  "#e5826e",
  "#a8323a",
  "#cf5a4a",
  "#8f2a30",
  "#d4664f",
  "#bb4a44",
  "#e07a64",
];
// Tendones, ligamentos y similares: color blanco nacarado, como en los atlas.
const CONNECTIVE = /tendon|ligament|tract|linea alba|arch|ring|tarsus|trochlea/i;
const CONNECTIVE_COLOR = "#ece4d4";

// Órganos: cada uno con su color habitual en los atlas; el resto, tonos rosados variados.
const ORGAN_COLORS: [RegExp, string][] = [
  [/liver/i, "#8b3a2f"],
  [/lung|bronch|trachea|epiglottis/i, "#e8a3a8"],
  [/kidney|renal|suprarenal/i, "#8e2f3a"],
  [/stomach|oesophagus|duodenum|jejunum|colon|appendix|taenia|pharynx|soft palate|uvula/i, "#e4a08a"],
  [/gallbladder|bile/i, "#4f8a4b"],
  [/pancrea|gland|hypophysis|prostate/i, "#e3c27a"],
  [/omentum|mesocolon|meso-appendix/i, "#f0dca0"],
  [/bladder|ureter|urethra/i, "#d9a441"],
];
const ORGAN_TONES = ["#e7a1a1", "#d98c8c", "#ecb3a4", "#d4787f", "#e8b0b8"];

// Corazón y vasos: arterias rojas y venas azules (las pulmonares al revés, como en los atlas).
function vesselColor(en: string) {
  if (/leaflet|papillary/i.test(en)) return "#f2d7c9";
  if (/atrium|ventricle/i.test(en)) return "#a32b35";
  if (/pulmonary trunk|pulmonary artery|artery of (left|right) lung|lobar artery|lingular artery/i.test(en))
    return "#3b6fd1";
  if (/pulmonary vein|vein of (left|right) lung/i.test(en)) return "#d02f2f";
  if (/vein|vena|sinus|venous|plexus/i.test(en)) return "#3b6fd1";
  return "#d02f2f";
}

// Sistema nervioso: nervios amarillos, corteza rosada, sustancia blanca y vías blancas, núcleos grises.
function nerveColor(en: string) {
  if (/nerve|plexus|branch|trunk|cauda|ganglion|root|chiasm|optic tract/i.test(en)) return "#f2c94c";
  if (/white matter|tract|fasciculus|commissure|corpus callosum|fornix|stria|peduncle/i.test(en)) return "#f3efe6";
  if (/retina|sclera|cornea|lens|vitreous|eyeball|iris/i.test(en)) return /iris/i.test(en) ? "#6b8fb8" : "#f4f1ea";
  if (/nucleus|nuclei|thalamus|putamen|pallidus|caudate|lentiform|body|colliculus|olive|red nucleus/i.test(en))
    return "#a9a2a8";
  if (/ventricle|aqueduct|canal|choroid/i.test(en)) return "#7fb3d5";
  if (/lacrimal|nasolacrimal|cochlea|vestibul|tympanic|auditory/i.test(en)) return "#e8c6a5";
  return /sulcus|fissure/i.test(en) ? "#c99a9f" : "#e3b5b8";
}

const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

export function partColor(layer: Layer, en: string) {
  if (layer === "muscles") return CONNECTIVE.test(en) ? CONNECTIVE_COLOR : MUSCLE_TONES[hash(en) % MUSCLE_TONES.length];
  if (layer === "organs")
    return ORGAN_COLORS.find(([re]) => re.test(en))?.[1] ?? ORGAN_TONES[hash(en) % ORGAN_TONES.length];
  if (layer === "vessels") return vesselColor(en);
  return nerveColor(en);
}
