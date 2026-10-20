"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";

/**
 * Espectro electromagnético (de las ondas de radio a los rayos gamma) y ley del inverso del cuadrado.
 * Todo es cálculo en el dispositivo: no usa IA ni el servidor.
 */

type Band = "radio" | "micro" | "ir" | "visible" | "uv" | "x" | "gamma";

// Límites aproximados de cada banda (longitud de onda en metros, de mayor a menor).
const BANDS: { id: Band; min: number }[] = [
  { id: "radio", min: 1e-1 },
  { id: "micro", min: 1e-3 },
  { id: "ir", min: 7e-7 },
  { id: "visible", min: 4e-7 },
  { id: "uv", min: 1e-8 },
  { id: "x", min: 1e-11 },
  { id: "gamma", min: 0 },
];

const LOG_MAX = 3; // 1 km
const LOG_MIN = -13; // 0,1 pm
const IONIZING_EV = 10; // a partir de ~10 eV la radiación arranca electrones

const TEXT = {
  es: {
    bands: {
      radio: "Ondas de radio",
      micro: "Microondas",
      ir: "Infrarrojo",
      visible: "Luz visible",
      uv: "Ultravioleta",
      x: "Rayos X",
      gamma: "Rayos gamma",
    } as Record<Band, string>,
    uses: {
      radio:
        "Resonancia magnética (RM): usa ondas de radio (de 10 a 130 MHz) junto a un imán muy potente. No ioniza, por eso la RM no da dosis de radiación.",
      micro: "Diatermia y ablación de tumores por microondas. Es la misma radiación que la de los hornos y el wifi.",
      ir: "Termografía y termómetros sin contacto. La notamos como calor.",
      visible: "La luz que vemos: endoscopia, láser en cirugía y oftalmología.",
      uv: "Fototerapia (psoriasis, ictericia del recién nacido) y esterilización. En exceso produce quemaduras y cáncer de piel. El UV más energético ya es ionizante.",
      x: "Radiografía, TC, mamografía y fluoroscopia (de 20 a 150 keV). Se producen en el tubo de rayos X al frenar electrones (radiación de frenado) y por radiación característica.",
      gamma:
        "Medicina nuclear (gammagrafía, SPECT, PET con fotones de 511 keV) y radioterapia (cobalto-60, braquiterapia). Salen del núcleo de átomos radiactivos.",
    } as Record<Band, string>,
    wavelength: "Longitud de onda",
    frequency: "Frecuencia",
    energy: "Energía del fotón",
    ionizing: "Ionizante",
    nonIonizing: "No ionizante",
    ionizingHelp: "Tiene energía para arrancar electrones de los átomos y dañar el ADN.",
    nonIonizingHelp: "No tiene energía para arrancar electrones: solo calienta o excita.",
    medical: "En medicina",
    drag: "Arrastra para recorrer el espectro",
    longer: "← más longitud de onda, menos energía",
    shorter: "más energía →",
    formula: "E = h · f = h · c / λ  →  a menor longitud de onda, más frecuencia y más energía.",
    xNote: "Los rayos X y gamma se solapan en energía: se distinguen por su origen (X: electrones; gamma: núcleo).",
    lawTitle: "Ley del inverso del cuadrado",
    lawText:
      "La radiación se reparte en un área cada vez mayor al alejarse de la fuente: al doble de distancia, el mismo haz cubre 4 veces más área, así que la intensidad es 4 veces menor.",
    distance: "Distancia a la fuente",
    intensity: "Intensidad",
    doseRate: (x: string) => `Si a 1 m se miden 100 µSv/h, aquí se reciben ${x} µSv/h`,
    times: (x: string) => `${x} veces menos que a 1 m`,
    timesMore: (x: string) => `${x} veces más que a 1 m`,
    protectionTitle: "Protección radiológica",
    protection: [
      ["⏱️ Tiempo", "Menos tiempo expuesto = menos dosis."],
      ["📏 Distancia", "Alejarse es lo más eficaz: la dosis baja con el cuadrado de la distancia."],
      ["🧱 Blindaje", "Plomo, hormigón o delantales plomados entre la fuente y la persona."],
    ],
  },
  pt: {
    bands: {
      radio: "Ondas de rádio",
      micro: "Micro-ondas",
      ir: "Infravermelho",
      visible: "Luz visível",
      uv: "Ultravioleta",
      x: "Raios X",
      gamma: "Raios gama",
    } as Record<Band, string>,
    uses: {
      radio:
        "Ressonância magnética (RM): usa ondas de rádio (de 10 a 130 MHz) com um íman muito potente. Não ioniza, por isso a RM não dá dose de radiação.",
      micro: "Diatermia e ablação de tumores por micro-ondas. É a mesma radiação dos fornos e do wi-fi.",
      ir: "Termografia e termómetros sem contacto. Sentimo-la como calor.",
      visible: "A luz que vemos: endoscopia, laser em cirurgia e oftalmologia.",
      uv: "Fototerapia (psoríase, icterícia do recém-nascido) e esterilização. Em excesso provoca queimaduras e cancro de pele. O UV mais energético já é ionizante.",
      x: "Radiografia, TC, mamografia e fluoroscopia (de 20 a 150 keV). Produzem-se na ampola de raios X ao travar eletrões (radiação de travagem) e por radiação característica.",
      gamma:
        "Medicina nuclear (cintigrafia, SPECT, PET com fotões de 511 keV) e radioterapia (cobalto-60, braquiterapia). Saem do núcleo de átomos radioativos.",
    } as Record<Band, string>,
    wavelength: "Comprimento de onda",
    frequency: "Frequência",
    energy: "Energia do fotão",
    ionizing: "Ionizante",
    nonIonizing: "Não ionizante",
    ionizingHelp: "Tem energia para arrancar eletrões dos átomos e danificar o ADN.",
    nonIonizingHelp: "Não tem energia para arrancar eletrões: só aquece ou excita.",
    medical: "Em medicina",
    drag: "Arrasta para percorrer o espetro",
    longer: "← mais comprimento de onda, menos energia",
    shorter: "mais energia →",
    formula: "E = h · f = h · c / λ  →  quanto menor o comprimento de onda, mais frequência e mais energia.",
    xNote: "Os raios X e gama sobrepõem-se em energia: distinguem-se pela origem (X: eletrões; gama: núcleo).",
    lawTitle: "Lei do inverso do quadrado",
    lawText:
      "A radiação espalha-se por uma área cada vez maior ao afastar-se da fonte: ao dobro da distância, o mesmo feixe cobre 4 vezes mais área, por isso a intensidade é 4 vezes menor.",
    distance: "Distância à fonte",
    intensity: "Intensidade",
    doseRate: (x: string) => `Se a 1 m se medem 100 µSv/h, aqui recebem-se ${x} µSv/h`,
    times: (x: string) => `${x} vezes menos do que a 1 m`,
    timesMore: (x: string) => `${x} vezes mais do que a 1 m`,
    protectionTitle: "Proteção radiológica",
    protection: [
      ["⏱️ Tempo", "Menos tempo exposto = menos dose."],
      ["📏 Distância", "Afastar-se é o mais eficaz: a dose baixa com o quadrado da distância."],
      ["🧱 Blindagem", "Chumbo, betão ou aventais de chumbo entre a fonte e a pessoa."],
    ],
  },
};

/** Número con prefijo del SI (1,2 nm; 3 GHz; 50 keV…). */
function si(value: number, unit: string) {
  const prefixes: [number, string][] = [
    [1e18, "E"],
    [1e15, "P"],
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-2, "c"],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
    [1e-15, "f"],
  ];
  const allowed =
    unit === "m"
      ? prefixes.filter(([, p]) => p !== "E" && p !== "P" && p !== "T" && p !== "G" && p !== "M")
      : prefixes.filter(([, p]) => p !== "c");
  const [f, p] = allowed.find(([f]) => Math.abs(value) >= f) ?? allowed[allowed.length - 1];
  const n = value / f;
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(digits).replace(".", ",")} ${p}${unit}`;
}

const bandOf = (lambda: number) => BANDS.find((b) => lambda >= b.min)!.id;

// Colores de la barra (de radio a gamma) y el arcoíris en la zona visible.
// (posiciones en % de la escala logarítmica: radio 0–25, microondas –37,5, IR –57,2, visible –58,8, UV –68,8, X –87,5, gamma)
const BAR =
  "linear-gradient(90deg,#4e3f6e 0%,#6b4f8a 25%,#86507f 37.5%,#b8423a 50%,#e3241d 57.1%,#ff8a00 57.6%,#f2e600 57.9%,#2bc94a 58.2%,#1e7bff 58.5%,#7a28ff 58.8%,#5b37d0 63%,#3c4bb8 68.8%,#1f6f8b 80%,#128070 87.5%,#0b5d45 100%)";

export default function SpectrumTool() {
  const lang = useLang();
  const tx = TEXT[lang];
  const [pos, setPos] = useState(() => bandCenter("x")); // 0–100 (0 = radio, 100 = gamma); empieza en los rayos X
  const [dist, setDist] = useState(1);

  const logL = LOG_MAX - (pos / 100) * (LOG_MAX - LOG_MIN);
  const lambda = Math.pow(10, logL);
  const freq = 3e8 / lambda;
  const ev = 1.24e-6 / lambda;
  const band = bandOf(lambda);
  const ionizing = ev >= IONIZING_EV;
  const ionPos = ((LOG_MAX - Math.log10(1.24e-6 / IONIZING_EV)) / (LOG_MAX - LOG_MIN)) * 100;

  // Onda dibujada: más ciclos cuanto más corta es la longitud de onda.
  const cycles = 1 + (pos / 100) * 22;
  const wave = Array.from({ length: 241 }, (_, i) => {
    const x = (i / 240) * 600;
    const y = 40 - 28 * Math.sin((i / 240) * cycles * 2 * Math.PI);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  const rel = 1 / (dist * dist);
  const fmt = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2)).replace(".", ",");

  return (
    <div className="space-y-8">
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-extrabold">{tx.bands[band]}</h2>
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ${ionizing ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}
          >
            {ionizing ? `☢️ ${tx.ionizing}` : tx.nonIonizing}
          </span>
        </div>

        <svg
          viewBox="0 0 600 80"
          className="text-accent mt-4 h-20 w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={wave} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="relative mt-4">
          <div className="h-10 rounded-xl shadow-inner" style={{ background: BAR }} aria-hidden="true" />
          <div
            className="absolute -top-1 h-12 w-1 rounded-full bg-white shadow"
            style={{ left: `${ionPos}%` }}
            aria-hidden="true"
            title={tx.ionizing}
          />
          <input
            type="range"
            className="slider absolute inset-0 h-10 opacity-0"
            min={0}
            max={100}
            step={0.25}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label={tx.drag}
          />
          <div
            className="border-text pointer-events-none absolute -top-2 h-14 w-5 -translate-x-1/2 rounded-lg border-4 bg-white/30 shadow-lg"
            style={{ left: `${pos}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="text-muted mt-2 flex justify-between gap-2 text-xs">
          <span>{tx.longer}</span>
          <span>{tx.shorter}</span>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {BANDS.map((b) => (
            <button
              key={b.id}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${
                band === b.id ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
              }`}
              onClick={() => setPos(bandCenter(b.id))}
            >
              {tx.bands[b.id]}
            </button>
          ))}
        </div>
        <p className="text-muted mt-2 text-center text-sm">{tx.drag}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label={tx.wavelength} value={si(lambda, "m")} />
          <Stat label={tx.frequency} value={si(freq, "Hz")} />
          <Stat label={tx.energy} value={si(ev, "eV")} />
        </div>

        <div className="bg-surface-2 mt-5 rounded-2xl p-4">
          <div className="text-muted text-xs font-semibold tracking-wide uppercase">{tx.medical}</div>
          <p className="mt-1">{tx.uses[band]}</p>
          <p className="text-muted mt-2 text-sm">{ionizing ? tx.ionizingHelp : tx.nonIonizingHelp}</p>
          {(band === "x" || band === "gamma") && <p className="text-muted mt-1 text-sm">{tx.xNote}</p>}
        </div>
        <p className="text-muted mt-4 font-mono text-sm">{tx.formula}</p>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-bold">{tx.lawTitle}</h2>
        <p className="text-muted mt-2">{tx.lawText}</p>

        <InverseSquare dist={dist} />

        <label className="mt-4 block">
          <span className="flex items-baseline justify-between">
            <span className="font-semibold">{tx.distance}</span>
            <span className="text-accent font-mono text-lg font-bold">{fmt(dist)} m</span>
          </span>
          <input
            type="range"
            className="slider"
            min={0.5}
            max={4}
            step={0.5}
            value={dist}
            onChange={(e) => setDist(Number(e.target.value))}
          />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat label={tx.intensity} value={`I = I₀ / ${fmt(dist)}² = ${fmt(rel * 100)} %`} />
          <Stat label="1 m → d" value={rel < 1 ? tx.times(fmt(1 / rel)) : rel > 1 ? tx.timesMore(fmt(rel)) : "="} />
        </div>
        <p className="text-muted mt-3 text-sm">{tx.doseRate(fmt(100 * rel))}</p>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-bold">{tx.protectionTitle}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {tx.protection.map(([title, text]) => (
            <div key={title} className="bg-surface-2 rounded-2xl p-4">
              <div className="font-bold">{title}</div>
              <p className="text-muted mt-1 text-sm">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function bandCenter(id: Band) {
  const i = BANDS.findIndex((b) => b.id === id);
  const hi = i === 0 ? Math.pow(10, LOG_MAX) : BANDS[i - 1].min;
  const lo = BANDS[i].min || Math.pow(10, LOG_MIN);
  const mid = (Math.log10(hi) + Math.log10(lo)) / 2;
  return ((LOG_MAX - mid) / (LOG_MAX - LOG_MIN)) * 100;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-2xl p-3">
      <div className="text-muted text-xs font-semibold tracking-wide uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-bold">{value}</div>
    </div>
  );
}

/** Fuente puntual y el mismo haz atravesando un cuadrado a 1 m y otro a la distancia elegida. */
function InverseSquare({ dist }: { dist: number }) {
  const unit = 60; // px por metro
  const x = 40 + dist * unit;
  const half = 12 * dist; // el lado del cuadrado crece con la distancia
  const cells = Math.round(dist * 2) / 2;
  return (
    <svg viewBox="0 0 320 130" className="text-muted mt-4 w-full" aria-hidden="true">
      <path d={`M40 65 L${x} ${65 - half} L${x} ${65 + half} Z`} className="fill-amber" opacity="0.25" />
      <circle cx={40} cy={65} r={9} className="fill-danger" />
      <text x={40} y={92} textAnchor="middle" fontSize="11" fill="currentColor">
        ☢
      </text>
      <rect x={40 + unit - 2} y={65 - 12} width={4} height={24} className="fill-teal" />
      <text x={40 + unit} y={40} textAnchor="middle" fontSize="10" fill="currentColor">
        1 m
      </text>
      <rect x={x - 3} y={65 - half} width={6} height={half * 2} rx={1} className="fill-accent" />
      {Array.from({ length: Math.max(0, Math.round(cells * 2) - 1) }, (_, i) => (
        <line
          key={i}
          x1={x - 3}
          x2={x + 3}
          y1={65 - half + ((i + 1) * half * 2) / Math.round(cells * 2)}
          y2={65 - half + ((i + 1) * half * 2) / Math.round(cells * 2)}
          stroke="white"
        />
      ))}
      <text x={x} y={65 + half + 14} textAnchor="middle" fontSize="10" fill="currentColor">
        {String(dist).replace(".", ",")} m
      </text>
    </svg>
  );
}
