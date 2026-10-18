"use client";

import { Microphone, SpeakerSlash, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { type Recognition, recognitionClass, speak } from "@/lib/speech";

/**
 * Modo conversación del chat: escucha lo que dice (reconocimiento de voz del dispositivo), lo pregunta al tutor,
 * lee la respuesta en voz alta y vuelve a escuchar. Todo gratis: solo gasta la pregunta a la IA, como si la escribiera.
 */

type State = "listening" | "thinking" | "speaking" | "waiting";

// Si se queda callada, se vuelve a escuchar un par de veces antes de esperar a que toque el micrófono.
const MAX_SILENT_RETRIES = 2;

export function VoiceChat({
  onAsk,
  onClose,
}: {
  onAsk: (text: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const t = useT();
  const tv = t.voiceChat;
  const lang = useLang();
  const [state, setState] = useState<State>("waiting");
  const [heard, setHeard] = useState("");
  const [problem, setProblem] = useState("");
  const rec = useRef<Recognition | null>(null);
  const stopSpeaking = useRef<(() => void) | null>(null);
  const active = useRef(true);
  const silent = useRef(0);

  // Las funciones se llaman desde los avisos de la voz (asíncronos): siempre la versión más reciente.
  const latest = useRef<{ listen: () => void; ask: (text: string) => void }>({ listen: () => {}, ask: () => {} });

  function listen() {
    const Rec = recognitionClass();
    if (!Rec || !active.current) return;
    stopSpeaking.current?.();
    const r = new Rec();
    r.lang = lang === "pt" ? "pt-PT" : "es-ES";
    r.continuous = false;
    r.interimResults = true;
    let finalText = "";
    let failed = false;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setHeard((finalText + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      failed = true;
      setProblem(e.error === "not-allowed" || e.error === "service-not-allowed" ? tv.noPermission : tv.notHeard);
      setState("waiting");
    };
    r.onend = () => {
      rec.current = null;
      if (!active.current || failed) return;
      const text = finalText.trim();
      if (text) {
        silent.current = 0;
        latest.current.ask(text);
      } else if (silent.current < MAX_SILENT_RETRIES) {
        silent.current++;
        latest.current.listen();
      } else {
        silent.current = 0;
        setState("waiting");
      }
    };
    setHeard("");
    setProblem("");
    setState("listening");
    rec.current = r;
    try {
      r.start();
    } catch {
      // En el iPad a veces solo deja empezar a escuchar tras un toque: se espera a que pulse el micrófono.
      setState("waiting");
    }
  }

  async function ask(text: string) {
    setState("thinking");
    const reply = await onAsk(text);
    if (!active.current) return;
    if (!reply) {
      setProblem(tv.failed);
      setState("waiting");
      return;
    }
    setState("speaking");
    stopSpeaking.current = speak(reply, lang, () => {
      stopSpeaking.current = null;
      if (active.current) latest.current.listen();
    });
  }

  useEffect(() => {
    latest.current = { listen, ask };
  });

  // Al abrir el modo conversación se empieza a escuchar; al cerrarlo se corta todo.
  useEffect(() => {
    active.current = true;
    latest.current.listen();
    return () => {
      active.current = false;
      rec.current?.abort();
      stopSpeaking.current?.();
    };
  }, []);

  function interrupt() {
    stopSpeaking.current?.();
    stopSpeaking.current = null;
    listen();
  }

  const label = { listening: tv.listening, thinking: tv.thinking, speaking: tv.speaking, waiting: tv.tapToTalk }[state];

  return (
    <div className="card border-accent mt-4 border-2 p-4 sm:p-5" role="region" aria-label={tv.title}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-accent text-sm font-bold">{tv.title}</p>
        <button
          className="btn-ghost min-h-9 px-3 text-sm"
          onClick={() => {
            active.current = false;
            rec.current?.abort();
            stopSpeaking.current?.();
            onClose();
          }}
        >
          <X size={16} aria-hidden="true" /> {tv.end}
        </button>
      </div>

      <div className="mt-3 flex flex-col items-center gap-3 text-center">
        <button
          onClick={() => (state === "speaking" ? interrupt() : state === "waiting" ? listen() : undefined)}
          disabled={state === "thinking" || state === "listening"}
          aria-label={state === "speaking" ? tv.interrupt : tv.tapToTalk}
          className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition-transform ${
            state === "listening"
              ? "scale-105 bg-[var(--accent)]"
              : state === "speaking"
                ? "bg-[#14b8a6]"
                : state === "thinking"
                  ? "bg-[var(--accent)] opacity-70"
                  : "bg-[var(--accent)] hover:scale-105"
          }`}
        >
          {state === "listening" && (
            <span
              className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-30"
              aria-hidden="true"
            />
          )}
          {state === "speaking" ? (
            <SpeakerSlash size={40} weight="fill" aria-hidden="true" />
          ) : (
            <Microphone size={40} weight="fill" aria-hidden="true" />
          )}
        </button>
        <p className="font-semibold" role="status" aria-live="polite">
          {state === "speaking" ? `${label} · ${tv.interruptHint}` : label}
        </p>
        {heard && (state === "listening" || state === "thinking") && (
          <p className="text-muted max-w-md text-sm italic">«{heard}»</p>
        )}
        {problem && <p className="text-danger max-w-md text-sm">{problem}</p>}
      </div>
    </div>
  );
}
