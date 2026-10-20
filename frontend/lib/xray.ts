/**
 * Física simplificada de una radiografía, para el simulador (se calcula en el propio dispositivo, sin IA).
 * Cada "maniquí" es un mapa de cuánto tejido blando y cuánto hueso atraviesa el haz en cada punto.
 * La atenuación sigue la ley de Beer-Lambert con coeficientes que bajan con la energía
 * (efecto fotoeléctrico ∝ 1/E³), así que a más kV hay más penetración y menos contraste.
 */

export const W = 240;
export const H = 320;

export type PhantomId = "mano" | "torax" | "rodilla";

export interface Phantom {
  soft: Float32Array; // cm de tejido blando que atraviesa el haz
  bone: Float32Array; // cm de hueso
  body: Uint8Array; // 1 donde hay paciente (para medir la imagen)
  boneMask: Uint8Array; // 1 donde hay hueso (para medir el contraste)
  cmPerPx: number;
}

export interface Settings {
  kv: number; // 40–150
  mas: number; // 0.5–100
  dist: number; // distancia foco-detector en cm (90–200)
}

// Valores de referencia para cada exploración (los que usaría un técnico).
export const IDEAL: Record<PhantomId, Settings> = {
  mano: { kv: 55, mas: 4, dist: 100 },
  rodilla: { kv: 65, mas: 8, dist: 100 },
  torax: { kv: 120, mas: 3, dist: 180 },
};

/** Coeficientes de atenuación lineal (cm⁻¹) para un haz de kV dado (energía efectiva ≈ kV/2,5). */
export function mu(kv: number) {
  const e = kv / 2.5;
  const photo = Math.pow(30 / e, 3);
  return { soft: 0.17 + 0.09 * photo, bone: 0.36 + 1.35 * photo };
}

/** Exposición relativa que sale del tubo (∝ mAs · kV² / d²). */
export function tubeOutput(s: Settings) {
  return s.mas * Math.pow(s.kv / 70, 2) * Math.pow(100 / s.dist, 2);
}

// ---------- Maniquíes ----------

function blank(cmPerPx: number): Phantom {
  const n = W * H;
  return {
    soft: new Float32Array(n),
    bone: new Float32Array(n),
    body: new Uint8Array(n),
    boneMask: new Uint8Array(n),
    cmPerPx,
  };
}

/** Suma un cilindro (cápsula) entre dos puntos: la cuerda que recorre el haz en cada píxel. */
function capsule(
  p: Phantom,
  map: "soft" | "bone",
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  sign = 1,
) {
  const k = p.cmPerPx;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const ex = ax + t * dx - x;
      const ey = ay + t * dy - y;
      const d2 = ex * ex + ey * ey;
      if (d2 >= r * r) continue;
      const chord = 2 * Math.sqrt(r * r - d2) * k;
      const i = y * W + x;
      p[map][i] += sign * chord;
      if (map === "soft" && sign > 0) p.body[i] = 1;
      if (map === "bone" && sign > 0) p.boneMask[i] = 1;
    }
}

/** Hueso largo: cortical (anillo) y médula, que cuenta como tejido blando. */
function longBone(p: Phantom, ax: number, ay: number, bx: number, by: number, r: number, wall = 0.38) {
  capsule(p, "bone", ax, ay, bx, by, r);
  capsule(p, "bone", ax, ay, bx, by, r * (1 - wall), -1);
}

function ellipse(
  p: Phantom,
  map: "soft" | "bone",
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  depthCm: number,
  sign = 1,
) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++)
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (q >= 1) continue;
      const i = y * W + x;
      p[map][i] += sign * depthCm * Math.sqrt(1 - q);
      if (map === "soft" && sign > 0) p.body[i] = 1;
      if (map === "bone" && sign > 0) p.boneMask[i] = 1;
    }
}

function hand(): Phantom {
  const p = blank(0.085);
  // Antebrazo y palma
  capsule(p, "soft", 120, 330, 120, 250, 31);
  ellipse(p, "soft", 122, 190, 58, 62, 2.6);
  // Radio y cúbito
  longBone(p, 100, 330, 103, 245, 10);
  longBone(p, 142, 330, 138, 248, 8);
  // Carpo
  for (const [x, y] of [
    [100, 232],
    [116, 228],
    [132, 228],
    [146, 233],
    [104, 214],
    [120, 212],
    [136, 213],
    [150, 218],
  ])
    ellipse(p, "bone", x, y, 8, 7, 1.1);
  // Dedos: [base x, base y, ángulo, longitudes de falanges]
  const fingers: [number, number, number, number[]][] = [
    [80, 205, -0.75, [34, 26, 20]], // pulgar
    [98, 170, -0.12, [42, 30, 20, 16]],
    [120, 166, -0.02, [44, 33, 22, 17]],
    [141, 169, 0.08, [42, 31, 21, 16]],
    [160, 178, 0.2, [38, 25, 17, 14]],
  ];
  fingers.forEach(([x0, y0, a, segs], f) => {
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const total = segs.reduce((s, v) => s + v, 0);
    capsule(p, "soft", x0, y0 + (f === 0 ? 0 : 30), x0 + dx * total, y0 + dy * total, f === 0 ? 10.5 : 9.5);
    let x = x0;
    let y = y0 + (f === 0 ? 0 : 30);
    segs.forEach((l, s) => {
      const nx = x + dx * l;
      const ny = y + dy * l;
      const r = (f === 0 ? 5.6 : 5.2) - s * 0.6;
      longBone(p, x + dx * 2, y + dy * 2, nx - dx * 2, ny - dy * 2, r, 0.45);
      x = nx;
      y = ny;
    });
  });
  return p;
}

function knee(): Phantom {
  const p = blank(0.08);
  // Pierna (muslo arriba, pierna abajo)
  capsule(p, "soft", 120, -20, 120, 340, 62);
  // Fémur con cóndilos
  longBone(p, 118, -20, 118, 120, 17);
  ellipse(p, "bone", 100, 145, 24, 26, 1.5);
  ellipse(p, "bone", 138, 145, 24, 26, 1.5);
  // Rótula (sobrepuesta)
  ellipse(p, "bone", 120, 128, 20, 23, 0.7);
  // Tibia y peroné
  ellipse(p, "bone", 120, 190, 44, 14, 1.5);
  longBone(p, 118, 195, 116, 340, 15);
  longBone(p, 160, 205, 158, 340, 6.5, 0.5);
  return p;
}

function chest(): Phantom {
  const p = blank(0.16);
  // Tronco: elipse de 36 × 22 cm vista de frente
  for (let y = 10; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x - 120) / 112;
      if (Math.abs(nx) >= 1) continue;
      const shoulder = y < 50 ? Math.sqrt(Math.max(0, 1 - ((50 - y) / 45) ** 2)) : 1;
      if (Math.abs(nx) > shoulder) continue;
      const i = y * W + x;
      p.soft[i] = 22 * Math.sqrt(1 - nx * nx);
      p.body[i] = 1;
    }
  // Pulmones (aire: restan tejido) con las cúpulas del diafragma
  for (const side of [-1, 1]) {
    const cx = 120 + side * 50;
    for (let y = 40; y < 270; y++)
      for (let x = 0; x < W; x++) {
        const nx = (x - cx) / 44;
        const ny = (y - 160) / 120;
        if (nx * nx + ny * ny >= 1) continue;
        const dome = 230 + side * 8 - 26 * Math.sqrt(Math.max(0, 1 - ((x - cx) / 46) ** 2));
        if (y > dome) continue;
        if (side * (x - 120) < 14) continue;
        p.soft[y * W + x] -= 13 * Math.sqrt(1 - nx * nx - ny * ny) + 2;
      }
  }
  // Corazón (más hacia la izquierda del paciente = derecha de la imagen)
  ellipse(p, "soft", 132, 200, 44, 40, 9);
  // Costillas y clavículas: se dibujan aparte y se recortan para que sean finas y uniformes
  const ribs = blank(p.cmPerPx);
  for (const side of [-1, 1]) {
    capsule(ribs, "bone", 120 + side * 14, 44, 120 + side * 88, 30, 4);
    for (let k = 0; k < 9; k++) {
      const y0 = 52 + k * 22;
      let px = 120 + side * 10;
      let py = y0;
      for (let s = 1; s <= 12; s++) {
        const t = s / 12;
        const x = 120 + side * (10 + t * 98);
        const y = y0 - 10 * Math.sin(t * Math.PI) + t * 30;
        capsule(ribs, "bone", px, py, x, y, 3, 1);
        px = x;
        py = y;
      }
    }
  }
  for (let i = 0; i < p.bone.length; i++) {
    p.bone[i] += Math.min(ribs.bone[i], 0.8);
    if (ribs.boneMask[i]) p.boneMask[i] = 1;
  }
  // Columna (vértebras)
  longBone(p, 120, 0, 120, 320, 9, 0.5);
  return p;
}

const cache = new Map<PhantomId, Phantom>();
export function phantom(id: PhantomId) {
  let p = cache.get(id);
  if (!p) {
    p = id === "mano" ? hand() : id === "rodilla" ? knee() : chest();
    for (let i = 0; i < p.soft.length; i++) p.soft[i] = Math.max(0, p.soft[i]);
    cache.set(id, p);
  }
  return p;
}

// Ruido fijo (siempre el mismo dibujo) para que la imagen no "baile" al mover los mandos.
let noise: Float32Array | null = null;
function noiseField() {
  if (noise) return noise;
  noise = new Float32Array(W * H);
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < noise.length; i++) {
    const u = Math.max(rnd(), 1e-9);
    noise[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  }
  return noise;
}

// Calibración del detector para cada exploración (como hace el equipo): con los valores ideales,
// el tejido blando típico recibe una exposición algo por encima de la media de la curva.
const TARGET = 1.4;
const calibration = new Map<PhantomId, number>();
function referenceOf(id: PhantomId) {
  let ref = calibration.get(id);
  if (ref === undefined) {
    const p = phantom(id);
    const m = mu(IDEAL[id].kv);
    const out = tubeOutput(IDEAL[id]);
    const vals: number[] = [];
    for (let i = 0; i < p.soft.length; i++)
      if (p.body[i] && !p.boneMask[i]) vals.push(out * Math.exp(-(m.soft * p.soft[i] + m.bone * p.bone[i])));
    vals.sort((a, b) => a - b);
    ref = (vals[Math.floor(vals.length / 2)] ?? 1) / TARGET;
    calibration.set(id, ref);
  }
  return ref;
}
const QUANTA = 600; // fotones por píxel con una exposición "correcta" (ruido ≈ 3%)
const GAMMA = 1.5; // pendiente de la curva del detector (latitud)

export interface Result {
  pixels: Uint8ClampedArray; // 0 = negro (mucha radiación), 255 = blanco
  brightness: number; // brillo medio del paciente (0–1)
  contrast: number; // diferencia hueso / tejido blando (0–1)
  noise: number; // ruido relativo en el tejido blando
  dose: number; // dosis en la piel, relativa a la ideal de la exploración
}

export function simulate(id: PhantomId, s: Settings): Result {
  const p = phantom(id);
  const m = mu(s.kv);
  const out = tubeOutput(s);
  const nf = noiseField();
  const ref = referenceOf(id);
  const px = new Uint8ClampedArray(W * H);
  let sumB = 0;
  let nB = 0;
  let boneSum = 0;
  let nBone = 0;
  let softSum = 0;
  let nSoft = 0;
  let softQuanta = 0;
  for (let i = 0; i < px.length; i++) {
    const t = Math.exp(-(m.soft * p.soft[i] + m.bone * p.bone[i]));
    const exposure = (out * t) / ref;
    const quanta = Math.max(exposure * QUANTA, 0.5);
    const noisy = Math.max(1e-6, (quanta + nf[i] * Math.sqrt(quanta)) / QUANTA);
    const v = 1 / (1 + Math.pow(noisy, GAMMA)); // curva característica: más exposición → más negro
    px[i] = Math.round(v * 255);
    const clean = 1 / (1 + Math.pow(exposure, GAMMA));
    if (p.body[i]) {
      sumB += clean;
      nB++;
      if (p.boneMask[i] && p.bone[i] > 0.6) {
        boneSum += clean;
        nBone++;
      } else if (!p.boneMask[i]) {
        softSum += clean;
        nSoft++;
        softQuanta += quanta;
      }
    }
  }
  const ideal = IDEAL[id];
  return {
    pixels: px,
    brightness: nB ? sumB / nB : 0,
    contrast: nBone && nSoft ? boneSum / nBone - softSum / nSoft : 0,
    noise: nSoft ? 1 / Math.sqrt(softQuanta / nSoft) : 0,
    dose: doseOf(s) / doseOf(ideal),
  };
}

/** Dosis en la entrada de la piel (relativa): ∝ mAs · kV² / d² (la piel está a ~d − 20 cm del foco). */
export function doseOf(s: Settings) {
  return s.mas * Math.pow(s.kv / 70, 2) * Math.pow(100 / Math.max(s.dist - 20, 30), 2);
}

export type Verdict = "under" | "over" | "lowContrast" | "noisy" | "highDose" | "good";

const idealContrast = new Map<PhantomId, number>();

/** Contraste que da la exploración con los valores recomendados (cada parte del cuerpo tiene el suyo). */
export function idealContrastOf(id: PhantomId) {
  let ref = idealContrast.get(id);
  if (ref === undefined) {
    ref = simulate(id, IDEAL[id]).contrast;
    idealContrast.set(id, ref);
  }
  return ref;
}

export function verdict(id: PhantomId, r: Result): Verdict {
  const ref = idealContrastOf(id);
  if (r.brightness > 0.78) return "under";
  if (r.brightness < 0.36) return "over";
  if (r.noise > 0.075) return "noisy";
  if (r.contrast < ref * 0.6) return "lowContrast";
  // La imagen es buena, pero con mucha más radiación de la necesaria (principio ALARA).
  if (r.dose > 2.5) return "highDose";
  return "good";
}
