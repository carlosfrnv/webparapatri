"use client";

import { Microphone, Pause, Play, Stop, Trash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { errorMessage, uploadFile } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { DocumentItem } from "@/lib/types";

/**
 * Grabar una clase desde la web. Se graba con poca calidad (voz: 32 kbps, ~14 MB por hora) y al terminar
 * se sube como "clase grabada": el servidor la transcribe y se convierte en apuntes como cualquier archivo.
 * La pantalla se mantiene encendida mientras graba (si se bloquea, el iPad corta la grabación).
 */

type State = "idle" | "recording" | "paused" | "uploading";

const clock = (s: number) =>
  `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function pickMime() {
  const options = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export function ClassRecorder({
  subjectId,
  onUploaded,
}: {
  subjectId: string | null;
  onUploaded: (doc: DocumentItem) => void;
}) {
  const t = useT();
  const tr = t.recorder;
  const lang = useLang();
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const supported = typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices;

  // Contador de tiempo mientras graba.
  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Aviso si intenta cerrar la página grabando.
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  // Al salir de la página se suelta el micrófono.
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
      wakeLock.current?.release().catch(() => undefined);
    },
    [],
  );

  if (!supported) return null;

  async function start() {
    setProblem("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true },
      });
      const mimeType = pickMime();
      const r = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      // Cada 10 s se guarda un trozo: si algo falla, no se pierde todo.
      r.start(10_000);
      recorder.current = r;
      setSeconds(0);
      setState("recording");
      try {
        wakeLock.current =
          (await (
            navigator as Navigator & {
              wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
            }
          ).wakeLock?.request("screen")) ?? null;
      } catch {
        /* sin bloqueo de pantalla: se avisa en el texto */
      }
    } catch {
      setProblem(tr.noMic);
    }
  }

  function pause() {
    recorder.current?.pause();
    setState("paused");
  }

  function resume() {
    recorder.current?.resume();
    setState("recording");
  }

  function finish(): Promise<Blob> {
    return new Promise((resolve) => {
      const r = recorder.current!;
      r.onstop = () => resolve(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
      r.stop();
      r.stream.getTracks().forEach((tr) => tr.stop());
      wakeLock.current?.release().catch(() => undefined);
      wakeLock.current = null;
    });
  }

  async function save() {
    const blob = await finish();
    setState("uploading");
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    const now = new Date();
    const name =
      `${tr.fileName} ${now.toLocaleDateString(dateLocale(lang))} ${now.toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit" })}.${ext}`.replace(
        /[/:]/g,
        "-",
      );
    try {
      const doc = await uploadFile<DocumentItem>(
        new File([blob], name, { type: blob.type }),
        { subjectId },
        setProgress,
        "/documents/audio",
      );
      onUploaded(doc);
      setState("idle");
      setSeconds(0);
    } catch (err) {
      setProblem(errorMessage(err));
      setState("idle");
    }
  }

  async function discard() {
    if (!confirm(tr.confirmDiscard)) return;
    await finish();
    chunks.current = [];
    setState("idle");
    setSeconds(0);
  }

  return (
    <div className="card mb-4 p-4">
      {state === "idle" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={start}>
            <Microphone size={18} weight="duotone" aria-hidden="true" /> {tr.start}
          </button>
          <p className="text-muted min-w-[12rem] flex-1 text-xs">{tr.hint}</p>
        </div>
      ) : state === "uploading" ? (
        <p className="text-sm font-medium" role="status">
          {tr.uploading} {Math.round(progress * 100)} %
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3" role="status">
          <span className="flex items-center gap-2 font-semibold tabular-nums">
            <span
              className={`h-3 w-3 rounded-full ${state === "recording" ? "animate-pulse bg-red-600" : "bg-amber-500"}`}
              aria-hidden="true"
            />
            {state === "recording" ? tr.recording : tr.paused} · {clock(seconds)}
          </span>
          <div className="flex flex-wrap gap-2">
            {state === "recording" ? (
              <button className="btn-ghost" onClick={pause}>
                <Pause size={18} weight="fill" aria-hidden="true" /> {tr.pause}
              </button>
            ) : (
              <button className="btn-ghost" onClick={resume}>
                <Play size={18} weight="fill" aria-hidden="true" /> {tr.resume}
              </button>
            )}
            <button className="btn-primary" onClick={save}>
              <Stop size={18} weight="fill" aria-hidden="true" /> {tr.save}
            </button>
            <button className="btn-ghost text-danger" onClick={discard} aria-label={tr.discard}>
              <Trash size={18} weight="duotone" aria-hidden="true" />
            </button>
          </div>
          <p className="text-muted w-full text-xs">{tr.keepOpen}</p>
        </div>
      )}
      {problem && <p className="text-danger mt-2 text-sm">{problem}</p>}
    </div>
  );
}
