"use client";

import { ArrowCounterClockwise, Lightbulb } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { ErrorBox, Spinner } from "@/components/ui";
import {
  IDEAL,
  idealContrastOf,
  loadPhantom,
  type Phantom,
  type PhantomId,
  PHANTOMS,
  type Settings,
  simulate,
  verdict,
  type Verdict,
} from "@/lib/xray";

/**
 * Simulador de rayos X: mueve kV, mAs y distancia y ve cómo cambia la radiografía, el contraste,
 * el ruido y la dosis. Todo se calcula en el dispositivo (no usa IA ni el servidor).
 */

const TEXT = {
  es: {
    exams: { mano: "Mano", rodilla: "Rodilla", torax: "Tórax", pelvis: "Pelvis" } as Record<PhantomId, string>,
    kv: "Tensión (kV)",
    kvHelp: "Energía de los rayos: más kV = más penetración y menos contraste.",
    mas: "Carga (mAs)",
    masHelp: "Cantidad de rayos: más mAs = imagen más oscura, menos ruido y más dosis.",
    dist: "Distancia foco-detector",
    distHelp: "Ley del inverso del cuadrado: el doble de distancia = 4 veces menos radiación.",
    grid: "Rejilla antidifusora",
    gridHelp:
      "Quita la radiación dispersa (que vela la imagen) en las zonas gruesas, pero absorbe parte del haz: hay que subir los mAs.",
    scatter: "Radiación dispersa",
    loading: "Preparando la radiografía…",
    loadError: "No se ha podido cargar la imagen. Comprueba la conexión.",
    marker: "D",
    credits: "Anatomía calculada a partir de Z-Anatomy (CC BY-SA 4.0), basado en BodyParts3D © DBCLS.",
    brightness: "Exposición",
    contrast: "Contraste",
    noise: "Ruido",
    dose: "Dosis al paciente",
    ideal: "Valores recomendados",
    reset: "Empezar de nuevo",
    tube: "Tubo",
    detector: "Detector",
    verdicts: {
      under: [
        "Subexpuesta",
        "Llega poca radiación: la imagen sale blanca y con grano. Sube los mAs (o un poco los kV).",
      ],
      over: [
        "Sobreexpuesta",
        "Llega demasiada radiación: la imagen sale negra y se pierden detalles. Baja los mAs o los kV.",
      ],
      noisy: ["Mucho ruido", "Hay pocos fotones y la imagen sale con grano (ruido cuántico). Sube los mAs."],
      lowContrast: [
        "Poco contraste",
        "Con tantos kV el hueso y el tejido blando se parecen demasiado. Baja los kV y compensa con mAs.",
      ],
      scatter: [
        "Imagen velada",
        "En una zona tan gruesa se produce mucha radiación dispersa que vela la imagen y le quita contraste. Pon la rejilla antidifusora (y sube los mAs).",
      ],
      highDose: [
        "Demasiada dosis",
        "La imagen se ve bien, pero con mucha más radiación de la necesaria. Baja los mAs: principio ALARA.",
      ],
      good: ["¡Buena imagen!", "Bien expuesta, con buen contraste y una dosis razonable."],
    } as Record<Verdict, [string, string]>,
    tipsTitle: "Para el examen",
    tips: [
      "Regla del 15 %: subir los kV un 15 % equivale a doblar los mAs (misma exposición, menos contraste).",
      "Los mAs controlan la cantidad de fotones (densidad); los kV, su energía (contraste y penetración).",
      "Ley del inverso del cuadrado: I₁ / I₂ = d₂² / d₁². En tórax se usan 180 cm para reducir la magnificación.",
      "ALARA: tan baja como sea razonablemente posible. La mejor imagen no es la de más dosis.",
      "La rejilla se usa en zonas de más de unos 10 cm (tórax, pelvis, rodilla); en la mano no hace falta.",
    ],
    relative: (x: number) => `${x < 0.1 ? x.toFixed(2) : x.toFixed(1)}× la recomendada`,
  },
  pt: {
    exams: { mano: "Mão", rodilla: "Joelho", torax: "Tórax", pelvis: "Bacia" } as Record<PhantomId, string>,
    kv: "Tensão (kV)",
    kvHelp: "Energia dos raios: mais kV = mais penetração e menos contraste.",
    mas: "Carga (mAs)",
    masHelp: "Quantidade de raios: mais mAs = imagem mais escura, menos ruído e mais dose.",
    dist: "Distância foco-detetor",
    distHelp: "Lei do inverso do quadrado: o dobro da distância = 4 vezes menos radiação.",
    grid: "Grelha antidifusora",
    gridHelp:
      "Elimina a radiação dispersa (que vela a imagem) nas zonas espessas, mas absorve parte do feixe: é preciso subir os mAs.",
    scatter: "Radiação dispersa",
    loading: "A preparar a radiografia…",
    loadError: "Não foi possível carregar a imagem. Verifica a ligação.",
    marker: "D",
    credits: "Anatomia calculada a partir do Z-Anatomy (CC BY-SA 4.0), baseado no BodyParts3D © DBCLS.",
    brightness: "Exposição",
    contrast: "Contraste",
    noise: "Ruído",
    dose: "Dose no doente",
    ideal: "Valores recomendados",
    reset: "Começar de novo",
    tube: "Ampola",
    detector: "Detetor",
    verdicts: {
      under: ["Subexposta", "Chega pouca radiação: a imagem fica branca e com grão. Sobe os mAs (ou um pouco os kV)."],
      over: ["Sobreexposta", "Chega radiação a mais: a imagem fica negra e perdem-se detalhes. Baixa os mAs ou os kV."],
      noisy: ["Muito ruído", "Há poucos fotões e a imagem fica com grão (ruído quântico). Sobe os mAs."],
      lowContrast: [
        "Pouco contraste",
        "Com tantos kV o osso e os tecidos moles ficam parecidos. Baixa os kV e compensa com mAs.",
      ],
      scatter: [
        "Imagem velada",
        "Numa zona tão espessa produz-se muita radiação dispersa que vela a imagem e lhe tira contraste. Põe a grelha antidifusora (e sobe os mAs).",
      ],
      highDose: [
        "Dose a mais",
        "A imagem está boa, mas com muito mais radiação do que o necessário. Baixa os mAs: princípio ALARA.",
      ],
      good: ["Boa imagem!", "Bem exposta, com bom contraste e uma dose razoável."],
    } as Record<Verdict, [string, string]>,
    tipsTitle: "Para o exame",
    tips: [
      "Regra dos 15 %: subir os kV 15 % equivale a duplicar os mAs (mesma exposição, menos contraste).",
      "Os mAs controlam a quantidade de fotões (densidade); os kV, a sua energia (contraste e penetração).",
      "Lei do inverso do quadrado: I₁ / I₂ = d₂² / d₁². No tórax usam-se 180 cm para reduzir a ampliação.",
      "ALARA: tão baixa quanto razoavelmente possível. A melhor imagem não é a de mais dose.",
      "A grelha usa-se em zonas com mais de cerca de 10 cm (tórax, bacia, joelho); na mão não é precisa.",
    ],
    relative: (x: number) => `${x < 0.1 ? x.toFixed(2) : x.toFixed(1)}× a recomendada`,
  },
};

// Al empezar (o cambiar de exploración) los valores se quedan cortos: hay que corregirlos.
const startOf = (id: PhantomId): Settings => {
  const ideal = IDEAL[id];
  return { ...ideal, kv: ideal.kv - 4, mas: Math.max(0.5, Math.round(ideal.mas * 0.15 * 10) / 10), grid: false };
};

// mAs en escala logarítmica (de 0,5 a 100) para que el deslizador sea cómodo.
const MAS_MIN = 0.5;
const MAS_MAX = 100;
const masToSlider = (m: number) => (Math.log(m / MAS_MIN) / Math.log(MAS_MAX / MAS_MIN)) * 100;
const sliderToMas = (v: number) => {
  const m = MAS_MIN * Math.pow(MAS_MAX / MAS_MIN, v / 100);
  return m < 10 ? Math.round(m * 10) / 10 : Math.round(m);
};

const TONE: Record<Verdict, string> = {
  good: "bg-success-soft text-success",
  under: "bg-warning-soft text-amber",
  over: "bg-danger-soft text-danger",
  noisy: "bg-warning-soft text-amber",
  lowContrast: "bg-warning-soft text-amber",
  scatter: "bg-warning-soft text-amber",
  highDose: "bg-danger-soft text-danger",
};

export default function XRaySim() {
  const lang = useLang();
  const tx = TEXT[lang];
  const [exam, setExam] = useState<PhantomId>("mano");
  const [s, setS] = useState<Settings>(() => startOf("mano"));
  const [phantom, setPhantom] = useState<{ id: PhantomId; p: Phantom } | null>(null);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);

  // La radiografía "base" de cada exploración (sale de la anatomía del atlas) se descarga al elegirla.
  useEffect(() => {
    let alive = true;
    loadPhantom(exam)
      .then((p) => alive && setPhantom({ id: exam, p }))
      .catch(() => alive && setError(tx.loadError));
    return () => {
      alive = false;
    };
  }, [exam, tx.loadError]);

  const ready = phantom?.id === exam ? phantom.p : null;
  const result = useMemo(() => (ready ? simulate(exam, ready, s) : null), [exam, ready, s]);
  const v = ready && result ? verdict(exam, ready, result, s) : "good";

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !result || !ready) return;
    const img = ctx.createImageData(ready.w, ready.h);
    const px = result.pixels;
    for (let i = 0; i < px.length; i++) {
      const g = px[i];
      img.data[i * 4] = g;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [result, ready]);

  const set = (patch: Partial<Settings>) => setS((old) => ({ ...old, ...patch }));
  const [title, explanation] = tx.verdicts[v];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup">
          {PHANTOMS.map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={exam === id}
              onClick={() => {
                setExam(id);
                setS(startOf(id));
              }}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                exam === id ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
              }`}
            >
              {tx.exams[id]}
            </button>
          ))}
        </div>
        <div className="relative mx-auto max-w-[360px] overflow-hidden rounded-2xl bg-black shadow-lg">
          {ready ? (
            <canvas
              ref={canvas}
              width={ready.w}
              height={ready.h}
              className="block w-full"
              style={{ aspectRatio: `${ready.w} / ${ready.h}` }}
              aria-label={tx.exams[exam]}
            />
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center">
              {error ? <ErrorBox message={error} /> : <Spinner label={tx.loading} />}
            </div>
          )}
          {ready && (
            <>
              <div className={`absolute top-3 left-3 rounded-full px-3 py-1 text-sm font-bold shadow ${TONE[v]}`}>
                {title}
              </div>
              {/* Marcador de plomo: lado derecho del paciente (a la izquierda de la imagen). */}
              <div className="absolute bottom-3 left-3 rounded-sm border border-white/80 px-1.5 font-mono text-sm font-bold text-white/90">
                {tx.marker}
              </div>
            </>
          )}
        </div>
        <p className="text-muted mx-auto mt-1 max-w-[360px] text-center text-[0.7rem]">{tx.credits}</p>
        <Setup dist={s.dist} tube={tx.tube} detector={tx.detector} />
      </div>

      <div className="space-y-5">
        <div className={`rounded-2xl p-4 ${TONE[v]}`} role="status">
          <div className="font-bold">{title}</div>
          <p className="text-text mt-1 text-sm">{explanation}</p>
        </div>

        <Slider
          label={tx.kv}
          help={tx.kvHelp}
          value={`${s.kv} kV`}
          min={40}
          max={150}
          step={1}
          current={s.kv}
          onChange={(x) => set({ kv: x })}
        />
        <Slider
          label={tx.mas}
          help={tx.masHelp}
          value={`${s.mas} mAs`}
          min={0}
          max={100}
          step={0.5}
          current={masToSlider(s.mas)}
          onChange={(x) => set({ mas: sliderToMas(x) })}
        />
        <Slider
          label={tx.dist}
          help={tx.distHelp}
          value={`${s.dist} cm`}
          min={90}
          max={200}
          step={5}
          current={s.dist}
          onChange={(x) => set({ dist: x })}
        />

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-[var(--accent)]"
            checked={s.grid}
            onChange={(e) => set({ grid: e.target.checked })}
          />
          <span>
            <span className="block font-semibold">{tx.grid}</span>
            <span className="text-muted block text-sm">{tx.gridHelp}</span>
          </span>
        </label>

        {result && ready && (
          <div className="card grid grid-cols-2 gap-4 p-4">
            <Meter label={tx.brightness} value={1 - result.brightness} good={[0.38, 0.76]} />
            <Meter
              label={tx.contrast}
              value={Math.min(1, result.contrast / idealContrastOf(exam, ready) / 1.6)}
              good={[0.37, 1]}
            />
            <Meter label={tx.noise} value={Math.min(1, result.noise / 0.12)} good={[0, 0.42]} />
            <Meter label={tx.scatter} value={result.scatter} good={[0, 0.38]} />
            <Meter
              label={tx.dose}
              value={Math.min(1, result.dose / 4)}
              good={[0, 0.62]}
              note={tx.relative(result.dose)}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setS(IDEAL[exam])}>
            <Lightbulb size={18} weight="duotone" aria-hidden="true" /> {tx.ideal}
          </button>
          <button className="btn-ghost" onClick={() => setS(startOf(exam))}>
            <ArrowCounterClockwise size={18} weight="duotone" aria-hidden="true" /> {tx.reset}
          </button>
        </div>

        <div className="card p-4">
          <h2 className="mb-2 font-bold">{tx.tipsTitle}</h2>
          <ul className="text-muted list-disc space-y-1.5 pl-5 text-sm">
            {tx.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Slider(props: {
  label: string;
  help: string;
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
      <span className="text-muted block text-sm">{props.help}</span>
    </label>
  );
}

function Meter({ label, value, good, note }: { label: string; value: number; good: [number, number]; note?: string }) {
  const ok = value >= good[0] && value <= good[1];
  return (
    <div>
      <div className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">{label}</div>
      <div className="bg-surface-2 relative h-2.5 overflow-hidden rounded-full">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${ok ? "bg-success" : "bg-danger"}`}
          style={{ width: `${Math.max(3, value * 100)}%` }}
        />
      </div>
      {note && <div className="text-muted mt-1 text-xs">{note}</div>}
    </div>
  );
}

/** Esquema del equipo: el tubo se aleja o acerca del paciente según la distancia. */
function Setup({ dist, tube, detector }: { dist: number; tube: string; detector: string }) {
  const x = 30 + ((200 - dist) / 110) * 120; // posición del tubo
  return (
    <svg viewBox="0 0 360 90" className="text-muted mx-auto mt-3 w-full max-w-[400px]" aria-hidden="true">
      <rect x={x - 22} y={28} width={36} height={30} rx={8} className="fill-accent" />
      <text x={x - 4} y={76} textAnchor="middle" fontSize="11" fill="currentColor">
        {tube}
      </text>
      <path d={`M${x + 14} 43 L278 18 L278 68 Z`} className="fill-amber" opacity="0.25" />
      <ellipse cx={250} cy={43} rx={14} ry={22} className="fill-pink" opacity="0.7" />
      <rect x={290} y={14} width={8} height={58} rx={2} className="fill-teal" />
      <text x={294} y={86} textAnchor="middle" fontSize="11" fill="currentColor">
        {detector}
      </text>
      <path d={`M${x} 10 L294 10`} stroke="currentColor" strokeDasharray="3 3" />
      <text x={(x + 294) / 2} y={8} textAnchor="middle" fontSize="11" fill="currentColor">
        {dist} cm
      </text>
    </svg>
  );
}
