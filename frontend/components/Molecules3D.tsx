"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ErrorBox, Spinner } from "@/components/ui";
import { useLang } from "@/lib/i18n";
import { clearGroup, createViewer, type Viewer } from "@/lib/viewer3d";

/**
 * Moléculas en 3D para Bioquímica. Las posiciones de los átomos son reales (calculadas con RDKit
 * y guardadas en /molecules.json, 12 KB); la doble hélice del ADN se dibuja aquí mismo.
 * Todo funciona en el dispositivo: no usa IA ni el servidor.
 */

type MolId =
  | "agua"
  | "glucosa"
  | "alanina"
  | "dipeptido"
  | "palmitico"
  | "oleico"
  | "colesterol"
  | "atp"
  | "adn"
  | "urea"
  | "iohexol";

interface MolData {
  formula: string;
  atoms: [string, number, number, number][];
  bonds: [number, number, number][];
  groups: Record<string, number[]>;
}

type Lang = "es" | "pt";

const CATEGORIES: { key: string; ids: MolId[] }[] = [
  { key: "basic", ids: ["agua", "urea"] },
  { key: "carbs", ids: ["glucosa"] },
  { key: "proteins", ids: ["alanina", "dipeptido"] },
  { key: "lipids", ids: ["palmitico", "oleico", "colesterol"] },
  { key: "nucleic", ids: ["atp", "adn"] },
  { key: "imaging", ids: ["iohexol"] },
];

const TEXT: Record<
  Lang,
  {
    categories: Record<string, string>;
    mols: Record<MolId, { name: string; text: string }>;
    groups: Record<string, string>;
    elements: Record<string, string>;
    balls: string;
    spheres: string;
    hint: string;
    highlight: string;
    all: string;
    tapped: (el: string) => string;
  }
> = {
  es: {
    categories: {
      basic: "Básicas",
      carbs: "Hidratos de carbono",
      proteins: "Proteínas",
      lipids: "Lípidos",
      nucleic: "Ácidos nucleicos y energía",
      imaging: "Imagen médica",
    },
    mols: {
      agua: {
        name: "Agua",
        text: "Molécula polar en forma de V (ángulo de unos 104,5°). El oxígeno atrae los electrones y queda con carga parcial negativa: por eso forma puentes de hidrógeno y disuelve tan bien las sustancias polares. Es alrededor del 60 % del peso corporal.",
      },
      urea: {
        name: "Urea",
        text: "Producto final del metabolismo de las proteínas: el hígado convierte el amoníaco (tóxico) en urea, que los riñones eliminan por la orina. Se mide en sangre para valorar la función renal.",
      },
      glucosa: {
        name: "Glucosa (forma cíclica)",
        text: "Monosacárido de 6 carbonos (hexosa) y principal fuente de energía de las células. En el agua forma casi siempre un anillo de 6 átomos (piranosa). Sus muchos grupos hidroxilo (–OH) la hacen muy soluble.",
      },
      alanina: {
        name: "Alanina (aminoácido)",
        text: "Todos los aminoácidos tienen un carbono central (α) unido a un grupo amino, un grupo carboxilo, un hidrógeno y un radical (R) que los diferencia. En la alanina el radical es un metilo (–CH₃).",
      },
      dipeptido: {
        name: "Dipéptido y enlace peptídico",
        text: "Dos aminoácidos (glicina y alanina) unidos por un enlace peptídico: el carboxilo de uno reacciona con el amino del otro y se libera una molécula de agua (condensación). Así se forman las proteínas.",
      },
      palmitico: {
        name: "Ácido palmítico (saturado)",
        text: "Ácido graso de 16 carbonos sin dobles enlaces: la cadena es recta y las moléculas se empaquetan bien, por eso las grasas saturadas son sólidas a temperatura ambiente.",
      },
      oleico: {
        name: "Ácido oleico (insaturado)",
        text: "Ácido graso de 18 carbonos con un doble enlace cis que dobla la cadena. Las moléculas se empaquetan peor y por eso los aceites (como el de oliva) son líquidos.",
      },
      colesterol: {
        name: "Colesterol",
        text: "Esteroide de 4 anillos con un grupo –OH. Forma parte de las membranas celulares (les da estabilidad) y es el precursor de las hormonas esteroideas, la vitamina D y los ácidos biliares.",
      },
      atp: {
        name: "ATP (adenosín trifosfato)",
        text: "La 'moneda energética' de la célula: adenina + ribosa + 3 fosfatos. Al romper el enlace del último fosfato (ATP → ADP + Pi) se libera la energía que usan los músculos, las bombas de membrana, etc.",
      },
      adn: {
        name: "ADN (doble hélice)",
        text: "Dos cadenas de nucleótidos enrolladas en hélice y antiparalelas. El esqueleto es de azúcar (desoxirribosa) y fosfato; dentro, las bases se emparejan siempre igual: A con T (2 puentes de hidrógeno) y G con C (3 puentes). Una vuelta tiene unos 10 pares de bases.",
      },
      iohexol: {
        name: "Iohexol (contraste yodado)",
        text: "Contraste que se usa en TC y angiografía. Sus 3 átomos de yodo (pesados, Z = 53) absorben mucho los rayos X, así que donde llega el contraste la imagen sale blanca. Los grupos –OH lo hacen soluble y mejor tolerado.",
      },
    },
    groups: {
      hidroxilo: "Grupos hidroxilo (–OH)",
      anillo: "Anillos",
      amino: "Grupo amino (–NH₂)",
      carboxilo: "Grupo carboxilo (–COOH)",
      radical: "Radical (R)",
      peptidico: "Enlace peptídico",
      cadena: "Cadena hidrocarbonada",
      dobleEnlace: "Doble enlace cis",
      fosfato: "Fosfatos",
      adenina: "Adenina",
      ribosa: "Ribosa",
      yodo: "Átomos de yodo",
      backbone: "Azúcar-fosfato",
      at: "Pares A–T",
      gc: "Pares G–C",
    },
    elements: { H: "Hidrógeno", C: "Carbono", N: "Nitrógeno", O: "Oxígeno", P: "Fósforo", S: "Azufre", I: "Yodo" },
    balls: "Bolas y varillas",
    spheres: "Esferas",
    hint: "Gira con un dedo, amplía con dos. Toca un átomo para ver qué es.",
    highlight: "Resaltar",
    all: "Todo",
    tapped: (el) => `Has tocado: ${el}`,
  },
  pt: {
    categories: {
      basic: "Básicas",
      carbs: "Hidratos de carbono",
      proteins: "Proteínas",
      lipids: "Lípidos",
      nucleic: "Ácidos nucleicos e energia",
      imaging: "Imagem médica",
    },
    mols: {
      agua: {
        name: "Água",
        text: "Molécula polar em forma de V (ângulo de cerca de 104,5°). O oxigénio atrai os eletrões e fica com carga parcial negativa: por isso forma pontes de hidrogénio e dissolve tão bem as substâncias polares. É cerca de 60 % do peso corporal.",
      },
      urea: {
        name: "Ureia",
        text: "Produto final do metabolismo das proteínas: o fígado converte o amoníaco (tóxico) em ureia, que os rins eliminam pela urina. Mede-se no sangue para avaliar a função renal.",
      },
      glucosa: {
        name: "Glicose (forma cíclica)",
        text: "Monossacarídeo de 6 carbonos (hexose) e principal fonte de energia das células. Na água forma quase sempre um anel de 6 átomos (piranose). Os seus muitos grupos hidroxilo (–OH) tornam-na muito solúvel.",
      },
      alanina: {
        name: "Alanina (aminoácido)",
        text: "Todos os aminoácidos têm um carbono central (α) ligado a um grupo amina, um grupo carboxilo, um hidrogénio e um radical (R) que os distingue. Na alanina o radical é um metilo (–CH₃).",
      },
      dipeptido: {
        name: "Dipéptido e ligação peptídica",
        text: "Dois aminoácidos (glicina e alanina) unidos por uma ligação peptídica: o carboxilo de um reage com a amina do outro e liberta-se uma molécula de água (condensação). É assim que se formam as proteínas.",
      },
      palmitico: {
        name: "Ácido palmítico (saturado)",
        text: "Ácido gordo de 16 carbonos sem ligações duplas: a cadeia é reta e as moléculas empacotam-se bem, por isso as gorduras saturadas são sólidas à temperatura ambiente.",
      },
      oleico: {
        name: "Ácido oleico (insaturado)",
        text: "Ácido gordo de 18 carbonos com uma ligação dupla cis que dobra a cadeia. As moléculas empacotam-se pior e por isso os óleos (como o azeite) são líquidos.",
      },
      colesterol: {
        name: "Colesterol",
        text: "Esteroide de 4 anéis com um grupo –OH. Faz parte das membranas celulares (dá-lhes estabilidade) e é o precursor das hormonas esteroides, da vitamina D e dos ácidos biliares.",
      },
      atp: {
        name: "ATP (adenosina trifosfato)",
        text: "A 'moeda energética' da célula: adenina + ribose + 3 fosfatos. Ao quebrar a ligação do último fosfato (ATP → ADP + Pi) liberta-se a energia usada pelos músculos, pelas bombas de membrana, etc.",
      },
      adn: {
        name: "ADN (dupla hélice)",
        text: "Duas cadeias de nucleótidos enroladas em hélice e antiparalelas. O esqueleto é de açúcar (desoxirribose) e fosfato; por dentro, as bases emparelham-se sempre da mesma forma: A com T (2 pontes de hidrogénio) e G com C (3 pontes). Uma volta tem cerca de 10 pares de bases.",
      },
      iohexol: {
        name: "Iohexol (contraste iodado)",
        text: "Contraste usado em TC e angiografia. Os seus 3 átomos de iodo (pesados, Z = 53) absorvem muito os raios X, por isso onde chega o contraste a imagem fica branca. Os grupos –OH tornam-no solúvel e mais bem tolerado.",
      },
    },
    groups: {
      hidroxilo: "Grupos hidroxilo (–OH)",
      anillo: "Anéis",
      amino: "Grupo amina (–NH₂)",
      carboxilo: "Grupo carboxilo (–COOH)",
      radical: "Radical (R)",
      peptidico: "Ligação peptídica",
      cadena: "Cadeia hidrocarbonada",
      dobleEnlace: "Ligação dupla cis",
      fosfato: "Fosfatos",
      adenina: "Adenina",
      ribosa: "Ribose",
      yodo: "Átomos de iodo",
      backbone: "Açúcar-fosfato",
      at: "Pares A–T",
      gc: "Pares G–C",
    },
    elements: { H: "Hidrogénio", C: "Carbono", N: "Azoto", O: "Oxigénio", P: "Fósforo", S: "Enxofre", I: "Iodo" },
    balls: "Bolas e varetas",
    spheres: "Esferas",
    hint: "Roda com um dedo, amplia com dois. Toca num átomo para ver o que é.",
    highlight: "Destacar",
    all: "Tudo",
    tapped: (el) => `Tocaste em: ${el}`,
  },
};

// Colores CPK habituales y radios de Van der Waals (Å).
const ELEMENT: Record<string, { color: number; r: number }> = {
  H: { color: 0xf4f4f4, r: 1.1 },
  C: { color: 0x4a4a4a, r: 1.7 },
  N: { color: 0x3355ee, r: 1.55 },
  O: { color: 0xe0302a, r: 1.52 },
  P: { color: 0xff8c1a, r: 1.8 },
  S: { color: 0xf2d22c, r: 1.8 },
  I: { color: 0x8a2be2, r: 1.98 },
};

const BASE_COLORS = { A: 0xe5484d, T: 0xf5a524, G: 0x3b82f6, C: 0x22c55e };

export default function Molecules3D() {
  const lang = useLang();
  const tx = TEXT[lang];
  const mount = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const molGroup = useRef(new THREE.Group());
  const [data, setData] = useState<Record<string, MolData> | null>(null);
  const [error, setError] = useState("");
  const [mol, setMol] = useState<MolId>("glucosa");
  const [mode, setMode] = useState<"balls" | "spheres">("balls");
  const [group, setGroup] = useState<string | null>(null);
  const [tapped, setTapped] = useState<string | null>(null);

  useEffect(() => {
    fetch("/molecules.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const v = createViewer(mount.current!, { distance: 22, minDistance: 4, maxDistance: 70 });
    v.scene.add(molGroup.current);
    viewer.current = v;
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, []);

  // Toque en un átomo → su nombre.
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.onTap(
      () => molGroup.current.children,
      (hit) => setTapped((hit?.object.userData.label as string | undefined) ?? null),
    );
  }, []);

  // (Re)construye la molécula cuando cambia la molécula, el modo o el grupo resaltado.
  useEffect(() => {
    const v = viewer.current;
    if (!v || (!data && mol !== "adn")) return;
    const g = molGroup.current;
    clearGroup(g);
    let size: number;
    if (mol === "adn") size = buildDna(g, group, tx.groups);
    else size = buildMolecule(g, data![mol], mode, group, tx.elements);
    // Distancia para que quepa entera (en el móvil, la pantalla es estrecha: cuenta el ancho).
    const fit = size / Math.tan((v.camera.fov * Math.PI) / 360);
    const dist = Math.max(9, (fit * 1.15) / Math.min(1, v.camera.aspect));
    v.camera.position.set(0, 0, dist);
    v.controls.target.set(0, 0, 0);
    v.controls.maxDistance = dist * 3;
    v.setAutoRotate(true);
    v.render();
  }, [data, mol, mode, group, tx]);

  const info = tx.mols[mol];
  const groups = mol === "adn" ? ["backbone", "at", "gc"] : Object.keys(data?.[mol]?.groups ?? {});
  const formula = mol === "adn" ? null : data?.[mol]?.formula;
  const elements = useMemo(
    () => (mol === "adn" || !data ? [] : [...new Set(data[mol].atoms.map((a) => a[0]))]),
    [data, mol],
  );

  if (error) return <ErrorBox message={error} />;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div>
        <div className="space-y-2">
          {CATEGORIES.map((c) => (
            <div key={c.key} className="gap-2 sm:flex sm:items-center">
              <div className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase sm:mb-0 sm:w-44 sm:shrink-0">
                {tx.categories[c.key]}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.ids.map((id) => (
                  <button
                    key={id}
                    onClick={() => {
                      setMol(id);
                      setGroup(null);
                      setTapped(null);
                    }}
                    className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
                      mol === id ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
                    }`}
                  >
                    {tx.mols[id].name.split(" (")[0]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a1b28] to-[#120c11] shadow-lg">
          <div ref={mount} className="h-[min(60vh,520px)] w-full touch-none" />
          {!data && mol !== "adn" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner />
            </div>
          )}
          {mol !== "adn" && (
            <div className="absolute top-3 right-3 flex overflow-hidden rounded-full bg-black/40 text-xs font-semibold text-white backdrop-blur">
              {(["balls", "spheres"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`min-h-9 px-3 ${mode === m ? "bg-white/25" : "opacity-75"}`}
                >
                  {m === "balls" ? tx.balls : tx.spheres}
                </button>
              ))}
            </div>
          )}
          {tapped && (
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              {tx.tapped(tapped)}
            </div>
          )}
        </div>
        <p className="text-muted mt-2 text-center text-sm">{tx.hint}</p>
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="text-xl font-bold">{info.name}</h2>
          {formula && <p className="text-accent mt-1 font-mono text-lg font-bold">{subscript(formula)}</p>}
          <p className="text-muted mt-3">{info.text}</p>
        </div>

        {groups.length > 0 && (
          <div className="card p-5">
            <div className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">{tx.highlight}</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setGroup(null)}
                className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
                  group === null ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted"
                }`}
              >
                {tx.all}
              </button>
              {groups.map((k) => (
                <button
                  key={k}
                  onClick={() => setGroup(k)}
                  className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
                    group === k ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted"
                  }`}
                >
                  {tx.groups[k] ?? k}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card flex flex-wrap gap-x-4 gap-y-2 p-4">
          {mol === "adn"
            ? (Object.keys(BASE_COLORS) as (keyof typeof BASE_COLORS)[]).map((b) => (
                <Legend key={b} color={BASE_COLORS[b]} label={b} />
              ))
            : elements.map((el) => (
                <Legend key={el} color={ELEMENT[el]?.color ?? 0xcccccc} label={tx.elements[el] ?? el} />
              ))}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: number; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        className="border-border h-4 w-4 rounded-full border"
        style={{ background: `#${color.toString(16).padStart(6, "0")}` }}
      />
      {label}
    </span>
  );
}

/** C6H12O6 → C₆H₁₂O₆ */
function subscript(f: string) {
  return f.replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
}

function material(color: number, dim: boolean) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.05,
    transparent: dim,
    opacity: dim ? 0.12 : 1,
    depthWrite: !dim,
  });
}

/** Bolas y varillas (o esferas de Van der Waals). Devuelve el tamaño aproximado de la molécula. */
function buildMolecule(
  g: THREE.Group,
  m: MolData,
  mode: "balls" | "spheres",
  group: string | null,
  names: Record<string, string>,
) {
  const inGroup = group ? new Set(m.groups[group] ?? []) : null;
  const sphere = new THREE.SphereGeometry(1, 32, 20);
  const pos = m.atoms.map(([, x, y, z]) => new THREE.Vector3(x, y, z));
  let size = 0;
  m.atoms.forEach(([el], i) => {
    const e = ELEMENT[el] ?? { color: 0xcccccc, r: 1.6 };
    const r = mode === "spheres" ? e.r : el === "H" ? 0.25 : 0.38 + (e.r - 1.5) * 0.25;
    const mesh = new THREE.Mesh(sphere.clone(), material(e.color, !!inGroup && !inGroup.has(i)));
    mesh.position.copy(pos[i]);
    mesh.scale.setScalar(r);
    mesh.userData.label = names[el] ?? el;
    g.add(mesh);
    size = Math.max(size, pos[i].length());
  });
  sphere.dispose();
  if (mode === "balls") {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
    const up = new THREE.Vector3(0, 1, 0);
    for (const [a, b, order] of m.bonds) {
      const pa = pos[a];
      const pb = pos[b];
      const dir = new THREE.Vector3().subVectors(pb, pa);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      // Desplazamiento perpendicular para dibujar los dobles enlaces como dos varillas.
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1));
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize().multiplyScalar(0.13);
      const offsets = order >= 2 ? [side, side.clone().negate()] : [new THREE.Vector3()];
      const dim = !!inGroup && !(inGroup.has(a) && inGroup.has(b));
      for (const off of offsets) {
        // Cada mitad del enlace con el color de su átomo.
        for (const [from, el] of [
          [pa, m.atoms[a][0]],
          [pb, m.atoms[b][0]],
        ] as const) {
          const half = new THREE.Mesh(cyl.clone(), material(ELEMENT[el]?.color ?? 0xcccccc, dim));
          const mid = new THREE.Vector3().lerpVectors(pa, pb, 0.5);
          half.position.lerpVectors(from, mid, 0.5).add(off);
          half.quaternion.copy(q);
          half.scale.set(order >= 2 ? 0.08 : 0.12, len / 2, order >= 2 ? 0.08 : 0.12);
          g.add(half);
        }
      }
    }
    cyl.dispose();
  }
  return size + (mode === "spheres" ? 2 : 1);
}

/** Doble hélice de ADN esquemática: 2 esqueletos de azúcar-fosfato y los pares de bases dentro. */
function buildDna(g: THREE.Group, group: string | null, names: Record<string, string>) {
  const sequence = "ATGCGTACGTTAGCCA";
  const pair: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
  const R = 5;
  const rise = 1.6;
  const twist = (36 * Math.PI) / 180;
  const groove = (150 * Math.PI) / 180; // separación entre las dos cadenas (surco menor)
  const y0 = (-(sequence.length - 1) * rise) / 2;
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const dimBackbone = group !== null && group !== "backbone";
  const strands: THREE.Vector3[][] = [[], []];
  [...sequence].forEach((b, i) => {
    const a = i * twist;
    const y = y0 + i * rise;
    const p1 = new THREE.Vector3(R * Math.cos(a), y, R * Math.sin(a));
    const p2 = new THREE.Vector3(R * Math.cos(a + groove), y, R * Math.sin(a + groove));
    strands[0].push(p1);
    strands[1].push(p2);
    for (const [p, isP] of [
      [p1, true],
      [p2, true],
    ] as const) {
      const s = new THREE.Mesh(sphere.clone(), material(isP ? 0xff8c1a : 0x9a9a9a, dimBackbone));
      s.position.copy(p);
      s.scale.setScalar(0.55);
      s.userData.label = names.backbone;
      g.add(s);
    }
    // Las dos bases, cada una hasta el centro del par.
    const kind = b === "A" || b === "T" ? "at" : "gc";
    const dim = group !== null && group !== kind;
    const mid = new THREE.Vector3().lerpVectors(p1, p2, 0.5);
    for (const [from, base] of [
      [p1, b],
      [p2, pair[b]],
    ] as const) {
      const dir = new THREE.Vector3().subVectors(mid, from);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.35, dir.length() * 0.92),
        material(BASE_COLORS[base as keyof typeof BASE_COLORS], dim),
      );
      box.position.lerpVectors(from, mid, 0.5);
      box.lookAt(mid);
      box.userData.label = `${base} (${names[kind]})`;
      g.add(box);
    }
  });
  sphere.dispose();
  // Esqueletos como tubos continuos.
  for (const s of strands) {
    const curve = new THREE.CatmullRomCurve3(s);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.22, 8), material(0xd9d9d9, dimBackbone));
    tube.userData.label = names.backbone;
    g.add(tube);
  }
  return (sequence.length * rise) / 2;
}
