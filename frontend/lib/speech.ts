"use client";

/**
 * Voz del propio dispositivo (gratis): leer textos en voz alta y reconocer lo que se dice.
 * La usan el botón "Escuchar" de los resúmenes y el modo conversación del chat.
 */

// Por defecto, algo más despacio que la voz normal (para estudiar). Se recuerda la última elegida.
export const RATES = [0.6, 0.7, 0.85, 1, 1.2];
export const DEFAULT_RATE = 0.85;
export const RATE_KEY = "voz-velocidad";

/** Markdown → frases para leer (sin símbolos, etiquetas de origen ni citas [1]). */
/** Fórmula LaTeX en algo que la voz pueda leer (x̄ = Σx/n en vez de "barra frac llave…"). */
function plainMath(tex: string) {
  let t = tex;
  for (let i = 0; i < 3; i++)
    t = t
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1) / ($2)")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
      .replace(/\\bar\s*\{([^{}]*)\}/g, "$1̄")
      .replace(/\^\{?2\}?/g, "²")
      .replace(/\^\{?3\}?/g, "³");
  return t
    .replace(/\\(cdot|times)/g, " × ")
    .replace(/\\sum/g, "Σ")
    .replace(/\\(le|leq)/g, " ≤ ")
    .replace(/\\(ge|geq)/g, " ≥ ")
    .replace(/\\pm/g, " ± ")
    .replace(/\\(left|right|,|;|!|quad)/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function speechChunks(markdown: string): string[] {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => `\n${plainMath(tex)}\n`)
    .replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => plainMath(tex))
    .replace(/\[(Os teus apontamentos|Tus apuntes|Biblioteca de refer[eê]ncia[^\]]*|Radiopaedia|IAEA|EFRS)\]/g, "")
    .replace(/\[\d{1,2}\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}.*$/gm, "")
    // Filas de tabla: "| Término | Significado |" → "Término: Significado"
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_m, row: string) =>
      row
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(": "),
    )
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/\s+([.,;:!?])/g, "$1");
  const parts: string[] = [];
  for (const block of text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)) {
    // Títulos y puntos sin punto final: se lo añadimos para que la voz haga la pausa.
    const line = /[.!?:;]$/.test(block) ? block : `${block}.`;
    // Frases de como mucho ~220 caracteres.
    for (const sentence of line.match(/[^.!?]+[.!?]+/g) ?? [line]) {
      const s = sentence.trim();
      if (s.length > 1) parts.push(s);
    }
  }
  return parts;
}

export function pickVoice(lang: "es" | "pt") {
  const voices = window.speechSynthesis.getVoices();
  const wanted = lang === "pt" ? ["pt-PT", "pt_PT", "pt"] : ["es-ES", "es_ES", "es"];
  for (const w of wanted) {
    const v = voices.find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(w.replace("_", "-").toLowerCase()));
    if (v) return v;
  }
  return null;
}

/** Velocidad elegida la última vez (la del botón "Escuchar"). */
export function savedRate(): number {
  try {
    const saved = Number(localStorage.getItem(RATE_KEY));
    return RATES.includes(saved) ? saved : DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

/** Lee un texto (markdown) frase a frase y avisa al terminar. Devuelve una función para cortarlo. */
export function speak(text: string, lang: "es" | "pt", onEnd: () => void): () => void {
  const synth = window.speechSynthesis;
  const chunks = speechChunks(text);
  const voice = pickVoice(lang);
  const rate = savedRate();
  let stopped = false;
  const say = (k: number) => {
    if (stopped) return;
    if (k >= chunks.length) return onEnd();
    const u = new SpeechSynthesisUtterance(chunks[k]);
    u.lang = lang === "pt" ? "pt-PT" : "es-ES";
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => say(k + 1);
    u.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") say(k + 1);
    };
    synth.speak(u);
  };
  synth.cancel();
  say(0);
  return () => {
    stopped = true;
    synth.cancel();
  };
}

/** En el iPad, la voz solo funciona si se "despierta" dentro de un toque: se llama al pulsar un botón. */
export function unlockSpeech() {
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* sin voz */
  }
}

// ---------- Reconocimiento de voz ----------

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Dictado: escucha hasta que se queda callada `silenceMs` (o hasta llamar a finish) y entrega el texto.
 * Si el navegador corta el micrófono antes (el iPad lo hace tras una pausa corta), se vuelve a abrir
 * y lo nuevo se añade a lo ya dicho. `base` es el texto que ya había (para seguir hablando).
 */
export function dictate(opts: {
  lang: "es" | "pt";
  base?: string;
  silenceMs?: number;
  nothingMs?: number;
  onText: (text: string) => void;
  onEnd: (text: string, error?: "permission" | "failed") => void;
}): { finish: () => void; cancel: () => void } {
  const Rec = recognitionClass();
  const silenceMs = opts.silenceMs ?? 4000;
  let base = opts.base?.trim() ?? "";
  let text = base;
  let done = false;
  let rec: Recognition | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopRec = () => {
    const r = rec;
    rec = null;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try {
        r.abort();
      } catch {
        /* el iPad a veces lanza un error al parar */
      }
    }
  };
  const end = (error?: "permission" | "failed") => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    timer = null;
    stopRec();
    opts.onEnd(text.trim(), error);
  };
  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      end();
    }, ms);
  };
  const open = () => {
    if (!Rec || done) return;
    const r = new Rec();
    r.lang = opts.lang === "pt" ? "pt-PT" : "es-ES";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      text = `${base} ${heard}`.trim();
      opts.onText(text);
      arm(silenceMs);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      end(e.error === "not-allowed" || e.error === "service-not-allowed" ? "permission" : "failed");
    };
    r.onend = () => {
      rec = null;
      if (done) return;
      if (timer) {
        base = text;
        open();
      } else end();
    };
    rec = r;
    try {
      r.start();
    } catch {
      end("failed");
    }
  };

  if (!Rec) {
    setTimeout(() => end("failed"), 0);
  } else {
    arm(opts.nothingMs ?? 20_000);
    open();
  }
  return {
    finish: () => end(),
    cancel: () => {
      done = true;
      if (timer) clearTimeout(timer);
      stopRec();
    },
  };
}
