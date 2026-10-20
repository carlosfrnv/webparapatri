"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useLang } from "@/lib/i18n";
import { buildCell, CELL_COLORS, CELL_PARTS, type CellPart } from "@/lib/cell3d";
import { createViewer, type Viewer } from "@/lib/viewer3d";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Célula animal en 3D, abierta por el lado que mira a la cámara para ver los orgánulos.
 * Se dibuja aquí mismo con formas sencillas (no descarga modelos) y no usa IA ni el servidor.
 */

type Part = CellPart;
const PARTS = CELL_PARTS;
const COLORS = CELL_COLORS;

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
      citoesqueleto: [
        "Citoesqueleto",
        "Red de filamentos proteicos (microtúbulos, filamentos intermedios y de actina) que da forma a la célula, la sostiene y sirve de 'carreteras' para mover vesículas y orgánulos. Aquí se ven los microtúbulos saliendo del centrosoma.",
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
      citoesqueleto: [
        "Citoesqueleto",
        "Rede de filamentos proteicos (microtúbulos, filamentos intermédios e de actina) que dá forma à célula, a sustenta e serve de 'estradas' para mover vesículas e organelos. Aqui veem-se os microtúbulos a sair do centrossoma.",
      ],
    } as Record<Part, [string, string]>,
    hint: "Roda com um dedo, amplia com dois. Toca num organelo ou escolhe-o em baixo.",
    all: "Ver tudo",
    pick: "Toca num organelo para ver o que faz.",
  },
};

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
    // Luz ambiental suave de "estudio" para que los materiales se vean con volumen.
    const pmrem = new THREE.PMREMGenerator(v.renderer);
    v.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    v.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    const cell = buildCell();
    const g = cell.groups;
    groups.current = g;
    const root = new THREE.Group();
    PARTS.forEach((p) => root.add(g[p]));
    v.scene.add(root);
    // Los cortes (membrana, núcleo y mitocondrias) se abren siempre por el lado que mira a la cámara.
    v.scene.onBeforeRender = (_r, _s, camera) => cell.updateCuts(camera);

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
      v.scene.environment?.dispose();
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
        const m = mesh.material as THREE.MeshPhysicalMaterial;
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
