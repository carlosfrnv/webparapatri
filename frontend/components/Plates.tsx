"use client";

import { ArrowCounterClockwise, Check, Eye, EyeSlash, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { parsePart, sideLabel, translate } from "@/lib/atlas/names";
import { useLang } from "@/lib/i18n";

/**
 * Láminas de anatomía ya hechas, sacadas del atlas 3D (scripts/laminas): el dibujo con una raya a cada
 * estructura y su nombre. Se pueden ver con los nombres, practicar tapándolos (como con la mano en un
 * libro) o hacer un examen. Sin IA.
 */

type Lang = "es" | "pt";
type Mode = "view" | "practice" | "exam";
type L = Record<Lang, string>;

interface PlateMeta {
  w: number;
  h: number;
  parts: { name: string; x: number; y: number; area: number }[];
}

const PLATES: { id: string; group: "bones" | "organs" | "muscles"; title: L }[] = [
  { id: "esqueleto", group: "bones", title: { es: "Esqueleto (vista anterior)", pt: "Esqueleto (vista anterior)" } },
  { id: "craneo-frontal", group: "bones", title: { es: "Cráneo (vista frontal)", pt: "Crânio (vista frontal)" } },
  { id: "craneo-lateral", group: "bones", title: { es: "Cráneo (vista lateral)", pt: "Crânio (vista lateral)" } },
  { id: "columna", group: "bones", title: { es: "Columna vertebral", pt: "Coluna vertebral" } },
  { id: "mano", group: "bones", title: { es: "Huesos de la mano", pt: "Ossos da mão" } },
  { id: "pie", group: "bones", title: { es: "Huesos del pie", pt: "Ossos do pé" } },
  { id: "corazon", group: "organs", title: { es: "Corazón y grandes vasos", pt: "Coração e grandes vasos" } },
  { id: "pulmones", group: "organs", title: { es: "Pulmones y vía aérea", pt: "Pulmões e via aérea" } },
  { id: "abdomen", group: "organs", title: { es: "Órganos abdominales", pt: "Órgãos abdominais" } },
  { id: "musculos-brazo", group: "muscles", title: { es: "Músculos del brazo", pt: "Músculos do braço" } },
  { id: "musculos-pierna", group: "muscles", title: { es: "Músculos de la pierna", pt: "Músculos da perna" } },
];

const TEXT = {
  es: {
    groups: { bones: "Huesos", organs: "Órganos", muscles: "Músculos" },
    modes: { view: "Ver nombres", practice: "Practicar", exam: "Examen" },
    practiceHint: "Los nombres están tapados: toca un recuadro para destaparlo.",
    showAll: "Destapar todo",
    hideAll: "Tapar todo",
    revealed: (n: number, t: number) => `${n} de ${t} destapados`,
    question: "¿Qué estructura señala el recuadro «?»",
    next: "Siguiente",
    score: (ok: number, n: number) => `${ok} de ${n}`,
    finished: (ok: number, n: number) => `Has acertado ${ok} de ${n}`,
    again: "Repetir",
    loading: "Cargando la lámina…",
    loadError: "No se ha podido cargar la lámina. Comprueba la conexión.",
    credits: "Láminas generadas a partir de Z-Anatomy (CC BY-SA 4.0), basado en BodyParts3D © DBCLS.",
  },
  pt: {
    groups: { bones: "Ossos", organs: "Órgãos", muscles: "Músculos" },
    modes: { view: "Ver nomes", practice: "Praticar", exam: "Exame" },
    practiceHint: "Os nomes estão tapados: toca num retângulo para o destapar.",
    showAll: "Destapar tudo",
    hideAll: "Tapar tudo",
    revealed: (n: number, t: number) => `${n} de ${t} destapados`,
    question: "Que estrutura indica o retângulo «?»",
    next: "Seguinte",
    score: (ok: number, n: number) => `${ok} de ${n}`,
    finished: (ok: number, n: number) => `Acertaste ${ok} de ${n}`,
    again: "Repetir",
    loading: "A carregar a lâmina…",
    loadError: "Não foi possível carregar a lâmina. Verifica a ligação.",
    credits: "Lâminas geradas a partir do Z-Anatomy (CC BY-SA 4.0), baseado no BodyParts3D © DBCLS.",
  },
};

let metaPromise: Promise<Record<string, PlateMeta>> | null = null;
function loadMeta() {
  metaPromise ??= fetch("/laminas/laminas.json").then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  metaPromise.catch(() => (metaPromise = null));
  return metaPromise;
}

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

interface Label {
  i: number;
  name: string;
  x: number; // punto en la imagen (px de la lámina)
  y: number;
  side: "left" | "right";
  top: number; // posición del recuadro (px de pantalla)
}

const ROW = 26; // alto de cada nombre en pantalla

/** Reparte los nombres a izquierda y derecha sin que se monten. */
function layout(meta: PlateMeta, names: string[], scale: number, height: number): Label[] {
  const pts = meta.parts.map((p, i) => ({ i, name: names[i], x: p.x, y: p.y }));
  const mid = meta.w / 2;
  const left = pts.filter((p) => p.x < mid);
  const right = pts.filter((p) => p.x >= mid);
  // Equilibrar: si un lado tiene muchos más, pasan al otro los más cercanos al centro.
  while (Math.abs(left.length - right.length) > 1) {
    const [from, to] = left.length > right.length ? [left, right] : [right, left];
    from.sort((a, b) => Math.abs(b.x - mid) - Math.abs(a.x - mid));
    to.push(from.pop()!);
  }
  const place = (list: typeof pts, side: Label["side"]) => {
    const sorted = [...list].sort((a, b) => a.y - b.y);
    const tops = sorted.map((p) => p.y * scale - ROW / 2);
    for (let k = 1; k < tops.length; k++) tops[k] = Math.max(tops[k], tops[k - 1] + ROW);
    const over = (tops.at(-1) ?? 0) + ROW - height;
    if (over > 0)
      for (let k = tops.length - 1; k >= 0; k--) tops[k] = Math.min(tops[k], height - ROW * (tops.length - k));
    for (let k = 0; k < tops.length; k++) tops[k] = Math.max(tops[k], k * ROW);
    return sorted.map((p, k) => ({ ...p, side, top: tops[k] }));
  };
  return [...place(left, "left"), ...place(right, "right")];
}

export default function Plates() {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const [plateId, setPlateId] = useState(PLATES[0].id);
  const [all, setAll] = useState<Record<string, PlateMeta> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMeta()
      .then(setAll)
      .catch(() => setError(tx.loadError));
  }, [tx.loadError]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [all]);

  const meta = all?.[plateId] ?? null;
  const plate = PLATES.find((p) => p.id === plateId)!;

  // Nombres en su idioma; el lado solo si en la lámina están los dos (p. ej. parietal derecho e izquierdo).
  const names = useMemo(() => {
    if (!meta) return [];
    const parsed = meta.parts.map((p) => parsePart(p.name, "bones"));
    return parsed.map((p) => {
      const both = parsed.some((q) => q.en === p.en && q.side && q.side !== p.side);
      const side = both ? sideLabel(p.side, lang) : "";
      const name = translate(p.en, lang);
      return side ? `${name} (${side})` : name;
    });
  }, [meta, lang]);

  // ---------- Examen ----------
  const [order, setOrder] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const startExam = useCallback(() => {
    if (!meta) return;
    setOrder(shuffle(meta.parts.map((_, i) => i)));
    setStep(0);
    setAnswer(null);
    setScore(0);
  }, [meta]);
  const target = mode === "exam" ? order[step] : undefined;
  const options = useMemo(() => {
    if (target === undefined || !names.length) return [];
    const others = shuffle(names.map((_, i) => i).filter((i) => i !== target && names[i] !== names[target]));
    return shuffle([target, ...others.slice(0, 3)]);
  }, [target, names]);

  const pickPlate = (id: string) => {
    setPlateId(id);
    setOpen(new Set());
    setFocus(null);
    setOrder([]);
    if (mode === "exam") setMode("view");
  };

  const choose = (mode: Mode) => {
    setMode(mode);
    setOpen(new Set());
    setFocus(null);
    if (mode === "exam") startExam();
  };

  if (error) return <ErrorBox message={error} />;

  // Medidas en pantalla: lámina en el centro y nombres a los lados (en pantallas estrechas, con números).
  const narrow = width > 0 && width < 640;
  const colW = narrow ? 0 : Math.max(150, Math.min(240, width * 0.27));
  const maxImgH = typeof window !== "undefined" ? window.innerHeight * 0.8 : 700;
  const imgW = meta ? Math.min(width - 2 * colW - 16, (maxImgH * meta.w) / meta.h) : 0;
  const scale = meta ? imgW / meta.w : 1;
  const imgH = meta ? meta.h * scale : 0;
  const imgLeft = narrow ? (width - imgW) / 2 : colW + 8 + (width - 2 * colW - 16 - imgW) / 2;
  const labels = meta && !narrow && width ? layout(meta, names, scale, imgH) : [];
  const sorted = meta ? meta.parts.map((p, i) => ({ i, y: p.y, x: p.x })).sort((a, b) => a.y - b.y || a.x - b.x) : [];
  const number = new Map(sorted.map((p, k) => [p.i, k + 1]));

  const isShown = (i: number) => {
    if (mode === "view") return true;
    if (mode === "practice") return open.has(i);
    return answer !== null && i === target;
  };
  const toggle = (i: number) => {
    setFocus(i);
    if (mode !== "practice") return;
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const labelBox = (i: number, compact = false) => {
    const shown = isShown(i);
    const isTarget = i === target;
    const hiddenStyle = isTarget
      ? "bg-accent text-accent-contrast border-accent"
      : "bg-pink-100 border-pink-300 text-transparent dark:bg-pink-950/60 dark:border-pink-800";
    return (
      <button
        type="button"
        onClick={() => toggle(i)}
        onMouseEnter={() => setFocus(i)}
        className={`block w-full rounded-md border px-2 text-left text-[0.8rem] leading-[22px] font-medium ${
          compact && shown ? "min-h-[24px]" : "h-[24px] truncate"
        } ${shown ? `${focus === i ? "border-accent bg-accent/10" : "border-transparent"} text-text` : hiddenStyle}`}
        title={shown ? names[i] : undefined}
      >
        {shown ? names[i] : isTarget ? "?" : names[i]}
      </button>
    );
  };

  const done = mode === "exam" && step >= order.length && order.length > 0;

  return (
    <div className="space-y-4">
      <select
        className="input sm:hidden"
        value={plateId}
        aria-label={plate.title[lang]}
        onChange={(e) => pickPlate(e.target.value)}
      >
        {(["bones", "organs", "muscles"] as const).map((g) => (
          <optgroup key={g} label={tx.groups[g]}>
            {PLATES.filter((p) => p.group === g).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title[lang]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="hidden space-y-2 sm:block">
        {(["bones", "organs", "muscles"] as const).map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-2">
            <span className="text-muted w-20 text-xs font-bold tracking-wider uppercase">{tx.groups[g]}</span>
            {PLATES.filter((p) => p.group === g).map((p) => (
              <button
                key={p.id}
                onClick={() => pickPlate(p.id)}
                className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
                  plateId === p.id ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
                }`}
              >
                {p.title[lang]}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-surface-2 flex gap-1 rounded-xl p-1" role="tablist">
          {(["view", "practice", "exam"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => choose(m)}
              className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${
                mode === m ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {tx.modes[m]}
            </button>
          ))}
        </div>
        {mode === "practice" && meta && (
          <>
            <button className="btn-ghost min-h-10" onClick={() => setOpen(new Set(meta.parts.map((_, i) => i)))}>
              <Eye size={18} aria-hidden="true" /> {tx.showAll}
            </button>
            <button className="btn-ghost min-h-10" onClick={() => setOpen(new Set())}>
              <EyeSlash size={18} aria-hidden="true" /> {tx.hideAll}
            </button>
            <span className="text-muted text-sm">{tx.revealed(open.size, meta.parts.length)}</span>
          </>
        )}
        {mode === "exam" && meta && !done && (
          <span className="text-muted text-sm font-semibold">
            {step + 1} / {order.length} · {tx.score(score, step + (answer !== null ? 1 : 0))}
          </span>
        )}
      </div>
      {mode === "practice" && <p className="text-muted text-sm">{tx.practiceHint}</p>}

      <h2 className="text-lg font-bold">{plate.title[lang]}</h2>

      <div ref={box} className="card relative overflow-hidden p-0">
        {!meta ? (
          <div className="flex h-96 items-center justify-center">
            <Spinner label={tx.loading} />
          </div>
        ) : (
          width > 0 && (
            <div className="relative" style={{ height: Math.max(imgH, labels.length ? 0 : imgH) + 24 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- lámina estática (PNG con transparencia) */}
              <img
                src={`/laminas/${plateId}.png`}
                alt={plate.title[lang]}
                className="absolute bg-white"
                style={{ left: imgLeft, top: 12, width: imgW, height: imgH }}
                draggable={false}
              />
              <svg className="pointer-events-none absolute inset-0" width={width} height={imgH + 24}>
                {meta.parts.map((p, i) => {
                  const ax = imgLeft + p.x * scale;
                  const ay = 12 + p.y * scale;
                  const hot = focus === i || i === target;
                  const lab = labels.find((l) => l.i === i);
                  return (
                    <g key={i}>
                      {lab && (
                        <line
                          x1={lab.side === "left" ? colW : width - colW}
                          y1={12 + lab.top + ROW / 2 - 2}
                          x2={ax}
                          y2={ay}
                          stroke={hot ? "var(--accent)" : "#555"}
                          strokeWidth={hot ? 2 : 1}
                          opacity={hot ? 1 : 0.7}
                        />
                      )}
                      <circle
                        cx={ax}
                        cy={ay}
                        r={hot ? 5 : 3}
                        fill={hot ? "var(--accent)" : "#333"}
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                    </g>
                  );
                })}
              </svg>
              {narrow &&
                meta.parts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    className={`absolute flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1 text-[0.65rem] font-bold text-white shadow ${
                      focus === i || i === target ? "bg-accent" : "bg-gray-700"
                    }`}
                    style={{ left: imgLeft + p.x * scale, top: 12 + p.y * scale }}
                  >
                    {i === target ? "?" : number.get(i)}
                  </button>
                ))}
              {labels.map((l) => (
                <div
                  key={l.i}
                  className="absolute"
                  style={{
                    top: 12 + l.top,
                    width: colW - 8,
                    ...(l.side === "left" ? { left: 4 } : { right: 4 }),
                  }}
                >
                  {labelBox(l.i)}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* En pantallas estrechas, los nombres van en una lista numerada debajo. */}
      {meta && narrow && mode !== "exam" && (
        <ol className="card grid grid-cols-1 gap-1 p-3">
          {sorted.map((p, k) => (
            <li key={p.i} className="flex items-center gap-2">
              <span className="text-muted w-6 shrink-0 text-right text-xs font-bold">{k + 1}</span>
              {labelBox(p.i, true)}
            </li>
          ))}
        </ol>
      )}

      {mode === "exam" && meta && (
        <div className="card space-y-3 p-4">
          {done ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-bold">{tx.finished(score, order.length)}</div>
              <button className="btn-primary" onClick={startExam}>
                <ArrowCounterClockwise size={18} aria-hidden="true" /> {tx.again}
              </button>
            </div>
          ) : (
            <>
              <div className="font-semibold">{tx.question}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((o) => {
                  const right = answer !== null && o === target;
                  const wrong = answer === o && o !== target;
                  return (
                    <button
                      key={o}
                      disabled={answer !== null}
                      onClick={() => {
                        setAnswer(o);
                        if (o === target) setScore((s) => s + 1);
                      }}
                      className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm font-medium ${
                        right
                          ? "border-success bg-success-soft text-success"
                          : wrong
                            ? "border-danger bg-danger-soft text-danger"
                            : "border-border bg-surface hover:border-accent"
                      }`}
                    >
                      {names[o]}
                      {right && <Check size={18} weight="bold" aria-hidden="true" />}
                      {wrong && <X size={18} weight="bold" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              {answer !== null && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setStep((s) => s + 1);
                    setAnswer(null);
                  }}
                >
                  {tx.next}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-muted text-center text-[0.7rem]">{tx.credits}</p>
    </div>
  );
}
