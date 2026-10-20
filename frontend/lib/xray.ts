/**
 * Física simplificada de una radiografía, para el simulador (se calcula en el propio dispositivo, sin IA).
 * Los "maniquíes" salen de la anatomía real del atlas 3D (scripts/xray): para cada punto, cuántos cm de
 * hueso y de tejido blando atraviesa el haz. La atenuación sigue la ley de Beer-Lambert con coeficientes
 * que bajan con la energía (efecto fotoeléctrico ∝ 1/E³): a más kV, más penetración y menos contraste.
 * Además hay radiación dispersa (vela la imagen en las zonas gruesas) y una rejilla que la quita.
 */

export type PhantomId = "mano" | "rodilla" | "torax" | "pelvis";
export const PHANTOMS: PhantomId[] = ["mano", "rodilla", "torax", "pelvis"];

export interface Phantom {
  w: number;
  h: number;
  soft: Float32Array; // cm de tejido blando que atraviesa el haz
  bone: Float32Array; // cm de hueso
  body: Uint8Array; // 1 donde hay paciente (para medir la imagen)
  boneMask: Uint8Array; // 1 donde hay hueso (para medir el contraste)
  thickness: number; // grosor típico del paciente (cm), para la radiación dispersa
}

export interface Settings {
  kv: number; // 40–150
  mas: number; // 0.5–100
  dist: number; // distancia foco-detector en cm (90–200)
  grid: boolean; // rejilla antidifusora
}

// Valores de referencia para cada exploración (los que usaría un técnico).
export const IDEAL: Record<PhantomId, Settings> = {
  mano: { kv: 50, mas: 2.5, dist: 100, grid: false },
  rodilla: { kv: 70, mas: 6, dist: 100, grid: true },
  torax: { kv: 120, mas: 3, dist: 180, grid: true },
  pelvis: { kv: 75, mas: 25, dist: 115, grid: true },
};

/** Coeficientes de atenuación lineal (cm⁻¹) para un haz de kV dado (energía efectiva ≈ kV/2,5). */
export function mu(kv: number) {
  const e = kv / 2.5;
  const photo = Math.pow(30 / e, 3);
  // Hueso "efectivo": los huesos del modelo son macizos, pero por dentro son sobre todo trabeculares
  // (con médula), así que su atenuación media es bastante menor que la del hueso cortical.
  return { soft: 0.17 + 0.09 * photo, bone: 0.45 + 0.25 * photo };
}

/** Exposición relativa que sale del tubo (∝ mAs · kV² / d²). */
export function tubeOutput(s: Settings) {
  return s.mas * Math.pow(s.kv / 70, 2) * Math.pow(100 / s.dist, 2);
}

// La rejilla deja pasar ~70 % de la radiación útil y solo ~12 % de la dispersa (por eso pide más mAs).
const GRID_PRIMARY = 0.7;
const GRID_SCATTER = 0.12;

/** Proporción dispersa/útil: crece con el grosor del paciente y un poco con los kV. */
function scatterRatio(thicknessCm: number, kv: number) {
  return Math.min(6, 0.012 * Math.pow(thicknessCm, 1.6) * (0.75 + kv / 280));
}

// ---------- Carga de los maniquíes (PNG: R = hueso, G = tejido blando) ----------

interface Meta {
  boneScale: number;
  softScale: number;
  exams: Record<PhantomId, { w: number; h: number; cmPerPx: number; labels: { bones: string[]; organs: string[] } }>;
}

let metaPromise: Promise<Meta> | null = null;
const cache = new Map<PhantomId, Promise<Phantom>>();

export function loadPhantom(id: PhantomId): Promise<Phantom> {
  let p = cache.get(id);
  if (!p) {
    p = Promise.all([loadMeta(), loadImage(`/xray/${id}.png`)]).then(([meta, img]) =>
      decode(meta, meta.exams[id].w, meta.exams[id].h, img),
    );
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

function loadMeta() {
  metaPromise ??= fetch("/xray/meta.json").then((r) => {
    if (!r.ok) throw new Error(`meta ${r.status}`);
    return r.json() as Promise<Meta>;
  });
  return metaPromise;
}

// ---------- Posicionamiento: cada región girada cada 5°, con un campo fijo en cm ----------

export interface PosRegion {
  w: number;
  h: number;
  cmPerPx: number;
  /** Por ángulo: puntos de centraje [x, y] y zonas que deben salir [x0, y0, x1, y1], en píxeles. */
  angles: Record<
    string,
    { points: Record<string, [number, number]>; rois: Record<string, [number, number, number, number]> }
  >;
}
interface PosMeta {
  boneScale: number;
  softScale: number;
  regions: Record<PhantomId, PosRegion>;
}

let posMetaPromise: Promise<PosMeta> | null = null;
export function loadPosMeta() {
  posMetaPromise ??= fetch("/xray/pos/meta.json").then((r) => {
    if (!r.ok) throw new Error(`pos meta ${r.status}`);
    return r.json() as Promise<PosMeta>;
  });
  posMetaPromise.catch(() => (posMetaPromise = null));
  return posMetaPromise;
}

const posCache = new Map<string, Promise<Phantom>>();
/** La región vista con el paciente girado `angle` grados (se usa con simulate(region, …)). */
export function loadPositionView(region: PhantomId, angle: number): Promise<Phantom> {
  const key = `${region}_${angle}`;
  let p = posCache.get(key);
  if (!p) {
    p = Promise.all([loadPosMeta(), loadImage(`/xray/pos/${key}.png`)]).then(([meta, img]) => {
      const { w, h } = meta.regions[region];
      return decode(meta, w, h, img);
    });
    p.catch(() => posCache.delete(key));
    posCache.set(key, p);
  }
  return p;
}

/** Qué pieza hay en cada punto de la radiografía (hueso y órgano), con los nombres del atlas. */
export interface Labels {
  w: number;
  h: number;
  bone: Uint8Array; // número de hueso (1…; 0 = nada)
  organ: Uint8Array; // número de órgano (1…; 0 = nada)
  boneNames: string[];
  organNames: string[];
}

const labelCache = new Map<PhantomId, Promise<Labels>>();
export function loadLabels(id: PhantomId): Promise<Labels> {
  let p = labelCache.get(id);
  if (!p) {
    p = Promise.all([loadMeta(), loadImage(`/xray/${id}-labels.png`)]).then(([meta, img]) => {
      const { w, h, labels } = meta.exams[id];
      const data = pixelsOf(img, w, h);
      const n = w * h;
      const bone = new Uint8Array(n);
      const organ = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        bone[i] = data[i * 4];
        organ[i] = data[i * 4 + 1];
      }
      return { w, h, bone, organ, boneNames: labels.bones, organNames: labels.organs };
    });
    p.catch(() => labelCache.delete(id));
    labelCache.set(id, p);
  }
  return p;
}

function pixelsOf(img: HTMLImageElement, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error(src));
    img.src = src;
  });
}

function decode(meta: { boneScale: number; softScale: number }, w: number, h: number, img: HTMLImageElement) {
  const data = pixelsOf(img, w, h);
  const n = w * h;
  const p: Phantom = {
    w,
    h,
    soft: new Float32Array(n),
    bone: new Float32Array(n),
    body: new Uint8Array(n),
    boneMask: new Uint8Array(n),
    thickness: 0,
  };
  const tex = texture(w, h);
  const thick: number[] = [];
  for (let i = 0; i < n; i++) {
    const bone = data[i * 4] * meta.boneScale;
    // Textura trabecular: el hueso no es uniforme por dentro.
    p.bone[i] = bone * (1 + 0.09 * tex[i]);
    p.soft[i] = data[i * 4 + 1] * meta.softScale;
    p.body[i] = p.soft[i] > 0.5 || bone > 0.05 ? 1 : 0;
    p.boneMask[i] = bone > 0.4 ? 1 : 0;
    if (p.body[i]) thick.push(p.soft[i] + bone);
  }
  thick.sort((a, b) => a - b);
  p.thickness = thick[Math.floor(thick.length * 0.85)] ?? 0;
  return p;
}

// Ruido de varias escalas, fijo (siempre el mismo dibujo): textura del hueso y ruido cuántico.
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function gaussianField(n: number, seed: number) {
  const rnd = rng(seed);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.max(rnd(), 1e-9);
    f[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  }
  return f;
}

function texture(w: number, h: number) {
  const out = new Float32Array(w * h);
  for (const [scale, amp] of [
    [1, 0.5],
    [2, 0.35],
    [4, 0.25],
  ]) {
    const gw = Math.ceil(w / scale) + 1;
    const g = gaussianField(gw * (Math.ceil(h / scale) + 1), 7 + scale);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[y * w + x] += amp * g[Math.floor(y / scale) * gw + Math.floor(x / scale)];
  }
  return out;
}

const noiseCache = new Map<number, Float32Array>();
function noiseField(n: number) {
  let f = noiseCache.get(n);
  if (!f) {
    f = gaussianField(n, 12345);
    noiseCache.set(n, f);
  }
  return f;
}

/** Desenfoque grande y barato (la radiación dispersa es una niebla suave): media de bloques + interpolación. */
function fog(src: Float32Array, w: number, h: number, block = 12) {
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const sum = new Float32Array(bw * bh);
  const cnt = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = Math.floor(y / block) * bw + Math.floor(x / block);
      sum[k] += src[y * w + x];
      cnt[k]++;
    }
  let avg = sum.map((s, k) => s / cnt[k]);
  // Dos pasadas de suavizado entre bloques vecinos.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(avg.length);
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= bh || xx >= bw) continue;
            s += avg[yy * bw + xx];
            c++;
          }
        next[y * bw + x] = s / c;
      }
    avg = next;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1.001, Math.max(0, x / block - 0.5));
      const fy = Math.min(bh - 1.001, Math.max(0, y / block - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const x1 = Math.min(bw - 1, x0 + 1);
      const y1 = Math.min(bh - 1, y0 + 1);
      out[y * w + x] =
        avg[y0 * bw + x0] * (1 - tx) * (1 - ty) +
        avg[y0 * bw + x1] * tx * (1 - ty) +
        avg[y1 * bw + x0] * (1 - tx) * ty +
        avg[y1 * bw + x1] * tx * ty;
    }
  return out;
}

// Calibración del detector para cada exploración (como hace el equipo): con los valores ideales,
// el punto típico del paciente (hueso o tejido blando) queda algo por encima de la mitad de la curva.
const TARGET = 1.4;
const calibration = new Map<Phantom, number>();
function referenceOf(id: PhantomId, p: Phantom) {
  let ref = calibration.get(p);
  if (ref === undefined) {
    const { signal } = detector(p, IDEAL[id]);
    const vals: number[] = [];
    for (let i = 0; i < signal.length; i++) if (p.body[i]) vals.push(signal[i]);
    vals.sort((a, b) => a - b);
    ref = (vals[Math.floor(vals.length / 2)] ?? 1) / TARGET;
    calibration.set(p, ref);
  }
  return ref;
}

/** Lo que llega al detector: radiación útil (atravesada) + dispersa (niebla), con o sin rejilla. */
function detector(p: Phantom, s: Settings) {
  const m = mu(s.kv);
  const out = tubeOutput(s);
  const n = p.w * p.h;
  const primary = new Float32Array(n);
  for (let i = 0; i < n; i++) primary[i] = out * Math.exp(-(m.soft * p.soft[i] + m.bone * p.bone[i]));
  // La dispersa sale del propio paciente: proporcional a lo que entra en él y a su grosor.
  const spr = scatterRatio(p.thickness, s.kv);
  const inBody = new Float32Array(n);
  for (let i = 0; i < n; i++) inBody[i] = p.body[i] ? primary[i] : 0;
  const scatter = fog(inBody, p.w, p.h);
  const gp = s.grid ? GRID_PRIMARY : 1;
  const gs = s.grid ? GRID_SCATTER : 1;
  const signal = new Float32Array(n);
  for (let i = 0; i < n; i++) signal[i] = primary[i] * gp + scatter[i] * spr * gs;
  return { signal, scatterShare: (spr * gs) / (gp + spr * gs) };
}

const QUANTA = 1400; // fotones por píxel con una exposición "correcta" (ruido ≈ 2,5 %)
const GAMMA = 1.5; // pendiente de la curva del detector (contraste de la imagen)

export interface Result {
  pixels: Uint8ClampedArray; // 0 = negro (mucha radiación), 255 = blanco
  brightness: number; // brillo medio del paciente (0–1)
  contrast: number; // diferencia hueso / tejido blando (0–1)
  noise: number; // ruido relativo en el tejido blando
  dose: number; // dosis en la piel, relativa a la ideal de la exploración
  scatter: number; // parte de la señal que es radiación dispersa (0–1)
}

export function simulate(id: PhantomId, p: Phantom, s: Settings): Result {
  const { signal, scatterShare } = detector(p, s);
  const ref = referenceOf(id, p);
  const nf = noiseField(signal.length);
  const px = new Uint8ClampedArray(signal.length);
  let sumB = 0;
  let nB = 0;
  let boneSum = 0;
  let nBone = 0;
  let softSum = 0;
  let nSoft = 0;
  let softQuanta = 0;
  for (let i = 0; i < px.length; i++) {
    const exposure = signal[i] / ref;
    const quanta = Math.max(exposure * QUANTA, 0.5);
    const noisy = Math.max(1e-6, (quanta + nf[i] * Math.sqrt(quanta)) / QUANTA);
    px[i] = Math.round(255 / (1 + Math.pow(noisy, GAMMA))); // más exposición → más negro
    if (!p.body[i]) continue;
    const clean = 1 / (1 + Math.pow(exposure, GAMMA));
    sumB += clean;
    nB++;
    if (p.boneMask[i]) {
      boneSum += clean;
      nBone++;
    } else {
      softSum += clean;
      nSoft++;
      softQuanta += quanta;
    }
  }
  return {
    pixels: px,
    brightness: nB ? sumB / nB : 0,
    contrast: nBone && nSoft ? boneSum / nBone - softSum / nSoft : 0,
    noise: nSoft ? 1 / Math.sqrt(softQuanta / nSoft) : 0,
    dose: doseOf(s) / doseOf(IDEAL[id]),
    scatter: scatterShare,
  };
}

/** Dosis en la entrada de la piel (relativa): ∝ mAs · kV² / d² (la piel está a ~d − 20 cm del foco). */
export function doseOf(s: Settings) {
  return s.mas * Math.pow(s.kv / 70, 2) * Math.pow(100 / Math.max(s.dist - 20, 30), 2);
}

export type Verdict = "under" | "over" | "lowContrast" | "scatter" | "noisy" | "highDose" | "good";

const idealContrast = new Map<Phantom, number>();

/** Contraste que da la exploración con los valores recomendados (cada parte del cuerpo tiene el suyo). */
export function idealContrastOf(id: PhantomId, p: Phantom) {
  let ref = idealContrast.get(p);
  if (ref === undefined) {
    ref = simulate(id, p, IDEAL[id]).contrast;
    idealContrast.set(p, ref);
  }
  return ref;
}

export function verdict(id: PhantomId, p: Phantom, r: Result, s: Settings): Verdict {
  const ref = idealContrastOf(id, p);
  if (r.brightness > 0.62) return "under";
  // Sin rejilla en una zona gruesa, la radiación dispersa vela la imagen (la oscurece y le quita contraste).
  if (!s.grid && r.scatter > 0.38) return "scatter";
  if (r.brightness < 0.24) return "over";
  if (r.noise > 0.05) return "noisy";
  if (r.contrast < ref * 0.6) return "lowContrast";
  // La imagen es buena, pero con mucha más radiación de la necesaria (principio ALARA).
  if (r.dose > 2.5) return "highDose";
  return "good";
}
