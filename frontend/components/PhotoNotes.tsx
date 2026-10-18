"use client";

import { Camera, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { errorMessage, uploadPhotos } from "@/lib/api";
import { dateLocale, useLang, useT } from "@/lib/i18n";
import type { DocumentItem } from "@/lib/types";

/**
 * Fotos de apuntes a mano o de la pizarra: se hacen o eligen varias, se reducen en el iPad (así suben rápido)
 * y el servidor las junta en un PDF. Al procesarlo, la IA lee la letra y lo pasa a texto: queda como unos
 * apuntes más (resumen, flashcards, test…).
 */

const MAX_PHOTOS = 30;
const MAX_SIDE = 2000;

/** Foto reducida a JPEG de como mucho 2000 px (en el iPad también convierte las fotos HEIC). */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("foto"))), "image/jpeg", 0.85),
  );
}

export function PhotoNotes({
  subjectId,
  onUploaded,
}: {
  subjectId: string | null;
  onUploaded: (doc: DocumentItem) => void;
}) {
  const t = useT();
  const tp = t.photoNotes;
  const lang = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState("");

  // Al salir se liberan las vistas previas.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setProblem("");
    setBusy(true);
    try {
      const list = [...files].slice(0, MAX_PHOTOS - photos.length);
      const shrunk = await Promise.all(list.map((f) => shrink(f).catch(() => null)));
      const ok = shrunk.filter((b): b is Blob => !!b).map((blob) => ({ blob, url: URL.createObjectURL(blob) }));
      if (ok.length < list.length) setProblem(tp.badPhoto);
      setPhotos((p) => [...p, ...ok]);
      if (!title) {
        const now = new Date();
        setTitle(`${tp.defaultTitle} ${now.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short" })}`);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function send() {
    setBusy(true);
    setProblem("");
    try {
      const doc = await uploadPhotos<DocumentItem>(
        photos.map((p) => p.blob),
        { subjectId, title: title.trim() || tp.defaultTitle },
        setProgress,
      );
      onUploaded(doc);
      setPhotos([]);
      setTitle("");
      setProgress(0);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 p-4">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      {photos.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={() => input.current?.click()} disabled={busy}>
            <Camera size={18} weight="duotone" aria-hidden="true" /> {busy ? tp.preparing : tp.button}
          </button>
          <p className="text-muted min-w-[12rem] flex-1 text-xs">{tp.hint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold">{tp.selected(photos.length)}</p>
          <ul className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <li key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local */}
                <img
                  src={p.url}
                  alt={tp.photoN(i + 1)}
                  className="border-border h-24 w-20 rounded-lg border object-cover"
                />
                <span className="bg-text text-surface absolute bottom-1 left-1 rounded px-1.5 text-[10px] font-bold">
                  {i + 1}
                </span>
                <button
                  className="bg-surface absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full shadow"
                  onClick={() => setPhotos((list) => list.filter((x) => x.url !== p.url))}
                  aria-label={tp.removePhoto}
                  disabled={busy}
                >
                  <X size={12} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
            {photos.length < MAX_PHOTOS && (
              <li>
                <button
                  className="border-border text-muted flex h-24 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed text-xs"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                >
                  <Camera size={20} aria-hidden="true" /> {tp.more}
                </button>
              </li>
            )}
          </ul>
          <label className="block text-sm">
            <span className="text-muted mb-1 block text-xs font-semibold">{tp.titleLabel}</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={send} disabled={busy}>
              {busy && progress > 0 ? `${tp.uploading} ${Math.round(progress * 100)} %` : tp.upload(photos.length)}
            </button>
            <button className="btn-ghost" onClick={() => setPhotos([])} disabled={busy}>
              {t.common.cancel}
            </button>
          </div>
          <p className="text-muted text-xs">{tp.order}</p>
        </div>
      )}
      {problem && <p className="text-danger mt-2 text-sm">{problem}</p>}
    </div>
  );
}
