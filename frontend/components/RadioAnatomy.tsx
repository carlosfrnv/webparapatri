"use client";

import { ArrowRight, Check, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { parsePart, sideLabel, translate } from "@/lib/atlas/names";
import { useLang } from "@/lib/i18n";
import { IDEAL, type Labels, loadLabels, loadPhantom, type PhantomId, PHANTOMS, simulate } from "@/lib/xray";

/**
 * Anatomía radiológica: reconocer las estructuras en una radiografía. Las imágenes y las etiquetas
 * (qué pieza hay en cada punto) salen de la anatomía del atlas 3D (ver scripts/xray). Sin IA.
 */

type Lang = "es" | "pt";
type Mode = "explore" | "quiz";
type Kind = "bone" | "organ";
/** Una estructura: tipo + número dentro de la lista de nombres de esa exploración. */
interface Target {
  kind: Kind;
  id: number;
}
type Question =
  | { type: "name"; target: Target; options: Target[]; answer: Target | null }
  | { type: "find"; target: Target; answer: Target | null };

const TEXT = {
  es: {
    exams: { mano: "Mano", rodilla: "Rodilla", torax: "Tórax", pelvis: "Pelvis" } as Record<PhantomId, string>,
    explore: "Explorar",
    quiz: "Examen",
    exploreHint: "Toca cualquier parte de la radiografía para ver qué es.",
    whatIs: "¿Qué estructura está marcada?",
    find: (name: string) => `Toca en la radiografía: ${name}`,
    right: "¡Correcto!",
    wrong: "No es esa",
    was: (name: string) => `Era: ${name}`,
    youTapped: (name: string) => `Has tocado: ${name}`,
    nothing: "nada (fuera de las estructuras)",
    next: "Siguiente",
    score: (ok: number, total: number) => `${ok} de ${total}`,
    bone: "Hueso",
    organ: "Órgano",
    loading: "Preparando la radiografía…",
    loadError: "No se ha podido cargar la imagen. Comprueba la conexión.",
    extra: { Heart: "Corazón", Mesocolon: "Mesocolon" } as Record<string, string>,
    credits: "Anatomía calculada a partir de Z-Anatomy (CC BY-SA 4.0), basado en BodyParts3D © DBCLS.",
  },
  pt: {
    exams: { mano: "Mão", rodilla: "Joelho", torax: "Tórax", pelvis: "Bacia" } as Record<PhantomId, string>,
    explore: "Explorar",
    quiz: "Exame",
    exploreHint: "Toca em qualquer parte da radiografia para ver o que é.",
    whatIs: "Que estrutura está marcada?",
    find: (name: string) => `Toca na radiografia: ${name}`,
    right: "Certo!",
    wrong: "Não é essa",
    was: (name: string) => `Era: ${name}`,
    youTapped: (name: string) => `Tocaste em: ${name}`,
    nothing: "nada (fora das estruturas)",
    next: "Seguinte",
    score: (ok: number, total: number) => `${ok} de ${total}`,
    bone: "Osso",
    organ: "Órgão",
    loading: "A preparar a radiografia…",
    loadError: "Não foi possível carregar a imagem. Verifica a ligação.",
    extra: { Heart: "Coração", Mesocolon: "Mesocólon" } as Record<string, string>,
    credits: "Anatomia calculada a partir do Z-Anatomy (CC BY-SA 4.0), baseado no BodyParts3D © DBCLS.",
  },
};

// Estructuras que no tiene sentido preguntar (no se distinguen en una radiografía o no son de primero).
const SKIP = /penis|testis|epididym|seminal|ductus|mesocolon|taenia|omentum|urethra|ureter|pancreatic duct|bile duct/i;
// Superficie mínima (píxeles) para preguntar por una estructura: si es muy pequeña no se puede señalar.
const MIN_AREA = { bone: 120, organ: 600 };

const same = (a: Target | null, b: Target | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

export default function RadioAnatomy() {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const [exam, setExam] = useState<PhantomId>("mano");
  const [mode, setMode] = useState<Mode>("explore");
  const [data, setData] = useState<{ id: PhantomId; labels: Labels; pixels: Uint8ClampedArray } | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Target | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const base = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);

  // Radiografía (con los valores recomendados) y mapa de etiquetas de la exploración elegida.
  useEffect(() => {
    let alive = true;
    Promise.all([loadPhantom(exam), loadLabels(exam)])
      .then(([p, labels]) => {
        if (!alive) return;
        setData({ id: exam, labels, pixels: simulate(exam, p, IDEAL[exam]).pixels });
      })
      .catch(() => alive && setError(tx.loadError));
    return () => {
      alive = false;
    };
  }, [exam, tx.loadError]);

  const ready = data?.id === exam ? data : null;

  const nameOf = useCallback(
    (t: Target | null) => {
      if (!t || !ready) return tx.nothing;
      const raw = (t.kind === "bone" ? ready.labels.boneNames : ready.labels.organNames)[t.id - 1] ?? "";
      const p = parsePart(raw, t.kind === "bone" ? "bones" : "organs");
      const side = sideLabel(p.side, lang);
      const name = tx.extra[p.en] ?? translate(p.en, lang);
      return side ? `${name} (${side})` : name;
    },
    [ready, lang, tx],
  );

  // Estructuras que se pueden preguntar en esta radiografía.
  const pool = useMemo(() => {
    if (!ready) return [] as Target[];
    const out: Target[] = [];
    for (const kind of ["bone", "organ"] as Kind[]) {
      const map = kind === "bone" ? ready.labels.bone : ready.labels.organ;
      const names = kind === "bone" ? ready.labels.boneNames : ready.labels.organNames;
      const area = new Map<number, number>();
      for (let i = 0; i < map.length; i++) {
        // En los órganos solo cuenta donde no hay hueso delante (si no, se toca el hueso).
        if (map[i] && (kind === "bone" || !ready.labels.bone[i])) area.set(map[i], (area.get(map[i]) ?? 0) + 1);
      }
      for (const [id, a] of area) if (a >= MIN_AREA[kind] && !SKIP.test(names[id - 1] ?? "")) out.push({ kind, id });
    }
    return out;
  }, [ready]);

  const newQuestion = useCallback(() => {
    if (pool.length < 4) return setQuestion(null);
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (Math.random() < 0.5) {
      setQuestion({ type: "find", target, answer: null });
      return;
    }
    // Opciones: preferiblemente del mismo tipo (huesos con huesos), sin repetir nombre.
    const label = nameOf(target);
    const others = pool
      .filter((t) => !same(t, target) && nameOf(t) !== label)
      .sort((a, b) => Number(b.kind === target.kind) - Number(a.kind === target.kind) + (Math.random() - 0.5));
    const options = [target, ...others.slice(0, 3)].sort(() => Math.random() - 0.5);
    setQuestion({ type: "name", target, options, answer: null });
  }, [pool, nameOf]);

  // Al cambiar de radiografía o de modo, se empieza de nuevo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio al cambiar de radiografía o de modo
    setPicked(null);
    if (mode === "quiz") newQuestion();
    else setQuestion(null);
  }, [mode, ready, newQuestion]);

  // Imagen de base.
  useEffect(() => {
    const ctx = base.current?.getContext("2d");
    if (!ctx || !ready) return;
    const img = ctx.createImageData(ready.labels.w, ready.labels.h);
    ready.pixels.forEach((g, i) => {
      img.data[i * 4] = g;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);
  }, [ready]);

  // Capa de resaltado: la estructura tocada / preguntada (verde si acierta, rojo si falla).
  useEffect(() => {
    const ctx = overlay.current?.getContext("2d");
    if (!ctx || !ready) return;
    const { w, h } = ready.labels;
    const marks: { t: Target; rgb: [number, number, number] }[] = [];
    if (mode === "explore" && picked) marks.push({ t: picked, rgb: [236, 72, 153] });
    if (question) {
      const answered = question.answer !== null;
      if (question.type === "name" && !answered) marks.push({ t: question.target, rgb: [236, 72, 153] });
      if (answered) {
        const chosen = question.answer;
        const ok = same(chosen, question.target);
        if (chosen && !ok) marks.push({ t: chosen, rgb: [220, 38, 38] });
        marks.push({ t: question.target, rgb: [22, 163, 74] });
      }
    }
    const img = ctx.createImageData(w, h);
    for (const { t, rgb } of marks) {
      const map = t.kind === "bone" ? ready.labels.bone : ready.labels.organ;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (map[i] !== t.id) continue;
          // Borde más marcado que el relleno.
          const edge =
            x === 0 ||
            y === 0 ||
            x === w - 1 ||
            y === h - 1 ||
            map[i - 1] !== t.id ||
            map[i + 1] !== t.id ||
            map[i - w] !== t.id ||
            map[i + w] !== t.id;
          img.data[i * 4] = rgb[0];
          img.data[i * 4 + 1] = rgb[1];
          img.data[i * 4 + 2] = rgb[2];
          img.data[i * 4 + 3] = edge ? 230 : 95;
        }
    }
    ctx.putImageData(img, 0, 0);
  }, [ready, mode, picked, question]);

  /** Lo que hay bajo el dedo: hueso y órgano (en la radiografía se superponen). */
  function under(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return { bone: null, organ: null };
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * ready.labels.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * ready.labels.h);
    if (x < 0 || y < 0 || x >= ready.labels.w || y >= ready.labels.h) return { bone: null, organ: null };
    const i = y * ready.labels.w + x;
    const b = ready.labels.bone[i];
    const o = ready.labels.organ[i];
    return {
      bone: b ? ({ kind: "bone", id: b } as Target) : null,
      organ: o && !SKIP.test(ready.labels.organNames[o - 1] ?? "") ? ({ kind: "organ", id: o } as Target) : null,
    };
  }

  function onTap(e: React.PointerEvent<HTMLCanvasElement>) {
    const { bone, organ } = under(e);
    if (mode === "explore") {
      // Primero el hueso; si no hay, el órgano.
      setPicked(bone ?? organ);
      return;
    }
    if (!question || question.type !== "find" || question.answer) return;
    // Si se busca un órgano que está detrás de un hueso, vale tocarlo ahí también.
    answer(same(organ, question.target) ? organ : (bone ?? organ));
  }

  function answer(t: Target | null) {
    if (!question || question.answer) return;
    // "Señalar": se acepta cualquier punto de la estructura (también la de detrás si el hueso tapa un órgano).
    const ok = same(t, question.target);
    setPicked(t ?? { kind: "bone", id: 0 });
    setQuestion({ ...question, answer: t ?? { kind: "bone", id: 0 } });
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), total: s.total + 1 }));
  }

  const answered = question?.answer ?? null;
  const ok = question && answered ? same(answered, question.target) : false;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {PHANTOMS.map((id) => (
            <button
              key={id}
              onClick={() => {
                setExam(id);
                setPicked(null);
              }}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                exam === id ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
              }`}
            >
              {tx.exams[id]}
            </button>
          ))}
        </div>
        <div className="relative mx-auto max-w-[400px] overflow-hidden rounded-2xl bg-black shadow-lg">
          {ready ? (
            <div className="relative" style={{ aspectRatio: `${ready.labels.w} / ${ready.labels.h}` }}>
              <canvas
                ref={base}
                width={ready.labels.w}
                height={ready.labels.h}
                className="absolute inset-0 h-full w-full"
              />
              <canvas
                ref={overlay}
                width={ready.labels.w}
                height={ready.labels.h}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-manipulation"
                onPointerUp={onTap}
                aria-label={tx.exams[exam]}
              />
            </div>
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center">
              {error ? <ErrorBox message={error} /> : <Spinner label={tx.loading} />}
            </div>
          )}
        </div>
        <p className="text-muted mx-auto mt-1 max-w-[400px] text-center text-[0.7rem]">{tx.credits}</p>
      </div>

      <div className="space-y-4">
        <div className="bg-surface-2 flex w-max gap-1 rounded-xl p-1" role="tablist">
          {(["explore", "quiz"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-lg px-5 text-sm font-semibold ${
                mode === m ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {m === "explore" ? tx.explore : tx.quiz}
            </button>
          ))}
        </div>

        {mode === "explore" && (
          <div className="card p-5">
            {picked ? (
              <>
                <div className="text-muted text-xs font-semibold tracking-wide uppercase">
                  {picked.kind === "bone" ? tx.bone : tx.organ}
                </div>
                <div className="mt-1 text-xl font-bold">{nameOf(picked)}</div>
              </>
            ) : (
              <p className="text-muted">{tx.exploreHint}</p>
            )}
          </div>
        )}

        {mode === "quiz" && question && (
          <div className="card space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">
                {question.type === "name" ? tx.whatIs : tx.find(nameOf(question.target))}
              </div>
              <span className="bg-surface-2 rounded-full px-3 py-1 font-mono text-sm font-bold">
                {tx.score(score.ok, score.total)}
              </span>
            </div>

            {question.type === "name" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((o) => {
                  const isRight = same(o, question.target);
                  const isChosen = same(o, answered);
                  return (
                    <button
                      key={`${o.kind}-${o.id}`}
                      onClick={() => answer(o)}
                      disabled={!!answered}
                      className={`min-h-12 rounded-xl px-4 text-left text-sm font-semibold transition ${
                        answered && isRight
                          ? "bg-success-soft text-success ring-success ring-2"
                          : answered && isChosen
                            ? "bg-danger-soft text-danger ring-danger ring-2"
                            : "bg-surface-2 hover:bg-accent-soft"
                      }`}
                    >
                      {nameOf(o)}
                    </button>
                  );
                })}
              </div>
            )}

            {answered && (
              <div className={`rounded-xl p-3 ${ok ? "bg-success-soft" : "bg-danger-soft"}`} role="status">
                <div className={`flex items-center gap-2 font-bold ${ok ? "text-success" : "text-danger"}`}>
                  {ok ? (
                    <Check size={18} weight="bold" aria-hidden="true" />
                  ) : (
                    <X size={18} weight="bold" aria-hidden="true" />
                  )}
                  {ok ? tx.right : tx.wrong}
                </div>
                {!ok && (
                  <p className="mt-1 text-sm">
                    {question.type === "find" && <>{tx.youTapped(answered.id ? nameOf(answered) : tx.nothing)}. </>}
                    {tx.was(nameOf(question.target))}
                  </p>
                )}
              </div>
            )}

            {answered && (
              <button
                className="btn-primary w-full"
                onClick={() => {
                  setPicked(null);
                  newQuestion();
                }}
              >
                {tx.next} <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
