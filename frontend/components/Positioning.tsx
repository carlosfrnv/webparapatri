"use client";

import { ArrowCounterClockwise, Check, ListChecks, PaperPlaneRight, Question, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { ErrorBox, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import {
  IDEAL,
  loadPosMeta,
  loadPositionView,
  type Phantom,
  type PhantomId,
  type PosRegion,
  simulate,
} from "@/lib/xray";

/**
 * Posicionamiento radiológico: colocar al paciente (rotación), centrar el rayo y colimar, disparar y ver
 * la radiografía que sale, con los criterios de calidad de cada proyección. Las vistas giradas cada 5° y
 * los puntos de referencia salen de la anatomía del atlas 3D (scripts/xray, modo "pos"). Sin IA.
 */

type Lang = "es" | "pt";
type L = Record<Lang, string>;
type Rect = [number, number, number, number];

// Mismas piezas y encuadre que el generador (scripts/xray/run.mjs, REGIONS).
const ARMS =
  "(Humerus|Radius|Ulna|hand|finger|carp|metacarp|Scaphoid|Lunate|Triquetr|Pisiform|Trapezi|Capitate|Hamate|biceps|triceps|brachi|deltoid|forearm|pronator|supinator|anconeus|coracobrachialis|palmar|thenar|lumbrical|interosse|pollicis)";
const HAND_BONES = "(finger of hand|metacarpal|Scaphoid|Lunate|Triquetr|Pisiform|Trapezi|Capitate|Hamate).*\\.r$";
const VIEW: Record<PhantomId, { bones: string; include?: string; exclude?: string; fieldCm: number }> = {
  torax: { bones: "(rib|Sternum|Clavicle|Vertebra T)", exclude: ARMS, fieldCm: 70 },
  mano: {
    bones: HAND_BONES,
    include:
      "(hand|finger|thumb|pollicis|digit|interosse|lumbrical|palmar|thenar|metacarp|carp|Scaphoid|Lunate|Triquetr|Pisiform|Trapezi|Capitate|Hamate|Radius|Ulna|forearm|flexor|extensor|pronator|brachioradialis|radial|ulnar).*\\.r$",
    fieldCm: 34,
  },
  rodilla: { bones: "^Patella\\.r$", include: "\\.r$", fieldCm: 44 },
  pelvis: { bones: "(Hip bone|Sacrum)", exclude: ARMS, fieldCm: 60 },
};

interface Incidence {
  id: string;
  region: PhantomId;
  name: L;
  target: number; // rotación correcta (°)
  tol: number; // margen admitido (°)
  range: [number, number];
  start: number; // rotación con la que empieza (mal, para que la corrija)
  point: string; // punto de centraje
  landmark: L;
  centerTol: number; // cm
  /** Zona que debe salir entera (en px de la vista): zona de interés + márgenes [izq, arriba, dcha, abajo] en cm. */
  roi: string;
  withPoint?: string;
  margins: [number, number, number, number];
  detector: [number, number]; // cm (ancho × alto)
  flip?: boolean; // se muestra girada 180° (la mano, con los dedos hacia arriba)
  marker: L;
  rotationError: L;
  cutError: L;
  prep: { id: string; label: L; error: L }[];
  criteria: { key: string; text: L }[];
  technique: { label: L; value: L }[];
}

const METAL = (where: L) => ({
  id: "metal",
  label: { es: `Retirar objetos metálicos (${where.es})`, pt: `Retirar objetos metálicos (${where.pt})` },
  error: {
    es: "Hay objetos metálicos en el campo: dejan artefactos blancos que tapan la anatomía.",
    pt: "Há objetos metálicos no campo: deixam artefactos brancos que tapam a anatomia.",
  },
});
const RINGS = METAL({ es: "anillos, reloj, pulseras", pt: "anéis, relógio, pulseiras" });

const INCIDENCES: Incidence[] = [
  {
    id: "toraxPA",
    region: "torax",
    name: { es: "Tórax PA", pt: "Tórax PA" },
    target: 0,
    tol: 2.5,
    range: [-20, 20],
    start: 10,
    point: "t7",
    landmark: { es: "T7 (ángulo inferior de la escápula)", pt: "T7 (ângulo inferior da omoplata)" },
    centerTol: 2.5,
    roi: "lungs",
    margins: [2, 2, 2, 2],
    detector: [35, 43],
    marker: { es: "D", pt: "D" },
    rotationError: {
      es: "Paciente rotado: las clavículas no quedan simétricas respecto a las apófisis espinosas y el corazón se deforma.",
      pt: "Doente rodado: as clavículas não ficam simétricas em relação às apófises espinhosas e o coração deforma-se.",
    },
    cutError: {
      es: "Se han cortado los pulmones: deben salir los vértices y los senos costofrénicos.",
      pt: "Os pulmões ficaram cortados: devem aparecer os vértices e os seios costofrénicos.",
    },
    prep: [
      {
        id: "shoulders",
        label: {
          es: "Hombros hacia delante (dorso de las manos en las caderas)",
          pt: "Ombros para a frente (dorso das mãos nas ancas)",
        },
        error: {
          es: "Sin rotar los hombros hacia delante, las escápulas se superponen a los campos pulmonares.",
          pt: "Sem rodar os ombros para a frente, as omoplatas sobrepõem-se aos campos pulmonares.",
        },
      },
      {
        id: "breath",
        label: { es: "Inspiración profunda y apnea", pt: "Inspiração profunda e apneia" },
        error: {
          es: "Sin inspiración profunda se ven menos de 10 costillas posteriores sobre el diafragma y el corazón parece más grande.",
          pt: "Sem inspiração profunda veem-se menos de 10 costelas posteriores acima do diafragma e o coração parece maior.",
        },
      },
      METAL({ es: "collares, sujetador con aros", pt: "colares, soutien com aros" }),
    ],
    criteria: [
      {
        key: "rot",
        text: { es: "Clavículas simétricas (paciente sin rotar)", pt: "Clavículas simétricas (doente sem rodar)" },
      },
      {
        key: "prep:shoulders",
        text: { es: "Escápulas fuera de los campos pulmonares", pt: "Omoplatas fora dos campos pulmonares" },
      },
      {
        key: "prep:breath",
        text: {
          es: "10 costillas posteriores por encima del diafragma",
          pt: "10 costelas posteriores acima do diafragma",
        },
      },
      {
        key: "coll",
        text: { es: "Vértices y senos costofrénicos incluidos", pt: "Vértices e seios costofrénicos incluídos" },
      },
      { key: "center", text: { es: "Rayo centrado en T7", pt: "Raio centrado em T7" } },
      { key: "prep:metal", text: { es: "Sin artefactos metálicos", pt: "Sem artefactos metálicos" } },
    ],
    technique: [
      {
        label: { es: "Paciente", pt: "Doente" },
        value: {
          es: "De pie, de espaldas al tubo, con el pecho contra el detector y la barbilla levantada",
          pt: "De pé, de costas para a ampola, com o peito contra o detetor e o queixo levantado",
        },
      },
      {
        label: { es: "Distancia", pt: "Distância" },
        value: { es: "180 cm (menos magnificación del corazón)", pt: "180 cm (menos ampliação do coração)" },
      },
      {
        label: { es: "Rayo central", pt: "Raio central" },
        value: { es: "Horizontal, perpendicular, a la altura de T7", pt: "Horizontal, perpendicular, à altura de T7" },
      },
      {
        label: { es: "Técnica", pt: "Técnica" },
        value: { es: "120 kV · 3 mAs · con rejilla", pt: "120 kV · 3 mAs · com grelha" },
      },
    ],
  },
  {
    id: "toraxLat",
    region: "torax",
    name: { es: "Tórax lateral", pt: "Tórax perfil" },
    target: 90,
    tol: 2.5,
    range: [70, 110],
    start: 100,
    point: "lungsT7",
    landmark: { es: "T7, en la línea axilar media", pt: "T7, na linha axilar média" },
    centerTol: 2.5,
    roi: "lungs",
    margins: [2, 2, 2, 2],
    detector: [35, 43],
    marker: { es: "I", pt: "E" },
    rotationError: {
      es: "Paciente rotado: las costillas posteriores de los dos lados no se superponen (se ven dobles).",
      pt: "Doente rodado: as costelas posteriores dos dois lados não se sobrepõem (veem-se duplas).",
    },
    cutError: {
      es: "Se ha cortado el tórax: deben salir los vértices, el esternón, la columna y los senos costofrénicos posteriores.",
      pt: "O tórax ficou cortado: devem aparecer os vértices, o esterno, a coluna e os seios costofrénicos posteriores.",
    },
    prep: [
      {
        id: "arms",
        label: { es: "Brazos levantados por encima de la cabeza", pt: "Braços levantados acima da cabeça" },
        error: {
          es: "Con los brazos abajo, los húmeros tapan la parte alta del tórax.",
          pt: "Com os braços em baixo, os úmeros tapam a parte alta do tórax.",
        },
      },
      {
        id: "breath",
        label: { es: "Inspiración profunda y apnea", pt: "Inspiração profunda e apneia" },
        error: {
          es: "Sin inspiración profunda los pulmones no se expanden del todo.",
          pt: "Sem inspiração profunda os pulmões não se expandem por completo.",
        },
      },
    ],
    criteria: [
      {
        key: "rot",
        text: {
          es: "Costillas posteriores superpuestas (sin rotar)",
          pt: "Costelas posteriores sobrepostas (sem rodar)",
        },
      },
      { key: "prep:arms", text: { es: "Brazos fuera del tórax", pt: "Braços fora do tórax" } },
      {
        key: "coll",
        text: {
          es: "Del vértice a los senos costofrénicos, del esternón a la columna",
          pt: "Do vértice aos seios costofrénicos, do esterno à coluna",
        },
      },
      { key: "center", text: { es: "Rayo centrado a la altura de T7", pt: "Raio centrado à altura de T7" } },
      { key: "prep:breath", text: { es: "Pulmones bien expandidos", pt: "Pulmões bem expandidos" } },
    ],
    technique: [
      {
        label: { es: "Paciente", pt: "Doente" },
        value: {
          es: "De pie, lado izquierdo contra el detector (corazón más cerca, menos magnificado)",
          pt: "De pé, lado esquerdo contra o detetor (coração mais perto, menos ampliado)",
        },
      },
      { label: { es: "Distancia", pt: "Distância" }, value: { es: "180 cm", pt: "180 cm" } },
      {
        label: { es: "Rayo central", pt: "Raio central" },
        value: {
          es: "Horizontal, a la altura de T7, en la línea axilar media",
          pt: "Horizontal, à altura de T7, na linha axilar média",
        },
      },
      {
        label: { es: "Técnica", pt: "Técnica" },
        value: { es: "125 kV · 6 mAs · con rejilla", pt: "125 kV · 6 mAs · com grelha" },
      },
    ],
  },
  {
    id: "manoPA",
    region: "mano",
    name: { es: "Mano PA", pt: "Mão PA" },
    target: 0,
    tol: 2.5,
    range: [-10, 60],
    start: 15,
    point: "mcp3",
    landmark: { es: "cabeza del 3.er metacarpiano", pt: "cabeça do 3.º metacarpo" },
    centerTol: 1.5,
    roi: "hand",
    margins: [1, 3, 1, 1],
    detector: [24, 30],
    flip: true,
    marker: { es: "D", pt: "D" },
    rotationError: {
      es: "Mano girada: los metacarpianos se superponen. La palma tiene que estar plana sobre el detector.",
      pt: "Mão rodada: os metacarpos sobrepõem-se. A palma tem de estar plana sobre o detetor.",
    },
    cutError: {
      es: "Se ha cortado la mano: deben salir las puntas de los dedos y 2–3 cm de radio y cúbito.",
      pt: "A mão ficou cortada: devem aparecer as pontas dos dedos e 2–3 cm do rádio e do cúbito.",
    },
    prep: [
      {
        id: "fingers",
        label: { es: "Dedos ligeramente separados", pt: "Dedos ligeiramente afastados" },
        error: {
          es: "Con los dedos juntos, las partes blandas de unos se superponen a las de otros.",
          pt: "Com os dedos juntos, as partes moles de uns sobrepõem-se às dos outros.",
        },
      },
      {
        id: "flat",
        label: { es: "Palma completamente apoyada", pt: "Palma completamente apoiada" },
        error: {
          es: "Si la mano no está plana, las articulaciones interfalángicas y metacarpofalángicas no salen abiertas.",
          pt: "Se a mão não estiver plana, as articulações interfalângicas e metacarpofalângicas não ficam abertas.",
        },
      },
      RINGS,
    ],
    criteria: [
      {
        key: "rot",
        text: {
          es: "Metacarpianos sin superponerse (misma separación)",
          pt: "Metacarpos sem se sobreporem (mesma separação)",
        },
      },
      { key: "prep:flat", text: { es: "Articulaciones abiertas", pt: "Articulações abertas" } },
      { key: "prep:fingers", text: { es: "Dedos separados", pt: "Dedos afastados" } },
      {
        key: "coll",
        text: {
          es: "Puntas de los dedos y radio/cúbito distales incluidos",
          pt: "Pontas dos dedos e rádio/cúbito distais incluídos",
        },
      },
      {
        key: "center",
        text: {
          es: "Centrado en la 3.ª articulación metacarpofalángica",
          pt: "Centrado na 3.ª articulação metacarpofalângica",
        },
      },
      { key: "prep:metal", text: { es: "Sin anillos ni pulseras", pt: "Sem anéis nem pulseiras" } },
    ],
    technique: [
      {
        label: { es: "Paciente", pt: "Doente" },
        value: {
          es: "Sentada junto a la mesa, mano en pronación (palma abajo) sobre el detector",
          pt: "Sentado junto à mesa, mão em pronação (palma para baixo) sobre o detetor",
        },
      },
      { label: { es: "Distancia", pt: "Distância" }, value: { es: "100 cm", pt: "100 cm" } },
      {
        label: { es: "Rayo central", pt: "Raio central" },
        value: {
          es: "Perpendicular, a la cabeza del 3.er metacarpiano",
          pt: "Perpendicular, à cabeça do 3.º metacarpo",
        },
      },
      {
        label: { es: "Técnica", pt: "Técnica" },
        value: { es: "50 kV · 2,5 mAs · sin rejilla", pt: "50 kV · 2,5 mAs · sem grelha" },
      },
    ],
  },
  {
    id: "manoObl",
    region: "mano",
    name: { es: "Mano oblicua", pt: "Mão oblíqua" },
    target: 45,
    tol: 5,
    range: [-10, 60],
    start: 15,
    point: "mcp3",
    landmark: { es: "cabeza del 3.er metacarpiano", pt: "cabeça do 3.º metacarpo" },
    centerTol: 1.5,
    roi: "hand",
    margins: [1, 3, 1, 1],
    detector: [24, 30],
    flip: true,
    marker: { es: "D", pt: "D" },
    rotationError: {
      es: "La oblicua es a 45°: con menos, los metacarpianos apenas se separan; con más, se superponen.",
      pt: "A oblíqua é a 45°: com menos, os metacarpos quase não se separam; com mais, sobrepõem-se.",
    },
    cutError: {
      es: "Se ha cortado la mano: deben salir las puntas de los dedos y 2–3 cm de radio y cúbito.",
      pt: "A mão ficou cortada: devem aparecer as pontas dos dedos e 2–3 cm do rádio e do cúbito.",
    },
    prep: [
      {
        id: "wedge",
        label: {
          es: "Cuña de 45° con los dedos paralelos al detector",
          pt: "Cunha de 45° com os dedos paralelos ao detetor",
        },
        error: {
          es: "Sin cuña los dedos caen hacia el detector y las articulaciones interfalángicas salen cerradas.",
          pt: "Sem cunha os dedos caem para o detetor e as articulações interfalângicas ficam fechadas.",
        },
      },
      {
        id: "fingers",
        label: { es: "Dedos separados", pt: "Dedos afastados" },
        error: {
          es: "Con los dedos juntos se superponen entre sí.",
          pt: "Com os dedos juntos sobrepõem-se entre si.",
        },
      },
      RINGS,
    ],
    criteria: [
      {
        key: "rot",
        text: {
          es: "Metacarpianos 3–5 algo superpuestos y 1–2 separados (45°)",
          pt: "Metacarpos 3–5 algo sobrepostos e 1–2 separados (45°)",
        },
      },
      {
        key: "prep:wedge",
        text: { es: "Articulaciones interfalángicas abiertas", pt: "Articulações interfalângicas abertas" },
      },
      { key: "prep:fingers", text: { es: "Dedos separados", pt: "Dedos afastados" } },
      {
        key: "coll",
        text: {
          es: "Puntas de los dedos y radio/cúbito distales incluidos",
          pt: "Pontas dos dedos e rádio/cúbito distais incluídos",
        },
      },
      {
        key: "center",
        text: {
          es: "Centrado en la 3.ª articulación metacarpofalángica",
          pt: "Centrado na 3.ª articulação metacarpofalângica",
        },
      },
      { key: "prep:metal", text: { es: "Sin anillos ni pulseras", pt: "Sem anéis nem pulseiras" } },
    ],
    technique: [
      {
        label: { es: "Paciente", pt: "Doente" },
        value: {
          es: "Desde la PA, girar la mano 45° hacia fuera (lado del pulgar arriba)",
          pt: "A partir da PA, rodar a mão 45° para fora (lado do polegar para cima)",
        },
      },
      { label: { es: "Distancia", pt: "Distância" }, value: { es: "100 cm", pt: "100 cm" } },
      {
        label: { es: "Rayo central", pt: "Raio central" },
        value: {
          es: "Perpendicular, a la cabeza del 3.er metacarpiano",
          pt: "Perpendicular, à cabeça do 3.º metacarpo",
        },
      },
      {
        label: { es: "Técnica", pt: "Técnica" },
        value: { es: "50 kV · 2,5 mAs · sin rejilla", pt: "50 kV · 2,5 mAs · sem grelha" },
      },
    ],
  },
  {
    id: "rodillaAP",
    region: "rodilla",
    name: { es: "Rodilla AP", pt: "Joelho AP" },
    target: 0,
    tol: 2.5,
    range: [-15, 15],
    start: -10,
    point: "joint",
    landmark: {
      es: "interlínea articular (1–1,5 cm bajo el vértice de la rótula)",
      pt: "interlinha articular (1–1,5 cm abaixo do vértice da rótula)",
    },
    centerTol: 2,
    roi: "patella",
    margins: [6, 10, 6, 10],
    detector: [24, 30],
    marker: { es: "D", pt: "D" },
    rotationError: {
      es: "Pierna rotada: la rótula no queda centrada entre los cóndilos femorales y la cabeza del peroné cambia de posición.",
      pt: "Perna rodada: a rótula não fica centrada entre os côndilos femorais e a cabeça do perónio muda de posição.",
    },
    cutError: {
      es: "Se ha cortado la rodilla: deben salir el fémur distal y la tibia y el peroné proximales.",
      pt: "O joelho ficou cortado: devem aparecer o fémur distal e a tíbia e o perónio proximais.",
    },
    prep: [
      {
        id: "extended",
        label: { es: "Pierna completamente extendida", pt: "Perna completamente estendida" },
        error: {
          es: "Con la rodilla flexionada, la interlínea articular no sale abierta.",
          pt: "Com o joelho fletido, a interlinha articular não fica aberta.",
        },
      },
    ],
    criteria: [
      {
        key: "rot",
        text: { es: "Rótula centrada entre los cóndilos femorales", pt: "Rótula centrada entre os côndilos femorais" },
      },
      { key: "prep:extended", text: { es: "Interlínea articular abierta", pt: "Interlinha articular aberta" } },
      {
        key: "coll",
        text: {
          es: "Fémur distal y tibia/peroné proximales incluidos",
          pt: "Fémur distal e tíbia/perónio proximais incluídos",
        },
      },
      {
        key: "center",
        text: { es: "Rayo centrado en la interlínea articular", pt: "Raio centrado na interlinha articular" },
      },
    ],
    technique: [
      {
        label: { es: "Paciente", pt: "Doente" },
        value: {
          es: "Decúbito supino, pierna extendida, rótula mirando al techo",
          pt: "Decúbito dorsal, perna estendida, rótula virada para o teto",
        },
      },
      { label: { es: "Distancia", pt: "Distância" }, value: { es: "100 cm", pt: "100 cm" } },
      {
        label: { es: "Rayo central", pt: "Raio central" },
        value: {
          es: "Perpendicular (o 5° craneal), 1–1,5 cm bajo el vértice de la rótula",
          pt: "Perpendicular (ou 5° cranial), 1–1,5 cm abaixo do vértice da rótula",
        },
      },
      {
        label: { es: "Técnica", pt: "Técnica" },
        value: { es: "70 kV · 6 mAs · con rejilla", pt: "70 kV · 6 mAs · com grelha" },
      },
    ],
  },
  {
    id: "rodillaLat",
    region: "rodilla",
    name: { es: "Rodilla lateral", pt: "Joelho perfil" },
    target: 90,
    tol: 2.5,
    range: [75, 105],
    start: 80,
    point: "joint",
    landmark: {
      es: "interlínea articular (2,5 cm distal al epicóndilo medial)",
      pt: "interlinha articular (2,5 cm distal ao epicôndilo medial)",
    },
    centerTol: 2,
    roi: "patella",
    withPoint: "joint",
    margins: [2, 10, 7, 10],
    detector: [24, 30],
    marker: { es: "D", pt: "D" },
    rotationError: {
      es: "Pierna rotada: los cóndilos femorales no se superponen (se ve uno por delante del otro).",
      pt: "Perna rodada: os côndilos femorais não se sobrepõem (vê-se um à frente do outro).",
    },
    cutError: {
      es: "Se ha cortado la rodilla: deben salir la rótula, el hueco poplíteo y los extremos de fémur y tibia.",
      pt: "O joelho ficou cortado: devem aparecer a rótula, o cavado poplíteo e as extremidades do fémur e da tíbia.",
    },
    prep: [
      {
        id: "flex",
        label: { es: "Rodilla flexionada 20–30°", pt: "Joelho fletido 20–30°" },
        error: {
          es: "Sin flexionar la rodilla, el cuádriceps tensa la rótula y la articulación femoropatelar no se ve bien.",
          pt: "Sem fletir o joelho, o quadricípite tensiona a rótula e a articulação femoropatelar não se vê bem.",
        },
      },
      {
        id: "other",
        label: { es: "Pierna contraria por detrás", pt: "Perna contrária por trás" },
        error: {
          es: "La otra pierna se superpone a la rodilla que estudias.",
          pt: "A outra perna sobrepõe-se ao joelho em estudo.",
        },
      },
    ],
    criteria: [
      { key: "rot", text: { es: "Cóndilos femorales superpuestos", pt: "Côndilos femorais sobrepostos" } },
      {
        key: "prep:flex",
        text: {
          es: "Rodilla en 20–30° de flexión, femoropatelar abierta",
          pt: "Joelho a 20–30° de flexão, femoropatelar aberta",
        },
      },
      {
        key: "coll",
        text: {
          es: "Rótula, hueco poplíteo, fémur distal y tibia proximal",
          pt: "Rótula, cavado poplíteo, fémur distal e tíbia proximal",
        },
      },
      {
        key: "center",
        text: { es: "Rayo centrado en la interlínea articular", pt: "Raio centrado na interlinha articular" },
      },
      { key: "prep:other", text: { es: "Sin superposición de la otra pierna", pt: "Sem sobreposição da outra perna" } },
    ],
    technique: [
      {
        label: { es: "Paciente", pt: "Doente" },
        value: {
          es: "Decúbito lateral sobre el lado a estudiar, rodilla flexionada 20–30°",
          pt: "Decúbito lateral sobre o lado a estudar, joelho fletido 20–30°",
        },
      },
      { label: { es: "Distancia", pt: "Distância" }, value: { es: "100 cm", pt: "100 cm" } },
      {
        label: { es: "Rayo central", pt: "Raio central" },
        value: {
          es: "5–7° craneal, 2,5 cm distal al epicóndilo medial",
          pt: "5–7° cranial, 2,5 cm distal ao epicôndilo medial",
        },
      },
      {
        label: { es: "Técnica", pt: "Técnica" },
        value: { es: "65 kV · 5 mAs · con rejilla", pt: "65 kV · 5 mAs · com grelha" },
      },
    ],
  },
  {
    id: "pelvisAP",
    region: "pelvis",
    name: { es: "Pelvis AP", pt: "Bacia AP" },
    target: 0,
    tol: 2.5,
    range: [-20, 20],
    start: -10,
    point: "center",
    landmark: {
      es: "punto medio entre las EIAS y la sínfisis del pubis",
      pt: "ponto médio entre as EIAS e a sínfise púbica",
    },
    centerTol: 2.5,
    roi: "pelvis",
    margins: [3, 2, 3, 6],
    detector: [43, 35],
    marker: { es: "D", pt: "D" },
    rotationError: {
      es: "Pelvis rotada: los agujeros obturadores y las alas ilíacas no son simétricos.",
      pt: "Bacia rodada: os buracos obturadores e as asas ilíacas não são simétricos.",
    },
    cutError: {
      es: "Se ha cortado la pelvis: deben salir las crestas ilíacas y los trocánteres menores.",
      pt: "A bacia ficou cortada: devem aparecer as cristas ilíacas e os pequenos trocânteres.",
    },
    prep: [
      {
        id: "feet",
        label: { es: "Pies en rotación interna de 15–20°", pt: "Pés em rotação interna de 15–20°" },
        error: {
          es: "Sin rotación interna, los cuellos femorales salen acortados y los trocánteres menores se ven demasiado.",
          pt: "Sem rotação interna, os colos femorais ficam encurtados e os pequenos trocânteres veem-se demasiado.",
        },
      },
      METAL({ es: "cinturón, bolsillos", pt: "cinto, bolsos" }),
    ],
    criteria: [
      {
        key: "rot",
        text: {
          es: "Agujeros obturadores y alas ilíacas simétricos",
          pt: "Buracos obturadores e asas ilíacas simétricos",
        },
      },
      {
        key: "prep:feet",
        text: {
          es: "Cuellos femorales enteros, trocánteres menores apenas visibles",
          pt: "Colos femorais inteiros, pequenos trocânteres pouco visíveis",
        },
      },
      {
        key: "coll",
        text: {
          es: "Crestas ilíacas y fémures proximales incluidos",
          pt: "Cristas ilíacas e fémures proximais incluídos",
        },
      },
      { key: "center", text: { es: "Rayo centrado en la línea media", pt: "Raio centrado na linha média" } },
      { key: "prep:metal", text: { es: "Sin artefactos metálicos", pt: "Sem artefactos metálicos" } },
    ],
    technique: [
      {
        label: { es: "Paciente", pt: "Doente" },
        value: {
          es: "Decúbito supino, piernas extendidas y pies en rotación interna",
          pt: "Decúbito dorsal, pernas estendidas e pés em rotação interna",
        },
      },
      { label: { es: "Distancia", pt: "Distância" }, value: { es: "100–115 cm", pt: "100–115 cm" } },
      {
        label: { es: "Rayo central", pt: "Raio central" },
        value: {
          es: "Perpendicular, a medio camino entre las EIAS y la sínfisis del pubis",
          pt: "Perpendicular, a meio caminho entre as EIAS e a sínfise púbica",
        },
      },
      {
        label: { es: "Técnica", pt: "Técnica" },
        value: { es: "75 kV · 25 mAs · con rejilla", pt: "75 kV · 25 mAs · com grelha" },
      },
    ],
  },
];

const TEXT = {
  es: {
    placement: "Colocación",
    rotation: "Rotación del paciente",
    fieldW: "Ancho del campo",
    fieldH: "Alto del campo",
    center: "Centraje",
    dragHint: "Arrastra sobre el paciente para mover el rayo central",
    lightField: "Campo de luz del colimador",
    fire: "☢️ Disparar",
    reset: "Empezar de nuevo",
    loading: "Preparando al paciente…",
    loadError: "No se ha podido cargar el paciente. Comprueba la conexión.",
    good: "¡Bien colocado!",
    repeat: (n: number) => (n === 1 ? "Hay que repetir: 1 fallo" : `Hay que repetir: ${n} fallos`),
    fireHint: "Coloca al paciente y dispara para ver la radiografía.",
    rotOff: (d: number) => `Te has desviado ${d > 0 ? "+" : ""}${d}°.`,
    centerOff: (cm: string, where: string) => `Centraje desviado ${cm} cm ${where} del punto correcto`,
    and: " y ",
    dirs: { up: "hacia arriba", down: "hacia abajo", left: "a la izquierda", right: "a la derecha" },
    cutSides: (s: string) => `(cortado por: ${s})`,
    sides: { left: "izquierda", top: "arriba", right: "derecha", bottom: "abajo" },
    tooBig: "Campo demasiado abierto: colima a la zona de interés (menos dosis y menos radiación dispersa).",
    rightPoint: "Aquí era",
    guideTab: "¿Qué tengo que hacer?",
    askTab: "Preguntar",
    steps: {
      prep: "Prepara al paciente",
      rot: (t: number) => (t === 0 ? "Paciente sin rotar (0°)" : `Gira al paciente ${t}°`),
      center: "Centra el rayo central en:",
      coll: "Colima a la zona que debe salir, sin abrir de más:",
      fire: "Dispara y revisa los criterios de calidad",
    },
    showMe: "Muéstrame dónde",
    hideMe: "Ocultar el punto",
    askPlaceholder: "Pregunta lo que quieras de esta proyección…",
    send: "Enviar",
    suggestions: [
      "¿Qué he hecho mal?",
      "¿Por qué se coloca así?",
      "¿Cómo encuentro el punto de centraje en un paciente real?",
    ],
    thinking: "Pensando…",
    aiNote: "Responde la IA con tus apuntes; puede equivocarse.",
    technique: "Ficha técnica",
    detector: (w: number, h: number) => `Detector ${w} × ${h} cm`,
    stale: "Has cambiado la colocación: vuelve a disparar.",
    credits: "Anatomía calculada a partir de Z-Anatomy (CC BY-SA 4.0), basado en BodyParts3D © DBCLS.",
  },
  pt: {
    placement: "Posicionamento",
    rotation: "Rotação do doente",
    fieldW: "Largura do campo",
    fieldH: "Altura do campo",
    center: "Centragem",
    dragHint: "Arrasta sobre o doente para mover o raio central",
    lightField: "Campo luminoso do colimador",
    fire: "☢️ Disparar",
    reset: "Começar de novo",
    loading: "A preparar o doente…",
    loadError: "Não foi possível carregar o doente. Verifica a ligação.",
    good: "Bem posicionado!",
    repeat: (n: number) => (n === 1 ? "É preciso repetir: 1 erro" : `É preciso repetir: ${n} erros`),
    fireHint: "Posiciona o doente e dispara para ver a radiografia.",
    rotOff: (d: number) => `Desviaste-te ${d > 0 ? "+" : ""}${d}°.`,
    centerOff: (cm: string, where: string) => `Centragem desviada ${cm} cm ${where} do ponto correto`,
    and: " e ",
    dirs: { up: "para cima", down: "para baixo", left: "para a esquerda", right: "para a direita" },
    cutSides: (s: string) => `(cortado em: ${s})`,
    sides: { left: "esquerda", top: "cima", right: "direita", bottom: "baixo" },
    tooBig: "Campo demasiado aberto: colima à zona de interesse (menos dose e menos radiação dispersa).",
    rightPoint: "Era aqui",
    guideTab: "O que tenho de fazer?",
    askTab: "Perguntar",
    steps: {
      prep: "Prepara o doente",
      rot: (t: number) => (t === 0 ? "Doente sem rodar (0°)" : `Roda o doente ${t}°`),
      center: "Centra o raio central em:",
      coll: "Colima à zona que deve aparecer, sem abrir demasiado:",
      fire: "Dispara e revê os critérios de qualidade",
    },
    showMe: "Mostra-me onde",
    hideMe: "Esconder o ponto",
    askPlaceholder: "Pergunta o que quiseres sobre esta incidência…",
    send: "Enviar",
    suggestions: [
      "O que fiz mal?",
      "Porque se posiciona assim?",
      "Como encontro o ponto de centragem num doente real?",
    ],
    thinking: "A pensar…",
    aiNote: "Responde a IA com os teus apontamentos; pode enganar-se.",
    technique: "Ficha técnica",
    detector: (w: number, h: number) => `Detetor ${w} × ${h} cm`,
    stale: "Mudaste o posicionamento: volta a disparar.",
    credits: "Anatomia calculada a partir do Z-Anatomy (CC BY-SA 4.0), baseado no BodyParts3D © DBCLS.",
  },
};

interface Pose {
  rot: number;
  cx: number; // rayo central, en px de la vista
  cy: number;
  fw: number; // campo de luz, en cm
  fh: number;
  prep: Record<string, boolean>;
}

interface Shot {
  pose: Pose;
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
  checks: Record<string, boolean>;
  errors: string[];
  target: [number, number];
}

const startPose = (inc: Incidence, r: PosRegion): Pose => ({
  rot: inc.start,
  cx: r.w / 2,
  cy: r.h / 2,
  fw: inc.detector[0],
  fh: inc.detector[1],
  prep: {},
});

// ---------- Esqueleto 3D (el mismo modelo del atlas) ----------

let bonesPromise: Promise<THREE.Group> | null = null;
function loadBones() {
  bonesPromise ??= new Promise<THREE.Group>((ok, ko) =>
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load("/atlas/huesos.glb", (g) => ok(g.scene), undefined, ko),
  );
  bonesPromise.catch(() => (bonesPromise = null));
  return bonesPromise;
}

interface Three {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  meshes: { mesh: THREE.Mesh; name: string }[];
}

/** Encuadre igual que el generador: centro de las piezas de referencia, campo fijo y giro alrededor del eje vertical. */
function frame(s: Three, region: PhantomId, rot: number) {
  const v = VIEW[region];
  const inc_ = v.include ? new RegExp(v.include, "i") : null;
  const exc = v.exclude ? new RegExp(v.exclude, "i") : null;
  const ref = new RegExp(v.bones);
  const box = new THREE.Box3();
  for (const { mesh, name } of s.meshes) {
    mesh.visible = (!inc_ || inc_.test(name)) && (!exc || !exc.test(name));
    if (ref.test(name)) box.expandByObject(mesh);
  }
  const c = box.getCenter(new THREE.Vector3());
  const half = v.fieldCm / 200;
  Object.assign(s.camera, { left: -half, right: half, top: half, bottom: -half });
  s.camera.updateProjectionMatrix();
  const az = (rot * Math.PI) / 180;
  s.camera.position.set(c.x + Math.sin(az) * 3, c.y, c.z + Math.cos(az) * 3);
  s.camera.lookAt(c);
}

/** Cómo está colocada la proyección: qué criterios cumple y qué falla (con su explicación). */
function evaluate(inc: Incidence, region: PosRegion, pose: Pose, lang: Lang) {
  const tx = TEXT[lang];
  const data = region.angles[String(pose.rot)];
  const cm = region.cmPerPx;
  const fx0 = pose.cx - pose.fw / cm / 2;
  const fx1 = pose.cx + pose.fw / cm / 2;
  const fy0 = pose.cy - pose.fh / cm / 2;
  const fy1 = pose.cy + pose.fh / cm / 2;
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];
  const dRot = pose.rot - inc.target;
  checks.rot = Math.abs(dRot) <= inc.tol;
  if (!checks.rot) errors.push(`${inc.rotationError[lang]} ${tx.rotOff(dRot)}`);

  const target = data.points[inc.point];
  const ddx = (pose.cx - target[0]) * cm * (inc.flip ? -1 : 1);
  const ddy = (pose.cy - target[1]) * cm * (inc.flip ? -1 : 1);
  const dist = Math.hypot(ddx, ddy);
  checks.center = dist <= inc.centerTol;
  if (!checks.center) {
    const dirs: string[] = [];
    if (Math.abs(ddy) > 1) dirs.push(ddy < 0 ? tx.dirs.up : tx.dirs.down);
    if (Math.abs(ddx) > 1) dirs.push(ddx < 0 ? tx.dirs.left : tx.dirs.right);
    errors.push(`${tx.centerOff(dist.toFixed(1).replace(".", ","), dirs.join(tx.and))}: ${inc.landmark[lang]}.`);
  }

  const roi = data.rois[inc.roi];
  const need: Rect = [...roi];
  if (inc.withPoint) {
    const p = data.points[inc.withPoint];
    need[0] = Math.min(need[0], p[0]);
    need[1] = Math.min(need[1], p[1]);
    need[2] = Math.max(need[2], p[0]);
    need[3] = Math.max(need[3], p[1]);
  }
  const [ml, mt, mr, mb] = inc.margins;
  need[0] -= ml / cm;
  need[1] -= mt / cm;
  need[2] += mr / cm;
  need[3] += mb / cm;
  const tol = 1 / cm;
  const cut: (keyof typeof tx.sides)[] = [];
  if (need[0] < fx0 - tol) cut.push("left");
  if (need[1] < fy0 - tol) cut.push("top");
  if (need[2] > fx1 + tol) cut.push("right");
  if (need[3] > fy1 + tol) cut.push("bottom");
  const tooBig = (fx1 - fx0) * cm > (need[2] - need[0]) * cm + 8 || (fy1 - fy0) * cm > (need[3] - need[1]) * cm + 8;
  checks.coll = !cut.length && !tooBig;
  if (cut.length) {
    // En la mano la imagen se ve girada: arriba y abajo, izquierda y derecha se intercambian.
    const swap = { left: "right", right: "left", top: "bottom", bottom: "top" } as const;
    const shown = cut.map((c) => tx.sides[inc.flip ? swap[c] : c]);
    errors.push(`${inc.cutError[lang]} ${tx.cutSides(shown.join(", "))}`);
  } else if (tooBig) errors.push(tx.tooBig);

  for (const p of inc.prep) {
    checks[`prep:${p.id}`] = !!pose.prep[p.id];
    if (!pose.prep[p.id]) errors.push(p.error[lang]);
  }
  return { checks, errors, target };
}

export default function Positioning() {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const [incId, setIncId] = useState(INCIDENCES[0].id);
  const inc = INCIDENCES.find((i) => i.id === incId)!;
  const [regions, setRegions] = useState<Record<PhantomId, PosRegion> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [poses, setPoses] = useState<Record<string, Pose>>({});
  const [shot, setShot] = useState<Shot | null>(null);
  const [view, setView] = useState<{ key: string; phantom: Phantom } | null>(null);
  const [skeleton, setSkeleton] = useState(false);

  const region = regions?.[inc.region] ?? null;
  const pose = poses[incId] ?? (region ? startPose(inc, region) : null);
  const setPose = (p: Partial<Pose>) =>
    setPoses((all) => ({ ...all, [incId]: { ...(all[incId] ?? startPose(inc, region!)), ...p } }));

  useEffect(() => {
    loadPosMeta()
      .then((m) => setRegions(m.regions))
      .catch(() => setError(tx.loadError));
  }, [tx.loadError]);

  // Vista del paciente (silueta y radiografía) con la rotación actual.
  const viewKey = pose ? `${inc.region}_${pose.rot}` : "";
  useEffect(() => {
    if (!pose) return;
    let alive = true;
    loadPositionView(inc.region, pose.rot)
      .then((phantom) => alive && setView({ key: `${inc.region}_${pose.rot}`, phantom }))
      .catch(() => alive && setError(tx.loadError));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo depende de la región y la rotación
  }, [viewKey, tx.loadError]);
  const phantom = view?.key === viewKey ? view.phantom : null;

  // ---------- Escena 3D: el esqueleto visto desde el tubo ----------
  const mount = useRef<HTMLDivElement>(null);
  const three = useRef<Three | null>(null);
  const silhouette = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientWidth);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x886677, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.5, 1, 1);
    camera.add(sun);
    scene.add(camera);
    const s = { renderer, scene, camera, meshes: [] as { mesh: THREE.Mesh; name: string }[] };
    three.current = s;
    let alive = true;
    const material = new THREE.MeshStandardMaterial({ color: 0xeee3c8, roughness: 0.65 });
    loadBones()
      .then((root) => {
        if (!alive) return;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          let node: THREE.Object3D | null = mesh;
          while (node && !node.userData.n) node = node.parent;
          mesh.geometry.computeVertexNormals();
          mesh.material = material;
          s.meshes.push({ mesh, name: (node?.userData.n as string) ?? mesh.name });
        });
        scene.add(root);
        root.updateMatrixWorld(true);
        setSkeleton(true);
      })
      .catch(() => alive && setError(tx.loadError));
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientWidth);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.render(scene, camera);
    });
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, [tx.loadError]);

  const rot = pose?.rot ?? 0;
  useEffect(() => {
    const s = three.current;
    if (!s || !skeleton) return;
    frame(s, inc.region, rot);
    s.renderer.render(s.scene, s.camera);
  }, [skeleton, inc.region, rot]);

  // Silueta del paciente (piel), detrás del esqueleto.
  useEffect(() => {
    const ctx = silhouette.current?.getContext("2d");
    if (!ctx || !phantom) return;
    const img = ctx.createImageData(phantom.w, phantom.h);
    for (let i = 0; i < phantom.soft.length; i++) {
      const t = phantom.soft[i] + phantom.bone[i];
      const a = Math.min(1, t / 2.5);
      const shade = 0.55 + 0.45 * Math.min(1, t / (phantom.thickness || 20));
      img.data[i * 4] = 222 * shade;
      img.data[i * 4 + 1] = 160 * shade;
      img.data[i * 4 + 2] = 140 * shade;
      img.data[i * 4 + 3] = a * 150;
    }
    ctx.putImageData(img, 0, 0);
  }, [phantom]);

  // ---------- Centraje con el dedo ----------
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const moveTo = (e: React.PointerEvent) => {
    const el = stage.current;
    if (!el || !region) return;
    const r = el.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * region.w;
    let y = ((e.clientY - r.top) / r.height) * region.h;
    if (inc.flip) {
      x = region.w - x;
      y = region.h - y;
    }
    setPose({ cx: Math.max(0, Math.min(region.w, x)), cy: Math.max(0, Math.min(region.h, y)) });
  };

  // ---------- Disparo ----------
  const fire = () => {
    if (!pose || !region || !phantom) return;
    const cm = region.cmPerPx;
    const res = simulate(inc.region, phantom, IDEAL[inc.region]);
    // Imagen del detector, centrada en el rayo; fuera del campo de luz no llega radiación (blanco).
    const dw = Math.round(inc.detector[0] / cm);
    const dh = Math.round(inc.detector[1] / cm);
    const px = new Uint8ClampedArray(dw * dh);
    const fx0 = pose.cx - pose.fw / cm / 2;
    const fx1 = pose.cx + pose.fw / cm / 2;
    const fy0 = pose.cy - pose.fh / cm / 2;
    const fy1 = pose.cy + pose.fh / cm / 2;
    for (let y = 0; y < dh; y++)
      for (let x = 0; x < dw; x++) {
        const sx = Math.round(pose.cx - dw / 2 + x);
        const sy = Math.round(pose.cy - dh / 2 + y);
        let g = 238;
        if (sx >= fx0 && sx < fx1 && sy >= fy0 && sy < fy1)
          g = sx >= 0 && sy >= 0 && sx < phantom.w && sy < phantom.h ? res.pixels[sy * phantom.w + sx] : 8;
        px[y * dw + x] = g;
      }

    const { checks, errors, target } = evaluate(inc, region, pose, lang);
    setShot({ pose, w: dw, h: dh, pixels: px, checks, errors, target });
  };

  const result = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = result.current?.getContext("2d");
    if (!ctx || !shot) return;
    const img = ctx.createImageData(shot.w, shot.h);
    shot.pixels.forEach((g, i) => {
      img.data[i * 4] = g;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);
  }, [shot]);

  const shownShot = shot;
  // Si se toca algo después de disparar, la radiografía ya no corresponde a la colocación actual.
  const changed = !!shot && JSON.stringify(shot.pose) !== JSON.stringify(pose);

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  // Cómo va la colocación ahora mismo (para la guía y para preguntar).
  const live = useMemo(() => (pose && region ? evaluate(inc, region, pose, lang) : null), [inc, region, pose, lang]);
  // Punto correcto: al pedirlo en la guía, o después de un disparo mal centrado.
  const [showHint, setShowHint] = useState(false);
  const showTarget = showHint || (!!shownShot && !changed && !shownShot.checks.center);

  const field = useMemo(() => {
    if (!pose || !region) return null;
    const fw = pose.fw / region.cmPerPx;
    const fh = pose.fh / region.cmPerPx;
    return { left: pose.cx - fw / 2, top: pose.cy - fh / 2, fw, fh };
  }, [pose, region]);

  const selectIncidence = (id: string) => {
    setIncId(id);
    setShot(null);
    setShowHint(false);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup">
          {INCIDENCES.map((i) => (
            <button
              key={i.id}
              role="radio"
              aria-checked={incId === i.id}
              onClick={() => selectIncidence(i.id)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                incId === i.id ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
              }`}
            >
              {i.name[lang]}
            </button>
          ))}
        </div>

        <div className="relative mx-auto max-w-[480px] overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a1b28] to-[#120c11] shadow-lg">
          <div
            ref={stage}
            className="relative aspect-square cursor-crosshair touch-none select-none"
            style={inc.flip ? { transform: "rotate(180deg)" } : undefined}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              moveTo(e);
            }}
            onPointerMove={(e) => dragging.current && moveTo(e)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            {region && (
              <canvas
                ref={silhouette}
                width={region.w}
                height={region.h}
                className="absolute inset-0 h-full w-full"
                aria-hidden="true"
              />
            )}
            <div ref={mount} className="absolute inset-0" aria-hidden="true" />
            {field && region && pose && (
              <>
                <div
                  className="pointer-events-none absolute rounded-sm border-2 border-yellow-300/90 bg-yellow-200/15"
                  style={{
                    left: pct(field.left, region.w),
                    top: pct(field.top, region.h),
                    width: pct(field.fw, region.w),
                    height: pct(field.fh, region.h),
                  }}
                />
                <div
                  className="pointer-events-none absolute border-l-2 border-dashed border-yellow-300/90"
                  style={{
                    left: pct(pose.cx, region.w),
                    top: pct(field.top, region.h),
                    height: pct(field.fh, region.h),
                  }}
                />
                <div
                  className="pointer-events-none absolute border-t-2 border-dashed border-yellow-300/90"
                  style={{
                    top: pct(pose.cy, region.h),
                    left: pct(field.left, region.w),
                    width: pct(field.fw, region.w),
                  }}
                />
                <div
                  className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500 shadow-[0_0_0_4px_rgba(236,72,153,0.35)]"
                  style={{ left: pct(pose.cx, region.w), top: pct(pose.cy, region.h) }}
                />
                {showTarget && live && (
                  <div
                    className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500"
                    style={{ left: pct(live.target[0], region.w), top: pct(live.target[1], region.h) }}
                    title={tx.rightPoint}
                  />
                )}
              </>
            )}
          </div>
          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
            {tx.lightField}
          </span>
          {showTarget && live && (
            <span className="pointer-events-none absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {tx.rightPoint}
            </span>
          )}
          <span className="pointer-events-none absolute right-3 bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-center text-xs font-semibold text-white">
            {tx.dragHint}
          </span>
          {(!region || !skeleton) && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#120c11]/80">
              {error ? <ErrorBox message={error} /> : <Spinner label={tx.loading} />}
            </div>
          )}
        </div>
        <p className="text-muted mx-auto mt-1 max-w-[480px] text-center text-[0.7rem]">{tx.credits}</p>
      </div>

      <div className="space-y-4">
        {pose && region && (
          <div className="card space-y-4 p-4">
            <div className="text-muted text-xs font-bold tracking-wider uppercase">{tx.placement}</div>
            <Slider
              label={tx.rotation}
              value={`${pose.rot}°`}
              min={inc.range[0]}
              max={inc.range[1]}
              step={5}
              current={pose.rot}
              onChange={(v) => setPose({ rot: v })}
            />
            <Slider
              label={tx.fieldW}
              value={`${pose.fw} cm`}
              min={6}
              max={inc.detector[0]}
              step={1}
              current={pose.fw}
              onChange={(v) => setPose({ fw: v })}
            />
            <Slider
              label={tx.fieldH}
              value={`${pose.fh} cm`}
              min={6}
              max={inc.detector[1]}
              step={1}
              current={pose.fh}
              onChange={(v) => setPose({ fh: v })}
            />
            <p className="text-muted text-sm">{tx.detector(inc.detector[0], inc.detector[1])}</p>
            <div className="space-y-2">
              {inc.prep.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                    checked={!!pose.prep[p.id]}
                    onChange={(e) => setPose({ prep: { ...pose.prep, [p.id]: e.target.checked } })}
                  />
                  <span>{p.label[lang]}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary flex-1 text-lg" onClick={fire} disabled={!phantom}>
                {tx.fire}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setPoses((all) => ({ ...all, [incId]: startPose(inc, region) }));
                  setShot(null);
                }}
              >
                <ArrowCounterClockwise size={18} aria-hidden="true" /> {tx.reset}
              </button>
            </div>
          </div>
        )}

        {pose && region && live && (
          <Help
            inc={inc}
            lang={lang}
            checks={live.checks}
            showHint={showHint}
            onShowHint={() => setShowHint((v) => !v)}
            context={() => contextOf(inc, pose, lang, live.errors, shownShot && !changed ? shownShot.errors : null)}
          />
        )}

        <div className="card p-4">
          {shownShot ? (
            <>
              <div className="relative mx-auto max-w-[420px] overflow-hidden rounded-xl bg-black">
                <canvas
                  ref={result}
                  width={shownShot.w}
                  height={shownShot.h}
                  className="block w-full"
                  style={{
                    aspectRatio: `${shownShot.w} / ${shownShot.h}`,
                    transform: inc.flip ? "rotate(180deg)" : undefined,
                  }}
                  aria-label={inc.name[lang]}
                />
                <div
                  className={`absolute top-3 left-3 rounded-full px-3 py-1 text-sm font-bold shadow ${
                    shownShot.errors.length ? "bg-warning-soft text-amber" : "bg-success-soft text-success"
                  }`}
                >
                  {shownShot.errors.length ? tx.repeat(shownShot.errors.length) : tx.good}
                </div>
                <div className="absolute bottom-3 left-3 rounded-sm border border-black/60 bg-white/70 px-1.5 font-mono text-sm font-bold text-black">
                  {inc.marker[lang]}
                </div>
              </div>
              {changed && <p className="text-muted mt-2 text-center text-sm">{tx.stale}</p>}
              <ul className="mt-4 space-y-1.5">
                {inc.criteria.map((c) => {
                  const ok = shownShot.checks[c.key];
                  return (
                    <li key={c.key} className="flex items-start gap-2 text-sm">
                      {ok ? (
                        <Check size={18} weight="bold" className="text-success mt-0.5 shrink-0" aria-label="✓" />
                      ) : (
                        <X size={18} weight="bold" className="text-danger mt-0.5 shrink-0" aria-label="✗" />
                      )}
                      <span>{c.text[lang]}</span>
                    </li>
                  );
                })}
              </ul>
              {shownShot.errors.length > 0 && (
                <ul className="bg-warning-soft text-amber mt-4 space-y-2 rounded-xl p-3 text-sm">
                  {shownShot.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-muted py-6 text-center">{tx.fireHint}</p>
          )}
        </div>
        <div className="card p-4">
          <div className="text-muted mb-2 text-xs font-bold tracking-wider uppercase">
            {tx.technique} · {inc.name[lang]}
          </div>
          <dl className="space-y-2 text-sm">
            {inc.technique.map((r) => (
              <div key={r.label.es}>
                <dt className="font-semibold">{r.label[lang]}</dt>
                <dd className="text-muted">{r.value[lang]}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold">{tx.center}</dt>
              <dd className="text-muted">{inc.landmark[lang]}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

/** Resumen de la proyección y de cómo la ha colocado, para que la IA responda sobre su caso. */
function contextOf(inc: Incidence, pose: Pose, lang: Lang, now: string[], shot: string[] | null) {
  const es = lang === "es";
  const lines = [
    `${es ? "Proyección" : "Incidência"}: ${inc.name[lang]}`,
    ...inc.technique.map((r) => `${r.label[lang]}: ${r.value[lang]}`),
    `${es ? "Punto de centraje" : "Ponto de centragem"}: ${inc.landmark[lang]}`,
    `${es ? "Criterios de calidad" : "Critérios de qualidade"}: ${inc.criteria.map((c) => c.text[lang]).join("; ")}`,
    `${es ? "Preparación" : "Preparação"}: ${inc.prep.map((p) => `${p.label[lang]} (${pose.prep[p.id] ? "✓" : "✗"})`).join("; ")}`,
    `${es ? "Rotación actual" : "Rotação atual"}: ${pose.rot}° (${es ? "correcta" : "correta"}: ${inc.target}°)`,
    `${es ? "Campo de luz" : "Campo luminoso"}: ${pose.fw} × ${pose.fh} cm (${es ? "detector" : "detetor"} ${inc.detector.join(" × ")} cm)`,
    `${es ? "Fallos de la colocación actual" : "Erros do posicionamento atual"}: ${now.length ? now.join(" | ") : es ? "ninguno" : "nenhum"}`,
  ];
  if (shot)
    lines.push(
      `${es ? "Fallos del último disparo" : "Erros do último disparo"}: ${shot.length ? shot.join(" | ") : es ? "ninguno" : "nenhum"}`,
    );
  return lines.join("\n");
}

/** Ayuda: la guía paso a paso (sin IA, se marca sola) y preguntas a la IA sobre su colocación. */
function Help(props: {
  inc: Incidence;
  lang: Lang;
  checks: Record<string, boolean>;
  showHint: boolean;
  onShowHint: () => void;
  context: () => string;
}) {
  const { inc, lang, checks } = props;
  const tx = TEXT[lang];
  const [tab, setTab] = useState<"guide" | "ask">("guide");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // Al cambiar de proyección, la conversación empieza de cero.
  const [chatFor, setChatFor] = useState(inc.id);
  if (chatFor !== inc.id) {
    setChatFor(inc.id);
    setChat([]);
  }

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const history = chat.slice(-6);
    setChat((c) => [...c, { role: "user", text }]);
    setQuestion("");
    setBusy(true);
    try {
      const { answer } = await api.post<{ answer: string }>("/positioning/ask", {
        question: text,
        context: props.context(),
        history,
      });
      setChat((c) => [...c, { role: "assistant", text: answer }]);
    } catch (err) {
      setChat((c) => [...c, { role: "assistant", text: errorMessage(err) }]);
    } finally {
      setBusy(false);
    }
  };

  const prepOk = inc.prep.every((p) => checks[`prep:${p.id}`]);
  const steps: { ok: boolean; title: string; body?: string; extra?: React.ReactNode }[] = [
    {
      ok: prepOk,
      title: tx.steps.prep,
      body: inc.technique[0].value[lang] + ". " + inc.prep.map((p) => p.label[lang]).join(" · "),
    },
    { ok: checks.rot, title: tx.steps.rot(inc.target), body: inc.criteria.find((c) => c.key === "rot")?.text[lang] },
    {
      ok: checks.center,
      title: tx.steps.center,
      body: inc.landmark[lang],
      extra: (
        <button className="btn-ghost mt-1 min-h-9 px-3 text-sm" onClick={props.onShowHint}>
          {props.showHint ? tx.hideMe : tx.showMe}
        </button>
      ),
    },
    { ok: checks.coll, title: tx.steps.coll, body: inc.criteria.find((c) => c.key === "coll")?.text[lang] },
  ];

  return (
    <div className="card p-4">
      <div className="bg-surface-2 mb-4 flex w-max gap-1 rounded-xl p-1" role="tablist">
        {(["guide", "ask"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold ${
              tab === t ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            {t === "guide" ? <ListChecks size={18} aria-hidden="true" /> : <Question size={18} aria-hidden="true" />}
            {t === "guide" ? tx.guideTab : tx.askTab}
          </button>
        ))}
      </div>

      {tab === "guide" ? (
        <ol className="space-y-3">
          {steps.map((st, i) => (
            <li key={st.title} className="flex gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  st.ok ? "bg-success-soft text-success" : "bg-surface-2 text-muted"
                }`}
              >
                {st.ok ? <Check size={16} weight="bold" aria-label="✓" /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className="font-semibold">{st.title}</div>
                {st.body && <div className="text-muted text-sm">{st.body}</div>}
                {st.extra}
              </div>
            </li>
          ))}
          <li className="flex gap-3">
            <span className="bg-surface-2 text-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
              5
            </span>
            <div className="font-semibold">{tx.steps.fire}</div>
          </li>
        </ol>
      ) : (
        <div>
          {chat.length === 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {tx.suggestions.map((q) => (
                <button
                  key={q}
                  className="bg-surface-2 text-text rounded-full px-3 py-1.5 text-left text-sm"
                  onClick={() => ask(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {chat.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-accent text-accent-contrast ml-8" : "bg-surface-2 mr-4"
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && <Spinner label={tx.thinking} />}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <input
              className="input min-w-0 flex-1"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={tx.askPlaceholder}
              maxLength={500}
            />
            <button className="btn-primary px-3" disabled={busy || !question.trim()} aria-label={tx.send}>
              <PaperPlaneRight size={18} aria-hidden="true" />
            </button>
          </form>
          <p className="text-muted mt-2 text-xs">{tx.aiNote}</p>
        </div>
      )}
    </div>
  );
}

function Slider(props: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{props.label}</span>
        <span className="text-accent font-mono text-lg font-bold">{props.value}</span>
      </span>
      <input
        type="range"
        className="slider mt-1"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.current}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}
