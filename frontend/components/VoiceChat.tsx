"use client";

import { Microphone, PaperPlaneRight, SpeakerSlash, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { type Recognition, recognitionClass, speak } from "@/lib/speech";

/**
 * Modo conversación del chat: escucha lo que dice (reconocimiento de voz del dispositivo), lo pregunta al tutor,
 * lee la respuesta en voz alta y vuelve a escuchar. Todo gratis: solo gasta la pregunta a la IA, como si la escribiera.
 *
 * En el iPad el reconocimiento no siempre detecta solo que ha terminado de hablar, así que:
 *  - si deja de hablar un momento, se envía lo que ha dicho (temporizador de silencio propio);
 *  - y puede tocar el botón grande para enviarlo en cuanto termine.
 */

type State = "listening" | "thinking" | "speaking" | "waiting";

// Silencio tras el que se da por terminada la pregunta (generoso: se puede parar a pensar).
const SILENCE_MS = 4000;
// Si no dice nada en este tiempo, se deja de escuchar y se espera a que toque el micrófono.
const NOTHING_SAID_MS = 20_000;

/** Para el reconocimiento sin que un error del navegador corte lo que viene después. */
function safely(fn: () => void) {
  try {
    fn();
  } catch {
    /* el iPad a veces lanza un error al parar: no importa */
  }
}

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
  // Lo oído en la pregunta en curso y si ya se ha enviado (para no enviarlo dos veces).
  // "base" es lo que se oyó antes de que el iPad cortase el micrófono por su cuenta (se sigue añadiendo).
  const turn = useRef<{ text: string; base: string; sent: boolean; timer: ReturnType<typeof setTimeout> | null }>({
    text: "",
    base: "",
    sent: false,
    timer: null,
  });

  // Las funciones se llaman desde los avisos de la voz (asíncronos): siempre la versión más reciente.
  const latest = useRef<{ listen: () => void; ask: (text: string) => void; finish: () => void; restart: () => void }>({
    listen: () => {},
    ask: () => {},
    finish: () => {},
    restart: () => {},
  });

  function stopListening() {
    if (turn.current.timer) clearTimeout(turn.current.timer);
    turn.current.timer = null;
    const r = rec.current;
    rec.current = null;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      safely(() => r.abort());
    }
  }

  /** Da la pregunta por terminada y la envía (una sola vez por escucha). */
  function finishTurn() {
    if (turn.current.sent || !active.current) return;
    const text = turn.current.text.trim();
    turn.current.sent = true;
    stopListening();
    if (text) latest.current.ask(text);
    else setState("waiting");
  }

  /** Empieza una pregunta nueva. */
  function listen() {
    if (!recognitionClass() || !active.current) return;
    safely(() => stopSpeaking.current?.());
    stopSpeaking.current = null;
    stopListening();
    turn.current = { text: "", base: "", sent: false, timer: null };
    setHeard("");
    setProblem("");
    setState("listening");
    armTimer(NOTHING_SAID_MS);
    startRecognition();
  }

  function armTimer(ms: number) {
    if (turn.current.timer) clearTimeout(turn.current.timer);
    turn.current.timer = setTimeout(() => {
      turn.current.timer = null;
      latest.current.finish();
    }, ms);
  }

  /** Abre el micrófono. Si el navegador lo cierra antes de tiempo (pausa al hablar), se vuelve a abrir. */
  function startRecognition() {
    const Rec = recognitionClass();
    if (!Rec) return;
    const r = new Rec();
    r.lang = lang === "pt" ? "pt-PT" : "es-ES";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      // Con "continuous", results trae todo lo dicho en esta escucha (frases ya cerradas y la que está diciendo).
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      turn.current.text = `${turn.current.base} ${text}`.trim();
      setHeard(turn.current.text);
      armTimer(SILENCE_MS);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      turn.current.sent = true;
      stopListening();
      setProblem(e.error === "not-allowed" || e.error === "service-not-allowed" ? tv.noPermission : tv.notHeard);
      setState("waiting");
    };
    r.onend = () => {
      rec.current = null;
      if (turn.current.sent || !active.current) return;
      // El iPad corta el micrófono tras una pausa corta: si aún no ha pasado el silencio que esperamos,
      // se vuelve a abrir y lo nuevo se añade a lo ya dicho.
      if (turn.current.timer) {
        turn.current.base = turn.current.text;
        latest.current.restart();
      } else latest.current.finish();
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      // En el iPad a veces solo deja empezar a escuchar tras un toque: se espera a que pulse el micrófono.
      turn.current.sent = true;
      stopListening();
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
    latest.current = { listen, ask, finish: finishTurn, restart: startRecognition };
  });

  // Al abrir el modo conversación se empieza a escuchar; al cerrarlo se corta todo.
  useEffect(() => {
    active.current = true;
    const turnRef = turn;
    const recRef = rec;
    const speakingRef = stopSpeaking;
    latest.current.listen();
    return () => {
      active.current = false;
      if (turnRef.current.timer) clearTimeout(turnRef.current.timer);
      const r = recRef.current;
      recRef.current = null;
      if (r) {
        r.onresult = null;
        r.onerror = null;
        r.onend = null;
        safely(() => r.abort());
      }
      safely(() => speakingRef.current?.());
    };
  }, []);

  function close() {
    // Primero se cierra el panel (así "Terminar" siempre funciona); al desmontarse se corta la escucha y la voz.
    active.current = false;
    onClose();
  }

  function mainButton() {
    if (state === "listening") finishTurn();
    else if (state === "speaking" || state === "waiting") listen();
  }

  const label = {
    listening: heard ? tv.listeningSend : tv.listening,
    thinking: tv.thinking,
    speaking: `${tv.speaking} · ${tv.interruptHint}`,
    waiting: tv.tapToTalk,
  }[state];

  return (
    <div className="card border-accent mt-4 border-2 p-4 sm:p-5" role="region" aria-label={tv.title}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-accent text-sm font-bold">{tv.title}</p>
        <button className="btn-secondary min-h-10 px-4 text-sm" onClick={close}>
          <X size={16} weight="bold" aria-hidden="true" /> {tv.end}
        </button>
      </div>

      <div className="mt-3 flex flex-col items-center gap-3 text-center">
        <button
          onClick={mainButton}
          disabled={state === "thinking"}
          aria-label={state === "listening" ? tv.send : state === "speaking" ? tv.interrupt : tv.tapToTalk}
          className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95 ${
            state === "speaking" ? "bg-[#14b8a6]" : "bg-[var(--accent)]"
          } ${state === "thinking" ? "opacity-70" : ""}`}
        >
          {state === "listening" && (
            <span
              className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-30"
              aria-hidden="true"
            />
          )}
          {state === "speaking" ? (
            <SpeakerSlash size={40} weight="fill" aria-hidden="true" />
          ) : state === "listening" && heard ? (
            <PaperPlaneRight size={40} weight="fill" aria-hidden="true" />
          ) : (
            <Microphone size={40} weight="fill" aria-hidden="true" />
          )}
        </button>
        <p className="font-semibold" role="status" aria-live="polite">
          {label}
        </p>
        {heard && (state === "listening" || state === "thinking") && (
          <p className="text-muted max-w-md text-sm italic">«{heard}»</p>
        )}
        {problem && <p className="text-danger max-w-md text-sm">{problem}</p>}
      </div>
    </div>
  );
}
