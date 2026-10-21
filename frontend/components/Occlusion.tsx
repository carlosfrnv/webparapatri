"use client";

import { ImageSquare, MagicWand, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Spinner } from "@/components/ui";
import { api, apiFetch, errorMessage } from "@/lib/api";

/**
 * Tarjetas de imagen con los nombres tapados (como "Image Occlusion" de Anki): se sube una lámina,
 * se tapan las etiquetas con recuadros (los detecta solo, leyendo el texto en el propio dispositivo,
 * o a mano) y cada recuadro es una tarjeta: "¿qué hay aquí?".
 */

type Lang = "es" | "pt";

/** Recuadro en fracciones de la imagen (0–1). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

const TEXT = {
  es: {
    title: "Imagen con los nombres tapados",
    help: "Sube una lámina o una diapositiva: tapa los nombres y cada uno será una tarjeta («¿qué hay aquí?»).",
    choose: "Elegir imagen",
    detect: "Detectar los nombres",
    detecting: (p: number) => `Leyendo la imagen… ${Math.round(p * 100)} %`,
    detectHint: "La primera vez tarda un poco más (descarga el lector de texto).",
    found: (n: number) => (n === 1 ? "1 nombre detectado" : `${n} nombres detectados`),
    drawHint: "Arrastra sobre la imagen para tapar más zonas. Toca un recuadro para editarlo o quitarlo.",
    label: "Qué hay debajo (respuesta)",
    remove: "Quitar recuadro",
    name: "Título (opcional)",
    namePlaceholder: "p. ej. Corazón y grandes vasos",
    create: (n: number) => (n === 1 ? "Crear 1 tarjeta" : `Crear ${n} tarjetas`),
    created: (n: number) => (n === 1 ? "1 tarjeta creada" : `${n} tarjetas creadas`),
    clear: "Quitar todos",
    question: "¿Qué hay en el recuadro marcado?",
    noLabel: "(sin nombre)",
  },
  pt: {
    title: "Imagem com os nomes tapados",
    help: "Carrega uma lâmina ou um diapositivo: tapa os nomes e cada um será um cartão («o que está aqui?»).",
    choose: "Escolher imagem",
    detect: "Detetar os nomes",
    detecting: (p: number) => `A ler a imagem… ${Math.round(p * 100)} %`,
    detectHint: "Da primeira vez demora um pouco mais (descarrega o leitor de texto).",
    found: (n: number) => (n === 1 ? "1 nome detetado" : `${n} nomes detetados`),
    drawHint: "Arrasta sobre a imagem para tapar mais zonas. Toca num retângulo para o editar ou tirar.",
    label: "O que está por baixo (resposta)",
    remove: "Tirar retângulo",
    name: "Título (opcional)",
    namePlaceholder: "p. ex. Coração e grandes vasos",
    create: (n: number) => (n === 1 ? "Criar 1 cartão" : `Criar ${n} cartões`),
    created: (n: number) => (n === 1 ? "1 cartão criado" : `${n} cartões criados`),
    clear: "Tirar todos",
    question: "O que está no retângulo marcado?",
    noLabel: "(sem nome)",
  },
};

export const occlusionText = (lang: Lang) => TEXT[lang];

// ---------- Vista (estudio y lista de tarjetas) ----------

/** La lámina con todos los nombres tapados; el de la pregunta, resaltado (o destapado al ver la respuesta). */
export function OcclusionView({
  url,
  boxes,
  target,
  revealed,
}: {
  url: string;
  boxes: Box[];
  target: number;
  revealed: boolean;
}) {
  return (
    <div className="relative mx-auto w-fit max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal del almacenamiento */}
      <img src={url} alt="" className="block max-h-[60vh] max-w-full rounded-lg" draggable={false} />
      {boxes.map((b, i) => {
        const isTarget = i === target;
        if (isTarget && revealed)
          return (
            <div
              key={i}
              className="absolute rounded-sm border-2 border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.3)]"
              style={pos(b)}
            />
          );
        return (
          <div
            key={i}
            className={`absolute flex items-center justify-center rounded-sm border text-sm font-bold ${
              isTarget ? "border-accent bg-accent text-accent-contrast" : "border-pink-300 bg-pink-100"
            }`}
            style={pos(b)}
          >
            {isTarget ? "?" : ""}
          </div>
        );
      })}
    </div>
  );
}

const pos = (b: Box) => ({
  left: `${b.x * 100}%`,
  top: `${b.y * 100}%`,
  width: `${b.w * 100}%`,
  height: `${b.h * 100}%`,
});

// ---------- Editor ----------

/** Reduce la imagen (máx. 1600 px) y la pasa a JPEG para que pese poco. */
async function prepareImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error("toBlob"))), "image/jpeg", 0.88),
  );
  return { canvas, blob, url: URL.createObjectURL(blob) };
}

interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Lee el texto de la lámina en el propio dispositivo (sin IA) y devuelve un recuadro por etiqueta. */
async function detectLabels(canvas: HTMLCanvasElement, onProgress: (p: number) => void): Promise<Box[]> {
  const { createWorker } = await import("tesseract.js");
  // Todo se sirve desde la propia web (public/tesseract), sin depender de un CDN.
  const worker = await createWorker(["por", "eng", "spa"], 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/",
    langPath: "/tesseract/lang",
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    const W = canvas.width;
    const H = canvas.height;
    const kept = lines
      .map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() }))
      .filter(
        (l) =>
          l.confidence > 45 &&
          /\p{L}{2,}/u.test(l.text) &&
          // Las etiquetas son líneas cortas, no párrafos ni títulos enormes.
          l.text.length <= 60 &&
          l.bbox.y1 - l.bbox.y0 < H * 0.08,
      )
      .sort((p, q) => p.bbox.y0 - q.bbox.y0);
    // Una etiqueta partida en dos líneas («Tronco / pulmonar») es un solo nombre.
    const groups: { x0: number; y0: number; x1: number; y1: number; text: string; lh: number }[] = [];
    for (const l of kept) {
      const { x0, y0, x1, y1 } = l.bbox;
      const lh = y1 - y0;
      const g = groups.find(
        (g) =>
          y0 - g.y1 < Math.max(lh, g.lh) * 0.8 &&
          y0 >= g.y0 &&
          Math.min(x1, g.x1) - Math.max(x0, g.x0) > Math.min(x1 - x0, g.x1 - g.x0) * 0.3,
      );
      if (g)
        Object.assign(g, {
          x0: Math.min(g.x0, x0),
          x1: Math.max(g.x1, x1),
          y1: Math.max(g.y1, y1),
          text: `${g.text} ${l.text}`,
        });
      else groups.push({ x0, y0, x1, y1, text: l.text, lh });
    }
    // Un poco de margen para que no asome ninguna letra.
    return groups.map((g) => {
      const px = Math.max(8, g.lh * 1.0);
      const py = Math.max(3, g.lh * 0.25);
      const x = Math.max(0, g.x0 - px);
      const y = Math.max(0, g.y0 - py);
      return {
        x: x / W,
        y: y / H,
        w: (Math.min(W, g.x1 + px) - x) / W,
        h: (Math.min(H, g.y1 + py) - y) / H,
        label: g.text,
      };
    });
  } finally {
    await worker.terminate();
  }
}

export function OcclusionEditor({ deckId, lang, onCreated }: { deckId: string; lang: Lang; onCreated: () => void }) {
  const tx = TEXT[lang];
  const [img, setImg] = useState<{ canvas: HTMLCanvasElement; blob: Blob; url: string } | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setMsg("");
    try {
      const prepared = await prepareImage(file);
      setImg(prepared);
      setBoxes([]);
      setSelected(null);
    } catch (err) {
      setMsg(errorMessage(err));
    }
  };

  const detect = async () => {
    if (!img) return;
    setProgress(0);
    setMsg("");
    try {
      const found = await detectLabels(img.canvas, setProgress);
      setBoxes((b) => [...b, ...found]);
      setMsg(tx.found(found.length));
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const at = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const create = async () => {
    if (!img || !boxes.length) return;
    setBusy(true);
    setMsg("");
    try {
      const form = new FormData();
      form.append("file", img.blob, "lamina.jpg");
      const res = await apiFetch(`/decks/${deckId}/images`, { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok || !body.path) throw new Error(body.error ?? tx.title);
      const front = title.trim() ? `🖼️ ${title.trim()}` : `🖼️ ${tx.question}`;
      await api.post(`/decks/${deckId}/cards`, {
        cards: boxes.map((b, i) => ({
          front,
          back: b.label.trim() || tx.noLabel,
          image_path: body.path,
          occlusion: { boxes, target: i },
        })),
      });
      setMsg(tx.created(boxes.length));
      setImg(null);
      setBoxes([]);
      setTitle("");
      onCreated();
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sel = selected !== null ? boxes[selected] : null;

  return (
    <div className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <ImageSquare size={20} weight="duotone" aria-hidden="true" /> {tx.title}
      </h2>
      <p className="text-muted text-sm">{tx.help}</p>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          <UploadSimple size={18} aria-hidden="true" /> {tx.choose}
        </button>
        {img && (
          <button className="btn-secondary" onClick={detect} disabled={busy || progress !== null}>
            <MagicWand size={18} aria-hidden="true" /> {tx.detect}
          </button>
        )}
        {img && boxes.length > 0 && (
          <button
            className="btn-ghost"
            onClick={() => {
              setBoxes([]);
              setSelected(null);
            }}
          >
            {tx.clear}
          </button>
        )}
      </div>
      {progress !== null && (
        <div className="space-y-1">
          <Spinner label={tx.detecting(progress)} />
          <p className="text-muted text-xs">{tx.detectHint}</p>
        </div>
      )}

      {img && (
        <>
          <p className="text-muted text-sm">{tx.drawHint}</p>
          <div
            ref={stage}
            className="relative mx-auto w-fit max-w-full cursor-crosshair touch-none select-none"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).dataset.box) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = at(e);
              setSelected(null);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const p = at(e);
              const s = drag.current;
              setDraft({
                x: Math.min(s.x, p.x),
                y: Math.min(s.y, p.y),
                w: Math.abs(p.x - s.x),
                h: Math.abs(p.y - s.y),
                label: "",
              });
            }}
            onPointerUp={() => {
              if (draft && draft.w > 0.01 && draft.h > 0.008) {
                setBoxes((b) => [...b, draft]);
                setSelected(boxes.length);
              }
              drag.current = null;
              setDraft(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen local recién elegida */}
            <img src={img.url} alt="" className="block max-h-[70vh] max-w-full rounded-lg" draggable={false} />
            {boxes.map((b, i) => (
              <button
                key={i}
                data-box="1"
                className={`absolute rounded-sm border-2 ${
                  selected === i ? "border-accent bg-accent/50" : "border-pink-400 bg-pink-200/80"
                }`}
                style={pos(b)}
                onClick={() => setSelected(i)}
                aria-label={b.label || tx.noLabel}
              />
            ))}
            {draft && <div className="border-accent absolute border-2 border-dashed" style={pos(draft)} />}
          </div>

          {sel && selected !== null && (
            <div className="bg-surface-2 flex flex-wrap items-end gap-2 rounded-xl p-3">
              <label className="min-w-0 flex-1">
                <span className="text-sm font-semibold">{tx.label}</span>
                <input
                  className="input mt-1"
                  value={sel.label}
                  autoFocus
                  onChange={(e) =>
                    setBoxes((all) => all.map((b, i) => (i === selected ? { ...b, label: e.target.value } : b)))
                  }
                />
              </label>
              <button
                className="btn-ghost text-danger"
                onClick={() => {
                  setBoxes((all) => all.filter((_, i) => i !== selected));
                  setSelected(null);
                }}
              >
                <Trash size={18} aria-hidden="true" /> {tx.remove}
              </button>
            </div>
          )}

          <label className="block">
            <span className="font-semibold">{tx.name}</span>
            <input
              className="input mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tx.namePlaceholder}
              maxLength={120}
            />
          </label>
          <button className="btn-primary" onClick={create} disabled={busy || boxes.length === 0}>
            <Plus size={18} aria-hidden="true" /> {tx.create(boxes.length)}
          </button>
        </>
      )}
      {msg && <p className="text-sm font-semibold">{msg}</p>}
    </div>
  );
}
