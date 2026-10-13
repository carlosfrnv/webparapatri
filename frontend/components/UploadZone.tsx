"use client";

import { useRef, useState } from "react";
import { errorMessage, uploadFile } from "@/lib/api";
import type { DocumentItem } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.pptx,.txt,.md";

interface Pending {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

/** Zona grande de arrastar e largar, com progresso por ficheiro. */
export function UploadZone({
  subjectId,
  onUploaded,
}: {
  subjectId: string | null;
  onUploaded: (doc: DocumentItem) => void;
}) {
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
        update(key, { error: "Tipo não suportado. Usa PDF, Word (.docx), PowerPoint (.pptx) ou texto." });
        continue;
      }
      if (file.size > MAX_BYTES) {
        update(key, { error: "Demasiado grande (máximo 25 MB)." });
        continue;
      }
      try {
        const doc = await uploadFile<DocumentItem>(file, subjectId, (progress) => update(key, { progress }));
        setPending((list) => list.filter((p) => p.key !== key));
        onUploaded(doc);
      } catch (err) {
        update(key, { error: errorMessage(err) });
      }
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Carregar ficheiros"
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
        <p className="font-semibold">Arrasta para aqui os teus apontamentos</p>
        <p className="text-muted text-sm">ou toca para escolher · PDF, Word, PowerPoint ou texto · até 25 MB</p>
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
                    Fechar
                  </button>
                ) : (
                  <span className="text-muted text-sm">
                    {p.progress < 1 ? `${Math.round(p.progress * 100)}%` : "A guardar…"}
                  </span>
                )}
              </div>
              {p.error ? (
                <p className="text-danger mt-1 text-sm">{p.error}</p>
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
