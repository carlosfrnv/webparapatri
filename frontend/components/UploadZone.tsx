"use client";

import { CloudArrowUp } from "@phosphor-icons/react";
import { GradientIcon } from "./GradientIcon";
import { useRef, useState } from "react";
import { errorMessage, uploadFile, type UploadFields } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { DocumentItem } from "@/lib/types";

const MAX_BYTES = 50 * 1024 * 1024;
// Clases grabadas: se comprimen en el servidor, así que pueden ser mucho más grandes.
const MAX_AUDIO_BYTES = 300 * 1024 * 1024;
const DOC_EXT = ["pdf", "docx", "pptx", "odt", "odp", "txt", "md"];
// Formatos antiguos o de Apple que no se pueden leer: se dejan elegir para explicar cómo pasarlos a PDF.
const OLD_EXT = ["ppt", "doc", "pps", "ppsx", "key", "pages"];
export const AUDIO_EXT = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "webm", "mp4", "flac", "amr", "3gp", "caf"];
const ACCEPT = [...DOC_EXT, ...OLD_EXT, ...AUDIO_EXT].map((e) => `.${e}`).join(",") + ",audio/*";

interface Pending {
  key: string;
  name: string;
  progress: number;
  error?: "badType" | "oldType" | "tooBig" | "tooBigAudio" | string;
}

/** Zona grande de arrastrar y soltar, con progreso por archivo. */
export function UploadZone({
  subjectId,
  fields,
  title,
  onUploaded,
}: {
  /** Texto principal de la zona (por defecto, "Arrastra aquí tus apuntes"). */
  title?: string;
  subjectId: string | null;
  /** Campos extra (p. ej., documento de la biblioteca de referencia). */
  fields?: Omit<UploadFields, "subjectId">;
  onUploaded: (doc: DocumentItem) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);

  function update(key: string, patch: Partial<Pending>) {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      setPending((list) => [...list, { key, name: file.name, progress: 0 }]);

      const audio = file.type.startsWith("audio/") || AUDIO_EXT.includes(ext);
      if (OLD_EXT.includes(ext)) {
        update(key, { error: "oldType" });
        continue;
      }
      // La biblioteca de referencia solo admite documentos.
      if ((!DOC_EXT.includes(ext) && !audio) || (audio && fields?.sourceType === "referencia")) {
        update(key, { error: "badType" });
        continue;
      }
      if (file.size > (audio ? MAX_AUDIO_BYTES : MAX_BYTES)) {
        update(key, { error: audio ? "tooBigAudio" : "tooBig" });
        continue;
      }
      try {
        const doc = await uploadFile<DocumentItem>(
          file,
          { ...fields, subjectId },
          (progress) => update(key, { progress }),
          audio ? "/documents/audio" : "/documents",
        );
        setPending((list) => list.filter((p) => p.key !== key));
        onUploaded(doc);
      } catch (err) {
        update(key, { error: errorMessage(err) });
      }
    }
  }

  const errorText = (e: string) =>
    e === "badType"
      ? t.upload.badType
      : e === "oldType"
        ? t.upload.oldType
        : e === "tooBig"
          ? t.upload.tooBig
          : e === "tooBigAudio"
            ? t.upload.tooBigAudio
            : e;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={t.upload.label}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-accent"
        }`}
      >
        <GradientIcon icon={CloudArrowUp} tone="blue" size={56} />
        <p className="font-semibold">{title ?? t.upload.title}</p>
        <p className="text-muted text-sm">{t.upload.hint}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pending.map((p) => (
            <li key={p.key} className="card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{p.name}</span>
                {p.error ? (
                  <button
                    className="btn-ghost min-h-0 px-2 py-0 text-sm"
                    onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}
                  >
                    {t.common.close}
                  </button>
                ) : (
                  <span className="text-muted text-sm">
                    {p.progress < 1 ? `${Math.round(p.progress * 100)}%` : t.upload.saving}
                  </span>
                )}
              </div>
              {p.error ? (
                <p className="text-danger mt-1 text-sm">{errorText(p.error)}</p>
              ) : (
                <div className="bg-surface-2 mt-2 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-accent h-full transition-all"
                    style={{ width: `${Math.max(5, p.progress * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
