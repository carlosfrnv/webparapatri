"use client";

import { ArrowsClockwise, Pause, Play, SkipBack, SkipForward } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { RATE_KEY, RATES, savedRate } from "@/lib/speech";
import { ErrorBox, Spinner } from "./ui";

/**
 * Podcast del tema: la IA escribe una charla entre dos presentadores (una vez, queda guardada)
 * y el propio dispositivo la lee con dos voces distintas. La voz es gratis: no pasa por el servidor.
 */

interface PodcastData {
  title: string;
  lines: { who: 0 | 1; text: string }[];
  hosts: [string, string];
}

// Nombres de las voces del iPad/Mac (y algunas de Chrome) para distinguir chica y chico.
const FEMALE = /m[oó]nica|paulina|marisol|joana|catarina|luciana|helena|laura|luc[ií]a|elvira|female|mujer/i;
const MALE = /jorge|diego|juan|enrique|pablo|carlos|joaquim|duarte|daniel|alvaro|male|hombre/i;

/** Dos voces del idioma: distintas si el dispositivo tiene varias; si no, la misma con otro tono. */
function pickVoices(lang: "es" | "pt") {
  const all = window.speechSynthesis.getVoices();
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const main = lang === "pt" ? "pt-pt" : "es-es";
  const prefix = lang === "pt" ? "pt" : "es";
  const local = all.filter((v) => norm(v).startsWith(main));
  const others = all.filter((v) => norm(v).startsWith(prefix) && !norm(v).startsWith(main));
  const pool = [...local, ...others];
  // Patricia con voz de chica y Carlos con voz de chico, si el dispositivo tiene las dos.
  const female = pool.find((v) => FEMALE.test(v.name));
  const male = pool.find((v) => MALE.test(v.name));
  const a = female ?? pool[0] ?? null;
  const b = male ?? pool.find((v) => v !== a && v.name !== a?.name) ?? null;
  return b
    ? [
        { voice: a, pitch: 1 },
        { voice: b, pitch: 1 },
      ]
    : [
        { voice: a, pitch: 1.1 },
        { voice: a, pitch: 0.8 },
      ];
}

export function PodcastTab({ documentId }: { documentId: string }) {
  const t = useT();
  const tp = t.podcast;
  const lang = useLang();
  const [data, setData] = useState<PodcastData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(savedRate);
  const run = useRef(0);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      try {
        setData(await api.get<PodcastData>(`/documents/${documentId}/podcast${force ? "?force=1" : ""}`));
        setIndex(0);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [documentId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (y al cambiar de idioma)
    load();
  }, [load, lang]);

  // Al salir de la pestaña (o cambiar de idioma) se deja de hablar.
  useEffect(() => {
    const runs = run;
    return () => {
      runs.current++;
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported, lang]);

  // La intervención que suena, siempre a la vista.
  useEffect(() => {
    if (state === "playing") lineRefs.current[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [index, state]);

  if (error) return <ErrorBox message={error} onRetry={() => load()} />;
  if (loading || !data) return <Spinner label={tp.loading} />;
  if (!supported) return <p className="text-muted">{tp.noVoice}</p>;

  const lines = data.lines;

  function playFrom(i: number, speed = rate) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const myRun = ++run.current;
    const voices = pickVoices(lang);
    const say = (k: number) => {
      if (myRun !== run.current) return;
      if (k >= lines.length) {
        setState("idle");
        setIndex(0);
        return;
      }
      setIndex(k);
      const { voice, pitch } = voices[lines[k].who];
      const u = new SpeechSynthesisUtterance(lines[k].text);
      u.lang = lang === "pt" ? "pt-PT" : "es-ES";
      if (voice) u.voice = voice;
      u.pitch = pitch;
      u.rate = speed;
      u.onend = () => say(k + 1);
      u.onerror = (e) => {
        // "interrupted"/"canceled" llegan al parar o al saltar: no es un error.
        if (e.error !== "interrupted" && e.error !== "canceled") say(k + 1);
      };
      synth.speak(u);
    };
    setState("playing");
    say(i);
  }

  function toggle() {
    const synth = window.speechSynthesis;
    if (state === "playing") {
      // Se para en la intervención actual y luego se sigue desde ahí (el pause del iPad no es fiable).
      run.current++;
      synth.cancel();
      setState("paused");
    } else {
      playFrom(index);
    }
  }

  function jump(i: number) {
    const k = Math.max(0, Math.min(lines.length - 1, i));
    if (state === "playing") playFrom(k);
    else setIndex(k);
  }

  function changeRate(r: number) {
    setRate(r);
    try {
      localStorage.setItem(RATE_KEY, String(r));
    } catch {
      /* se ignora */
    }
    if (state === "playing") playFrom(index, r);
  }

  const progress = lines.length > 1 ? (index / (lines.length - 1)) * 100 : 0;

  return (
    <>
      <div className="card mb-5 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div
            className="hero flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl"
            aria-hidden="true"
          >
            🎧
          </div>
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-lg leading-snug font-bold">{data.title}</h2>
            <p className="text-muted text-sm">{tp.with(data.hosts[0], data.hosts[1])}</p>
          </div>
        </div>

        <div className="bg-surface-2 mt-5 h-2 overflow-hidden rounded-full" aria-hidden="true">
          <div className="bg-accent h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-muted mt-1 text-right text-xs">{tp.position(index + 1, lines.length)}</div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <button className="btn-ghost h-12 w-12 rounded-full p-0" onClick={() => jump(index - 1)} aria-label={tp.prev}>
            <SkipBack size={24} weight="fill" aria-hidden="true" />
          </button>
          <button
            className="btn-primary h-16 w-16 rounded-full p-0"
            onClick={toggle}
            aria-label={state === "playing" ? tp.pause : tp.play}
          >
            {state === "playing" ? (
              <Pause size={30} weight="fill" aria-hidden="true" />
            ) : (
              <Play size={30} weight="fill" aria-hidden="true" />
            )}
          </button>
          <button className="btn-ghost h-12 w-12 rounded-full p-0" onClick={() => jump(index + 1)} aria-label={tp.next}>
            <SkipForward size={24} weight="fill" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <label className="text-muted flex items-center gap-2 text-sm">
            {tp.speed}
            <select
              className="input min-h-10 w-auto py-1"
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-ghost min-h-10 text-sm"
            onClick={() => {
              if (!confirm(tp.confirmRedo)) return;
              run.current++;
              window.speechSynthesis.cancel();
              setState("idle");
              load(true);
            }}
          >
            <ArrowsClockwise size={18} weight="duotone" aria-hidden="true" /> {tp.redo}
          </button>
        </div>
      </div>

      <p className="text-muted mb-3 text-sm">{tp.tapHint}</p>
      <ol className="space-y-3">
        {lines.map((l, i) => {
          const active = i === index && state !== "idle";
          return (
            <li
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              className={`flex ${l.who === 1 ? "justify-end" : ""}`}
            >
              <button
                onClick={() => (state === "playing" ? playFrom(i) : setIndex(i))}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-left transition ${
                  l.who === 0 ? "bg-accent-soft rounded-tl-sm" : "bg-teal-soft rounded-tr-sm"
                } ${active ? "ring-accent ring-2" : i === index ? "ring-border ring-1" : ""}`}
              >
                <span className="text-muted block text-xs font-semibold">{data.hosts[l.who]}</span>
                <span className="block">{l.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
