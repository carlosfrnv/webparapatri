import * as THREE from "three";

/**
 * Célula animal en 3D con estilo de ilustración de libro: formas orgánicas, membranas con grosor y
 * los orgánulos abiertos para ver su interior (crestas de las mitocondrias, cromatina del núcleo…).
 * Todo se genera aquí (no se descarga ningún modelo).
 */

export type CellPart =
  | "membrana"
  | "nucleo"
  | "nucleolo"
  | "rer"
  | "rel"
  | "ribosomas"
  | "golgi"
  | "mitocondria"
  | "lisosoma"
  | "peroxisoma"
  | "centriolos"
  | "citoesqueleto";

export const CELL_PARTS: CellPart[] = [
  "membrana",
  "nucleo",
  "nucleolo",
  "rer",
  "rel",
  "ribosomas",
  "golgi",
  "mitocondria",
  "lisosoma",
  "peroxisoma",
  "centriolos",
  "citoesqueleto",
];

export const CELL_COLORS: Record<CellPart, number> = {
  membrana: 0xf3a6c4,
  nucleo: 0x8a6bd1,
  nucleolo: 0x4b2f86,
  rer: 0x5b8fd6,
  rel: 0x56c2be,
  ribosomas: 0x27367d,
  golgi: 0xf0b13c,
  mitocondria: 0xee7a3e,
  lisosoma: 0xb24fb6,
  peroxisoma: 0x5bb75f,
  centriolos: 0x9aa3ad,
  citoesqueleto: 0xc9e27a,
};

const CELL_R = 10;
const NUCLEUS = new THREE.Vector3(-1.4, 0.5, -0.8);
const NUCLEUS_R = 3.3;

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Ruido suave en 3D (suma de ondas con direcciones al azar): para que las formas no sean perfectas. */
function smoothNoise(seed: number, waves = 7, freq = 0.35) {
  const rand = rng(seed);
  const ws = Array.from({ length: waves }, (_, k) => ({
    d: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
      .normalize()
      .multiplyScalar(freq * (1 + k * 0.45)),
    phase: rand() * Math.PI * 2,
    amp: 1 / (1 + k * 0.7),
  }));
  const total = ws.reduce((s, w) => s + w.amp, 0);
  return (p: THREE.Vector3) => ws.reduce((s, w) => s + w.amp * Math.sin(w.d.dot(p) + w.phase), 0) / total;
}

/** Deforma una geometría hacia fuera según el ruido (y recalcula las normales). */
function displace(
  geo: THREE.BufferGeometry,
  noise: (p: THREE.Vector3) => number,
  amount: number,
  center = new THREE.Vector3(),
) {
  const pos = geo.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().sub(center).normalize();
    v.addScaledVector(dir, noise(v) * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function mat(color: number, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffffff),
    ...extra,
  });
}

/** Punto al azar dentro de la célula, fuera del núcleo y lejos de la membrana. */
function freeSpot(rand: () => number, margin = 1.2, avoid: { c: THREE.Vector3; r: number }[] = []) {
  for (let k = 0; k < 300; k++) {
    const p = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).multiplyScalar(CELL_R - margin);
    if (p.length() > CELL_R - margin - 0.6) continue;
    if (p.distanceTo(NUCLEUS) < NUCLEUS_R + margin + 1.6) continue;
    if (avoid.some((a) => p.distanceTo(a.c) < a.r + margin)) continue;
    return p;
  }
  return new THREE.Vector3(5, -3, 0);
}

export interface Cell {
  groups: Record<CellPart, THREE.Group>;
  /** Actualiza los cortes (membrana y núcleo se abren siempre por el lado que mira a la cámara). */
  updateCuts: (camera: THREE.Camera) => void;
}

export function buildCell(): Cell {
  const rand = rng(42);
  const g = Object.fromEntries(CELL_PARTS.map((p) => [p, new THREE.Group()])) as Record<CellPart, THREE.Group>;
  for (const p of CELL_PARTS) g[p].userData.part = p;
  const membranePlane = new THREE.Plane();
  const nucleusPlane = new THREE.Plane();
  const avoid: { c: THREE.Vector3; r: number }[] = [];

  // ---------- Membrana plasmática: dos capas (se ve el grosor en el borde del corte) ----------
  const shape = smoothNoise(3, 6, 0.18);
  const bumps = smoothNoise(9, 6, 2.2);
  const outerGeo = displace(new THREE.SphereGeometry(CELL_R, 160, 110), (p) => shape(p) * 1 + bumps(p) * 0.06, 1);
  const outer = new THREE.Mesh(
    outerGeo,
    mat(CELL_COLORS.membrana, {
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      roughness: 0.55,
      clippingPlanes: [membranePlane],
    }),
  );
  const innerGeo = displace(new THREE.SphereGeometry(CELL_R * 0.965, 120, 80), (p) => shape(p), 1);
  const inner = new THREE.Mesh(
    innerGeo,
    mat(0xeab3c9, { side: THREE.BackSide, roughness: 0.85, clearcoat: 0, sheen: 0, clippingPlanes: [membranePlane] }),
  );
  g.membrana.add(outer, inner);

  // ---------- Núcleo: envoltura doble con poros, cromatina y nucléolo, abierto por delante ----------
  const nShape = smoothNoise(5, 5, 0.5);
  const envelope = new THREE.Mesh(
    displace(new THREE.SphereGeometry(NUCLEUS_R, 96, 64), nShape, 0.18).translate(NUCLEUS.x, NUCLEUS.y, NUCLEUS.z),
    mat(CELL_COLORS.nucleo, { side: THREE.DoubleSide, clippingPlanes: [nucleusPlane] }),
  );
  const envelopeIn = new THREE.Mesh(
    displace(new THREE.SphereGeometry(NUCLEUS_R * 0.95, 80, 56), nShape, 0.18).translate(
      NUCLEUS.x,
      NUCLEUS.y,
      NUCLEUS.z,
    ),
    mat(0xc9b6ee, { side: THREE.BackSide, clearcoat: 0, roughness: 0.7, clippingPlanes: [nucleusPlane] }),
  );
  g.nucleo.add(envelope, envelopeIn);
  // Poros nucleares: anillos sobre la superficie.
  const pores = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.16, 0.05, 6, 14),
    mat(0x5d3f9e, { clippingPlanes: [nucleusPlane] }),
    90,
  );
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 90; i++) {
    const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    m4.compose(
      NUCLEUS.clone().addScaledVector(
        dir,
        NUCLEUS_R * (1 + nShape(dir.clone().multiplyScalar(NUCLEUS_R)) * 0.055) + 0.02,
      ),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    pores.setMatrixAt(i, m4);
  }
  g.nucleo.add(pores);
  // Cromatina: grumos de puntitos dentro del núcleo.
  const chromatin = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.11, 0),
    mat(0x6a4fb0, { roughness: 0.7, clippingPlanes: [nucleusPlane] }),
    700,
  );
  for (let i = 0; i < 700; i++) {
    const c = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
      .normalize()
      .multiplyScalar(Math.cbrt(rand()) * NUCLEUS_R * 0.85);
    // Más densa junto a la envoltura (heterocromatina).
    if (rand() < 0.45) c.setLength(NUCLEUS_R * (0.75 + rand() * 0.12));
    m4.compose(NUCLEUS.clone().add(c), q.identity(), new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + rand() * 0.9));
    chromatin.setMatrixAt(i, m4);
  }
  g.nucleo.add(chromatin);
  const nucleolus = new THREE.Mesh(
    displace(new THREE.SphereGeometry(1.05, 40, 28), smoothNoise(11, 5, 2.5), 0.12),
    mat(CELL_COLORS.nucleolo, { roughness: 0.6, side: THREE.DoubleSide, clippingPlanes: [nucleusPlane] }),
  );
  nucleolus.position.copy(NUCLEUS).add(new THREE.Vector3(0.7, 0.4, -0.3));
  g.nucleolo.add(nucleolus);
  avoid.push({ c: NUCLEUS, r: NUCLEUS_R + 2.6 });

  // ---------- Retículo endoplasmático rugoso: láminas curvas alrededor del núcleo con ribosomas ----------
  const ribosomeGeo = new THREE.SphereGeometry(0.075, 6, 5);
  const rerRibos: THREE.Vector3[] = [];
  for (let k = 0; k < 5; k++) {
    const r = NUCLEUS_R + 0.55 + k * 0.42;
    const wave = smoothNoise(20 + k, 5, 1.1);
    // Trozo de esfera: rodea el núcleo por detrás y por la izquierda (no lo tapa desde delante).
    const sheet = new THREE.SphereGeometry(r, 56, 36, Math.PI * 0.75 + k * 0.08, 1.5 - k * 0.08, 0.7 + k * 0.05, 1.25);
    displace(sheet, wave, 0.2);
    const mesh = new THREE.Mesh(sheet, mat(CELL_COLORS.rer, { side: THREE.DoubleSide, roughness: 0.5 }));
    mesh.position.copy(NUCLEUS);
    mesh.rotation.set(0.12 * k - 0.15, 0.2, 0.08 * k);
    mesh.updateMatrix();
    g.rer.add(mesh);
    // Ribosomas pegados a la cara externa.
    const pos = sheet.getAttribute("position");
    const nrm = sheet.getAttribute("normal");
    for (let i = 0; i < pos.count; i += 7) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      const n = new THREE.Vector3().fromBufferAttribute(nrm, i);
      rerRibos.push(p.addScaledVector(n, 0.09).applyMatrix4(mesh.matrix));
    }
  }
  const rerDots = new THREE.InstancedMesh(ribosomeGeo, mat(CELL_COLORS.ribosomas, { roughness: 0.6 }), rerRibos.length);
  rerRibos.forEach((p, i) => rerDots.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  g.rer.add(rerDots);

  // ---------- Retículo endoplasmático liso: red de túbulos ----------
  const relStart = new THREE.Vector3(2.6, -1.8, 0.6);
  const relGroup = new THREE.Group();
  const branch = (from: THREE.Vector3, depth: number) => {
    const pts = [from.clone()];
    for (let i = 0; i < 4; i++)
      pts.push(
        pts[pts.length - 1].clone().add(new THREE.Vector3(rand() * 1.6 - 0.4, rand() * 1.6 - 0.9, rand() * 1.6 - 0.8)),
      );
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.16, 10),
      mat(CELL_COLORS.rel, { roughness: 0.45 }),
    );
    relGroup.add(tube);
    if (depth > 0) for (const k of [1, 3]) branch(pts[k], depth - 1);
  };
  branch(relStart, 2);
  branch(relStart.clone().add(new THREE.Vector3(0.5, 1, -1)), 2);
  g.rel.add(relGroup);
  avoid.push({ c: relStart.clone().add(new THREE.Vector3(1.5, -0.5, 0)), r: 2.4 });

  // ---------- Aparato de Golgi: cisternas curvas apiladas con bordes hinchados y vesículas ----------
  const golgi = new THREE.Group();
  const profile = (rad: number) => {
    // Perfil de una cisterna: un disco fino con el borde abultado.
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const x = t * rad;
      const y = 0.11 + (t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.14 : 0);
      pts.push(new THREE.Vector2(x, y));
    }
    for (let i = 16; i >= 0; i--) pts.push(new THREE.Vector2(pts[i].x, -pts[i].y));
    return pts;
  };
  for (let k = 0; k < 6; k++) {
    const rad = 2.3 - Math.abs(k - 2.5) * 0.25;
    const geo = new THREE.LatheGeometry(profile(rad), 48);
    // Curvatura: cada cisterna es como un cuenco.
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, pos.getY(i) + 0.18 * (x * x + z * z) * 0.5);
    }
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, mat(k % 2 ? 0xf5c25a : CELL_COLORS.golgi, { roughness: 0.38 }));
    c.position.y = k * 0.36;
    c.scale.set(1, 1, 0.75);
    golgi.add(c);
  }
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2;
    const v = new THREE.Mesh(
      new THREE.SphereGeometry(0.17 + rand() * 0.1, 14, 10),
      mat(CELL_COLORS.golgi, { roughness: 0.35 }),
    );
    v.position.set(Math.cos(a) * (2.2 + rand() * 0.7), rand() * 2.4 - 0.2, Math.sin(a) * (1.6 + rand() * 0.5));
    golgi.add(v);
  }
  const golgiPos = new THREE.Vector3(4.2, 2.6, 1.6);
  golgi.position.copy(golgiPos);
  golgi.rotation.set(0.4, 0.3, -1.0);
  g.golgi.add(golgi);
  avoid.push({ c: golgiPos, r: 3 });

  // ---------- Mitocondrias: abiertas por la mitad para ver la membrana interna y las crestas ----------
  for (let k = 0; k < 7; k++) {
    const pos = freeSpot(rand, 1.8, avoid);
    avoid.push({ c: pos, r: 1.6 });
    const m = new THREE.Group();
    m.position.copy(pos);
    m.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    m.updateMatrixWorld();
    const len = 1.6 + rand() * 0.8;
    const plane = new THREE.Plane();
    // El corte pasa por el eje largo: se recalcula al montar la escena (ver updateCuts).
    m.userData.cut = plane;
    const outerM = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.62, len, 10, 24),
      mat(CELL_COLORS.mitocondria, { side: THREE.DoubleSide, clippingPlanes: [plane] }),
    );
    const innerM = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, len, 10, 24),
      mat(0xffb27d, { side: THREE.DoubleSide, roughness: 0.55, clippingPlanes: [plane] }),
    );
    m.add(outerM, innerM);
    // Crestas: pliegues de la membrana interna que entran hacia la matriz.
    const crests = Math.round(len / 0.32);
    for (let i = 0; i < crests; i++) {
      const crest = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20, 1, false, 0, Math.PI * (1.1 + rand() * 0.5)),
        mat(0xffc79c, { side: THREE.DoubleSide, roughness: 0.5, clippingPlanes: [plane] }),
      );
      crest.position.y = -len / 2 + 0.2 + (i * (len - 0.4)) / Math.max(1, crests - 1);
      crest.rotation.y = rand() * Math.PI * 2;
      crest.scale.set(1, 1, 0.9);
      m.add(crest);
    }
    g.mitocondria.add(m);
  }

  // ---------- Lisosomas (contenido denso) y peroxisomas (núcleo cristalino) ----------
  for (let k = 0; k < 6; k++) {
    const pos = freeSpot(rand, 1.2, avoid);
    avoid.push({ c: pos, r: 0.8 });
    const l = new THREE.Mesh(
      displace(new THREE.SphereGeometry(0.5, 24, 18), smoothNoise(30 + k, 4, 3), 0.05),
      mat(CELL_COLORS.lisosoma, { transparent: true, opacity: 0.85, roughness: 0.3 }),
    );
    l.position.copy(pos);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(0x6e2273, { roughness: 0.8 }));
    l.add(core);
    g.lisosoma.add(l);
  }
  for (let k = 0; k < 5; k++) {
    const pos = freeSpot(rand, 1.2, avoid);
    avoid.push({ c: pos, r: 0.7 });
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 22, 16),
      mat(CELL_COLORS.peroxisoma, { transparent: true, opacity: 0.7, roughness: 0.25 }),
    );
    p.position.copy(pos);
    const crystal = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat(0x2f7a34, { roughness: 0.2 }));
    crystal.rotation.set(0.6, 0.8, 0.2);
    p.add(crystal);
    g.peroxisoma.add(p);
  }

  // ---------- Centriolos: dos cilindros perpendiculares de 9 tripletes de microtúbulos ----------
  const centrosome = new THREE.Vector3(2.4, -4.4, 2.2);
  const centrioles = new THREE.Group();
  for (const [rx, offset] of [
    [0, new THREE.Vector3()],
    [Math.PI / 2, new THREE.Vector3(0.75, 0.35, 0)],
  ] as const) {
    const c = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      for (let t = 0; t < 3; t++) {
        const tube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8),
          mat(CELL_COLORS.centriolos, { roughness: 0.4 }),
        );
        const r = 0.3 + t * 0.07;
        tube.position.set(Math.cos(a + t * 0.12) * r, 0, Math.sin(a + t * 0.12) * r);
        c.add(tube);
      }
    }
    c.rotation.x = rx;
    c.position.copy(offset);
    centrioles.add(c);
  }
  centrioles.position.copy(centrosome);
  g.centriolos.add(centrioles);

  // ---------- Citoesqueleto: microtúbulos que salen del centrosoma hacia la membrana ----------
  const tubules = new THREE.Group();
  for (let k = 0; k < 34; k++) {
    const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    const pts = [centrosome.clone()];
    for (let i = 1; i <= 5; i++) {
      const p = centrosome.clone().addScaledVector(dir, i * 2.4);
      p.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.9));
      if (p.length() > CELL_R - 0.9) break;
      if (p.distanceTo(NUCLEUS) < NUCLEUS_R + 0.5) break;
      pts.push(p);
    }
    if (pts.length < 3) continue;
    tubules.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 6),
        mat(CELL_COLORS.citoesqueleto, { transparent: true, opacity: 0.75, roughness: 0.3 }),
      ),
    );
  }
  g.citoesqueleto.add(tubules);

  // ---------- Ribosomas libres (algunos en cadenas: polirribosomas) ----------
  const free: THREE.Vector3[] = [];
  for (let i = 0; i < 70; i++) {
    const start = freeSpot(rand, 0.7);
    const step = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(0.2);
    const chain = rand() < 0.35 ? 5 : 1;
    for (let k = 0; k < chain; k++)
      free.push(
        start
          .clone()
          .addScaledVector(step, k)
          .add(new THREE.Vector3(0, Math.sin(k) * 0.08, 0)),
      );
  }
  const freeDots = new THREE.InstancedMesh(ribosomeGeo, mat(CELL_COLORS.ribosomas, { roughness: 0.6 }), free.length);
  free.forEach((p, i) => freeDots.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  g.ribosomas.add(freeDots);

  const updateCuts = (camera: THREE.Camera) => {
    const dir = camera.position.clone().normalize();
    // Membrana: se quita el casquete que mira a la cámara.
    membranePlane.set(dir.clone().negate(), 3.2);
    // Núcleo: se abre un poco por delante de su centro.
    nucleusPlane.setFromNormalAndCoplanarPoint(dir.clone().negate(), NUCLEUS.clone().addScaledVector(dir, 0.6));
    // Mitocondrias: cortadas por su eje largo, por la mitad que mira a la cámara.
    for (const m of g.mitocondria.children) {
      const plane = m.userData.cut as THREE.Plane;
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
      const toCam = camera.position.clone().sub(m.position).normalize();
      const n = toCam.sub(axis.clone().multiplyScalar(toCam.dot(axis))).normalize();
      plane.setFromNormalAndCoplanarPoint(n.negate(), m.position);
    }
  };

  return { groups: g, updateCuts };
}
