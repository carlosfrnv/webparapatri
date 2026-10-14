"use client";

import { useRef, useState } from "react";
import { errorMessage, uploadFile, type UploadFields } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { DocumentItem } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.pptx,.txt,.md";

interface Pending {
  key: string;
  name: string;
  progress: number;
  error?: "badType" | "tooBig" | string;
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

      if (!["pdf", "docx", "pptx", "txt", "md"].includes(ext)) {
        update(key, { error: "badType" });
        continue;
      }
      if (file.size > MAX_BYTES) {
        update(key, { error: "tooBig" });
        continue;
      }
      try {
        const doc = await uploadFile<DocumentItem>(file, { ...fields, subjectId }, (progress) =>
          update(key, { progress }),
        );
        setPending((list) => list.filter((p) => p.key !== key));
        onUploaded(doc);
      } catch (err) {
        update(key, { error: errorMessage(err) });
      }
    }
  }

  const errorText = (e: string) => (e === "badType" ? t.upload.badType : e === "tooBig" ? t.upload.tooBig : e);

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
        <span className="text-4xl" aria-hidden="true">
          📥
        </span>
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
