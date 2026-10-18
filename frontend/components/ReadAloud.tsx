"use client";

import { Pause, Play, SpeakerHigh, Stop } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { pickVoice, RATE_KEY, RATES, savedRate, speechChunks } from "@/lib/speech";

/**
 * Lee el resumen en voz alta con la voz del propio dispositivo (gratis: no pasa por el servidor ni gasta IA).
 * Se lee frase a frase: el iPad corta los textos largos si se le pasan de una vez.
 */

export function ReadAloud({ text }: { text: string }) {
  const t = useT();
  const tr = t.readAloud;
  const lang = useLang();
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(savedRate);
  const chunks = useMemo(() => speechChunks(text), [text]);
  const run = useRef(0);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Al salir de la página (o cambiar de idioma) se deja de leer.
  useEffect(() => {
    const runs = run;
    return () => {
      runs.current++;
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported, lang]);

  if (!supported) return null;

  function speakFrom(i: number, speed = rate) {
    const synth = window.speechSynthesis;
    synth.cancel();
    const myRun = ++run.current;
    const voice = pickVoice(lang);
    const say = (k: number) => {
      if (myRun !== run.current) return;
      if (k >= chunks.length) {
        setState("idle");
        setIndex(0);
        return;
      }
      setIndex(k);
      const u = new SpeechSynthesisUtterance(chunks[k]);
      u.lang = lang === "pt" ? "pt-PT" : "es-ES";
      if (voice) u.voice = voice;
      u.rate = speed;
      u.onend = () => say(k + 1);
      u.onerror = (e) => {
        // "interrupted"/"canceled" llegan al parar o cambiar de velocidad: no es un error.
        if (e.error !== "interrupted" && e.error !== "canceled") say(k + 1);
      };
      synth.speak(u);
    };
    setState("playing");
    say(i);
  }

  function play() {
    if (state === "paused") {
      window.speechSynthesis.resume();
      setState("playing");
      return;
    }
    speakFrom(0);
  }

  function pause() {
    window.speechSynthesis.pause();
    setState("paused");
  }

  function stop() {
    run.current++;
    window.speechSynthesis.cancel();
    setState("idle");
    setIndex(0);
  }

  function changeRate(r: number) {
    setRate(r);
    try {
      localStorage.setItem(RATE_KEY, String(r));
    } catch {
      /* se ignora */
    }
    // Se aplica desde la frase en curso.
    if (state === "playing") speakFrom(index, r);
  }

  return (
    <div className="bg-surface-2 mb-5 flex flex-wrap items-center gap-2 rounded-xl p-2 sm:p-3">
      {state === "playing" ? (
        <button className="btn-primary min-h-10 px-4 text-sm" onClick={pause}>
          <Pause size={18} weight="fill" aria-hidden="true" /> {tr.pause}
        </button>
      ) : (
        <button className="btn-primary min-h-10 px-4 text-sm" onClick={play}>
          {state === "paused" ? (
            <Play size={18} weight="fill" aria-hidden="true" />
          ) : (
            <SpeakerHigh size={18} weight="fill" aria-hidden="true" />
          )}{" "}
          {state === "paused" ? tr.resume : tr.listen}
        </button>
      )}
      {state !== "idle" && (
        <button className="btn-ghost min-h-10 px-3 text-sm" onClick={stop} aria-label={tr.stop}>
          <Stop size={18} weight="fill" aria-hidden="true" /> {tr.stop}
        </button>
      )}
      <div className="ml-auto flex items-center gap-1" role="group" aria-label={tr.speed}>
        <span className="text-muted mr-1 text-xs">{tr.speed}</span>
        {RATES.map((r) => (
          <button
            key={r}
            onClick={() => changeRate(r)}
            aria-pressed={rate === r}
            className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${rate === r ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
          >
            {r === 1 ? "1×" : `${String(r).replace(".", ",")}×`}
          </button>
        ))}
      </div>
      {state !== "idle" && chunks.length > 0 && (
        <div className="w-full px-1">
          <p className="text-muted mb-1 text-xs" aria-live="polite">
            {chunks[index]}
          </p>
          <div className="bg-surface h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <div
              className="bg-accent h-full rounded-full transition-all"
              style={{ width: `${((index + 1) / chunks.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
