"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { queueReview } from "@/lib/offline";
import { useT } from "@/lib/i18n";
import type { DueCard } from "@/lib/types";

// Calidad SM-2 de cada botón (los textos vienen del diccionario, en el mismo orden).
const GRADES = [
  { quality: 1, cls: "bg-danger-soft text-danger" },
  { quality: 3, cls: "bg-warning-soft" },
  { quality: 4, cls: "bg-accent-soft text-accent" },
  { quality: 5, cls: "bg-success-soft text-success" },
];

/** Sesión de repaso: da la vuelta a la tarjeta y la puntúa de 0 a 5 (SM-2). */
export function FlashcardSession({
  cards,
  onFinish,
  showSource = true,
}: {
  cards: DueCard[];
  onFinish?: () => void;
  showSource?: boolean;
}) {
  const t = useT();
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const card = queue[0];

  async function grade(quality: number) {
    if (!card) return;
    setSaving(true);
    setError("");
    try {
      const review = { document_id: card.document_id, card_index: card.card_index, quality };
      try {
        await api.post("/flashcards/review", review);
      } catch (err) {
        // Sin conexión: el repaso se guarda y se envía cuando vuelva internet.
        if ((err as { status?: number }).status !== 0) throw err;
        queueReview(review);
      }
      setFlipped(false);
      // "No lo sabía": vuelve al final de la cola de esta sesión.
      setQueue((q) => (quality < 3 ? [...q.slice(1), q[0]] : q.slice(1)));
      if (quality >= 3) setDone((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Atajos de teclado: espacio da la vuelta, 1-4 puntúa.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        grade(GRADES[Number(e.key) - 1].quality);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="text-5xl" aria-hidden="true">
          🎉
        </span>
        <p className="text-xl font-semibold">{t.flashcards.done}</p>
        <p className="text-muted">{t.flashcards.doneText(done)}</p>
        {onFinish && (
          <button className="btn-primary" onClick={onFinish}>
            {t.flashcards.continue}
          </button>
        )}
      </div>
    );
  }

  const total = done + queue.length;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-muted mb-3 flex items-center justify-between text-sm">
        <span>
          {t.flashcards.of(done, total)}
          {card.is_new && (
            <span className="bg-accent-soft text-accent ml-2 rounded-full px-2 py-0.5 text-xs">{t.flashcards.new}</span>
          )}
        </span>
        {showSource && (
          <Link href={`/documento/${card.document_id}`} className="hover:text-accent truncate pl-3">
            {card.document_title}
          </Link>
        )}
      </div>
      <div className="bg-surface-2 mb-4 h-1.5 overflow-hidden rounded-full">
        <div className="bg-accent h-full transition-all" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
      </div>

      <button
        className="flip block w-full text-left"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? t.flashcards.showQuestion : t.flashcards.showAnswer}
      >
        <div className={`flip-inner relative min-h-64 ${flipped ? "flipped" : ""}`}>
          <div className="flip-face card absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-muted text-xs font-semibold tracking-wide uppercase">{t.flashcards.question}</p>
            <p className="mt-3 text-xl font-medium">{card.front}</p>
            <p className="text-muted mt-6 text-sm">{t.flashcards.tapToSee}</p>
          </div>
          <div className="flip-face flip-back card bg-accent-soft absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-muted text-xs font-semibold tracking-wide uppercase">{t.flashcards.answer}</p>
            <p className="mt-3 text-lg">{card.back}</p>
          </div>
        </div>
      </button>

      {error && <p className="text-danger mt-3 text-sm">{error}</p>}

      {flipped ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map((g, i) => (
            <button
              key={g.quality}
              className={`btn ${g.cls} flex-col gap-0`}
              disabled={saving}
              onClick={() => grade(g.quality)}
            >
              <span>{t.flashcards.grades[i]}</span>
              <span className="hidden text-xs opacity-70 sm:inline">{t.flashcards.key(i + 1)}</span>
            </button>
          ))}
        </div>
      ) : (
        <button className="btn-primary mt-4 w-full" onClick={() => setFlipped(true)}>
          {t.flashcards.showAnswer}
        </button>
      )}
    </div>
  );
}
