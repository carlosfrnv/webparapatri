"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useLang } from "@/lib/i18n";
import { createViewer, type Viewer } from "@/lib/viewer3d";

/**
 * Célula animal en 3D, abierta por el lado que mira a la cámara para ver los orgánulos.
 * Se dibuja aquí mismo con formas sencillas (no descarga modelos) y no usa IA ni el servidor.
 */

type Part =
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
  | "centriolos";

const PARTS: Part[] = [
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
];

const COLORS: Record<Part, number> = {
  membrana: 0xf6a5c8,
  nucleo: 0x7c5cc4,
  nucleolo: 0x3b2a6e,
  rer: 0x4f8fd8,
  rel: 0x5fc3c7,
  ribosomas: 0x24357a,
  golgi: 0xf2b134,
  mitocondria: 0xf07a3a,
  lisosoma: 0xb04fb8,
  peroxisoma: 0x55b85c,
  centriolos: 0x8a8a8a,
};

const TEXT = {
  es: {
    parts: {
      membrana: [
        "Membrana plasmática",
        "Bicapa de fosfolípidos con proteínas y colesterol que rodea la célula. Es semipermeable: controla qué entra y qué sale (transporte pasivo y activo) y tiene receptores para recibir señales.",
      ],
      nucleo: [
        "Núcleo",
        "Contiene el ADN (en forma de cromatina) y dirige la actividad de la célula. Está rodeado por la envoltura nuclear, una doble membrana con poros por los que sale el ARN.",
      ],
      nucleolo: [
        "Nucléolo",
        "Zona densa dentro del núcleo donde se fabrica el ARN ribosómico y se montan las subunidades de los ribosomas.",
      ],
      rer: [
        "Retículo endoplasmático rugoso",
        "Red de sacos aplanados unida a la envoltura nuclear y cubierta de ribosomas (por eso es 'rugoso'). Fabrica las proteínas que se van a secretar o a llevar a las membranas.",
      ],
      rel: [
        "Retículo endoplasmático liso",
        "Red de túbulos sin ribosomas. Fabrica lípidos (y hormonas esteroideas), elimina tóxicos (muy abundante en el hígado) y guarda calcio (en el músculo, retículo sarcoplásmico).",
      ],
      ribosomas: [
        "Ribosomas",
        "Pequeñas 'fábricas' de proteínas formadas por ARN ribosómico y proteínas. Leen el ARN mensajero y unen los aminoácidos. Pueden estar libres en el citoplasma o pegados al RE rugoso.",
      ],
      golgi: [
        "Aparato de Golgi",
        "Pila de sacos aplanados (cisternas) que recibe las proteínas del RE, las modifica, las empaqueta en vesículas y las envía a su destino: la membrana, el exterior o los lisosomas. Es la 'oficina de correos' de la célula.",
      ],
      mitocondria: [
        "Mitocondrias",
        "Producen la mayor parte del ATP por respiración celular (consumen O₂ y liberan CO₂). Tienen doble membrana, con la interna plegada en crestas, y su propio ADN. Abundan en el músculo y el corazón.",
      ],
      lisosoma: [
        "Lisosomas",
        "Vesículas con enzimas digestivas (pH ácido) que degradan moléculas, orgánulos viejos y lo que la célula ingiere: el 'sistema de reciclaje'.",
      ],
      peroxisoma: [
        "Peroxisomas",
        "Vesículas con enzimas que degradan ácidos grasos y sustancias tóxicas. Producen agua oxigenada (H₂O₂) y la eliminan con la catalasa.",
      ],
      centriolos: [
        "Centriolos (centrosoma)",
        "Dos cilindros de microtúbulos perpendiculares. Organizan el huso mitótico que separa los cromosomas en la división celular y forman la base de cilios y flagelos.",
      ],
    } as Record<Part, [string, string]>,
    hint: "Gira con un dedo, amplía con dos. Toca un orgánulo o elígelo abajo.",
    all: "Ver todo",
    pick: "Toca un orgánulo para ver qué hace.",
  },
  pt: {
    parts: {
      membrana: [
        "Membrana plasmática",
        "Bicamada de fosfolípidos com proteínas e colesterol que envolve a célula. É semipermeável: controla o que entra e o que sai (transporte passivo e ativo) e tem recetores para receber sinais.",
      ],
      nucleo: [
        "Núcleo",
        "Contém o ADN (sob a forma de cromatina) e dirige a atividade da célula. Está rodeado pelo invólucro nuclear, uma membrana dupla com poros por onde sai o ARN.",
      ],
      nucleolo: [
        "Nucléolo",
        "Zona densa dentro do núcleo onde se fabrica o ARN ribossómico e se montam as subunidades dos ribossomas.",
      ],
      rer: [
        "Retículo endoplasmático rugoso",
        "Rede de sacos achatados ligada ao invólucro nuclear e coberta de ribossomas (por isso é 'rugoso'). Fabrica as proteínas que vão ser secretadas ou levadas para as membranas.",
      ],
      rel: [
        "Retículo endoplasmático liso",
        "Rede de túbulos sem ribossomas. Fabrica lípidos (e hormonas esteroides), elimina tóxicos (muito abundante no fígado) e armazena cálcio (no músculo, retículo sarcoplasmático).",
      ],
      ribosomas: [
        "Ribossomas",
        "Pequenas 'fábricas' de proteínas formadas por ARN ribossómico e proteínas. Leem o ARN mensageiro e unem os aminoácidos. Podem estar livres no citoplasma ou presos ao RE rugoso.",
      ],
      golgi: [
        "Complexo de Golgi",
        "Pilha de sacos achatados (cisternas) que recebe as proteínas do RE, modifica-as, empacota-as em vesículas e envia-as para o destino: a membrana, o exterior ou os lisossomas. É os 'correios' da célula.",
      ],
      mitocondria: [
        "Mitocôndrias",
        "Produzem a maior parte do ATP por respiração celular (consomem O₂ e libertam CO₂). Têm membrana dupla, com a interna dobrada em cristas, e o seu próprio ADN. Abundam no músculo e no coração.",
      ],
      lisosoma: [
        "Lisossomas",
        "Vesículas com enzimas digestivas (pH ácido) que degradam moléculas, organelos velhos e o que a célula ingere: o 'sistema de reciclagem'.",
      ],
      peroxisoma: [
        "Peroxissomas",
        "Vesículas com enzimas que degradam ácidos gordos e substâncias tóxicas. Produzem água oxigenada (H₂O₂) e eliminam-na com a catalase.",
      ],
      centriolos: [
        "Centríolos (centrossoma)",
        "Dois cilindros de microtúbulos perpendiculares. Organizam o fuso mitótico que separa os cromossomas na divisão celular e formam a base de cílios e flagelos.",
      ],
    } as Record<Part, [string, string]>,
    hint: "Roda com um dedo, amplia com dois. Toca num organelo ou escolhe-o em baixo.",
    all: "Ver tudo",
    pick: "Toca num organelo para ver o que faz.",
  },
};

// Números "aleatorios" fijos: la célula sale siempre igual.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const CELL_R = 10;
const NUCLEUS = new THREE.Vector3(-1.2, 0.4, -0.5);
const NUCLEUS_R = 3.2;

/** Punto al azar dentro de la célula, fuera del núcleo y lejos de la membrana. */
function freeSpot(rand: () => number, margin = 1.2) {
  for (let k = 0; k < 200; k++) {
    const p = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).multiplyScalar(CELL_R - margin);
    if (p.length() > CELL_R - margin - 0.5) continue;
    if (p.distanceTo(NUCLEUS) < NUCLEUS_R + margin + 1.5) continue;
    return p;
  }
  return new THREE.Vector3(5, 0, 0);
}

function mat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
}

function buildCell(): Record<Part, THREE.Group> {
  const rand = rng(42);
  const g = Object.fromEntries(PARTS.map((p) => [p, new THREE.Group()])) as Record<Part, THREE.Group>;
  for (const p of PARTS) g[p].userData.part = p;

  // Membrana: esfera doble cara, recortada por delante (el recorte sigue a la cámara).
  const membrane = new THREE.Mesh(
    new THREE.SphereGeometry(CELL_R, 64, 40),
    mat(COLORS.membrana, { side: THREE.DoubleSide, transparent: true, opacity: 0.55, roughness: 0.8 }),
  );
  membrane.userData.cut = true;
  g.membrana.add(membrane);

  // Núcleo (envoltura translúcida) y nucléolo.
  const env = new THREE.Mesh(
    new THREE.SphereGeometry(NUCLEUS_R, 48, 32),
    mat(COLORS.nucleo, { transparent: true, opacity: 0.7 }),
  );
  env.position.copy(NUCLEUS);
  g.nucleo.add(env);
  const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 20), mat(COLORS.nucleolo));
  nucleolus.position.copy(NUCLEUS).add(new THREE.Vector3(0.6, 0.5, 1.2));
  g.nucleolo.add(nucleolus);

  // RE rugoso: arcos alrededor del núcleo, con ribosomas pegados.
  const ribo = new THREE.SphereGeometry(0.11, 8, 6);
  for (let k = 0; k < 5; k++) {
    const torus = new THREE.TorusGeometry(NUCLEUS_R + 0.9 + k * 0.55, 0.16, 8, 64, 2.4);
    const arc = new THREE.Mesh(torus, mat(COLORS.rer));
    arc.position.copy(NUCLEUS);
    arc.rotation.set(0.3 + k * 0.25, -0.4 + k * 0.15, 2.2 + k * 0.1);
    g.rer.add(arc);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * 2.4;
      const r = NUCLEUS_R + 0.9 + k * 0.55;
      const dot = new THREE.Mesh(ribo, mat(COLORS.ribosomas));
      dot.position.set(Math.cos(a) * (r + 0.2), Math.sin(a) * (r + 0.2), 0);
      arc.add(dot);
    }
  }

  // RE liso: túbulos ramificados al otro lado.
  for (let k = 0; k < 6; k++) {
    const start = new THREE.Vector3(2 + rand() * 2, -3 + rand() * 6, -3 + rand() * 4);
    const pts = [start];
    for (let i = 0; i < 4; i++)
      pts.push(pts[pts.length - 1].clone().add(new THREE.Vector3(rand() * 2 - 0.6, rand() * 2 - 1, rand() * 2 - 1)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.17, 8), mat(COLORS.rel));
    g.rel.add(tube);
  }

  // Aparato de Golgi: pila de cisternas curvas y vesículas.
  const golgi = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(2.2 - k * 0.15, 0.2, 10, 48, 1.7), mat(COLORS.golgi));
    c.scale.set(1, 1, 2.2);
    c.position.set(-k * 0.42, 0, 0);
    c.rotation.set(0, Math.PI / 2, 0);
    golgi.add(c);
  }
  for (let k = 0; k < 7; k++) {
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat(COLORS.golgi));
    v.position.set(0.6 + rand() * 1.2, -1.5 + rand() * 3, -1 + rand() * 2);
    golgi.add(v);
  }
  golgi.position.set(4.6, 2.4, 1.4);
  golgi.rotation.set(0.2, 0.5, -0.6);
  g.golgi.add(golgi);

  // Mitocondrias (con crestas: anillos dentro).
  for (let k = 0; k < 7; k++) {
    const m = new THREE.Group();
    m.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.9, 8, 16), mat(COLORS.mitocondria)));
    for (let i = 0; i < 4; i++) {
      const crest = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), mat(0xffc49a));
      crest.rotation.x = Math.PI / 2;
      crest.position.y = -0.9 + i * 0.6;
      crest.scale.set(1, 1, 1.25);
      m.add(crest);
    }
    m.position.copy(freeSpot(rand, 2));
    m.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
    g.mitocondria.add(m);
  }

  for (let k = 0; k < 6; k++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), mat(COLORS.lisosoma));
    l.position.copy(freeSpot(rand));
    g.lisosoma.add(l);
  }
  for (let k = 0; k < 5; k++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), mat(COLORS.peroxisoma));
    p.position.copy(freeSpot(rand));
    g.peroxisoma.add(p);
  }

  // Ribosomas libres por el citoplasma.
  const free = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), mat(COLORS.ribosomas), 160);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 160; i++) {
    m4.setPosition(freeSpot(rand, 0.6));
    free.setMatrixAt(i, m4);
  }
  g.ribosomas.add(free);

  // Centriolos: dos cilindros perpendiculares (9 tripletes de microtúbulos sugeridos con barras).
  const centrioles = new THREE.Group();
  for (const [rx, rz] of [
    [0, 0],
    [Math.PI / 2, 0],
  ]) {
    const c = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 6), mat(COLORS.centriolos));
      const a = (i / 9) * Math.PI * 2;
      bar.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
      c.add(bar);
    }
    c.rotation.set(rx, 0, rz);
    centrioles.add(c);
  }
  centrioles.children[1].position.set(0.9, 0.3, 0);
  centrioles.position.set(2.2, -4.2, 2.5);
  g.centriolos.add(centrioles);

  return g;
}

export default function Cell3D() {
  const lang = useLang();
  const tx = TEXT[lang];
  const mount = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const groups = useRef<Record<Part, THREE.Group> | null>(null);
  const [selected, setSelected] = useState<Part | null>(null);

  useEffect(() => {
    const v = createViewer(mount.current!, { distance: 30, minDistance: 8, maxDistance: 60 });
    v.camera.position.set(17, 10, 33);
    const g = buildCell();
    groups.current = g;
    const root = new THREE.Group();
    PARTS.forEach((p) => root.add(g[p]));
    v.scene.add(root);

    // Recorte de la membrana: siempre se abre por el lado que mira a la cámara.
    const plane = new THREE.Plane();
    const membrane = g.membrana.children[0] as THREE.Mesh;
    (membrane.material as THREE.MeshStandardMaterial).clippingPlanes = [plane];
    membrane.onBeforeRender = (_r, _s, camera) => {
      const dir = camera.position.clone().normalize();
      plane.set(dir.negate(), 3.5);
    };

    v.onTap(
      () => PARTS.filter((p) => p !== "membrana").map((p) => g[p]),
      (hit) => {
        let o: THREE.Object3D | null = hit?.object ?? null;
        while (o && !o.userData.part) o = o.parent;
        setSelected((o?.userData.part as Part | undefined) ?? null);
      },
    );
    v.setAutoRotate(true);
    viewer.current = v;
    return () => {
      v.dispose();
      viewer.current = null;
      groups.current = null;
    };
  }, []);

  // Resalta el orgánulo elegido y atenúa los demás.
  useEffect(() => {
    const g = groups.current;
    if (!g) return;
    for (const p of PARTS) {
      const dim = selected !== null && selected !== p;
      g[p].traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.transparent ? m.opacity : 1;
        const base = m.userData.baseOpacity as number;
        m.transparent = dim || base < 1;
        m.opacity = dim ? Math.min(base, p === "membrana" ? 0.12 : 0.15) : base;
        m.depthWrite = !dim && base >= 1;
        m.emissive = new THREE.Color(selected === p ? COLORS[p] : 0x000000);
        m.emissiveIntensity = selected === p ? 0.35 : 0;
        m.needsUpdate = true;
      });
    }
    viewer.current?.render();
  }, [selected]);

  const info = selected ? tx.parts[selected] : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a1b28] to-[#120c11] shadow-lg">
          <div ref={mount} className="h-[min(62vh,540px)] w-full touch-none" />
          {info && (
            <div className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              {info[0]}
            </div>
          )}
        </div>
        <p className="text-muted mt-2 text-center text-sm">{tx.hint}</p>
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          {info ? (
            <>
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ background: `#${COLORS[selected!].toString(16).padStart(6, "0")}` }}
                />
                {info[0]}
              </h2>
              <p className="text-muted mt-3">{info[1]}</p>
            </>
          ) : (
            <p className="text-muted">{tx.pick}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelected(null)}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
              selected === null ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted"
            }`}
          >
            {tx.all}
          </button>
          {PARTS.map((p) => (
            <button
              key={p}
              onClick={() => setSelected(p)}
              className={`flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ${
                selected === p ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
              }`}
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: `#${COLORS[p].toString(16).padStart(6, "0")}` }}
              />
              {tx.parts[p][0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
