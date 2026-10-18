"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { QuizItem } from "@/lib/types";
import { Quiz } from "./Quiz";
import { ErrorBox, Spinner } from "./ui";

type FigureQuestion = Omit<QuizItem, "document_id" | "question_index"> & { figure: number };

/**
 * Test con imágenes: preguntas que la IA hace mirando las figuras de sus apuntes.
 * Si el archivo se subió antes de guardar las imágenes, primero hay que "leer las imágenes".
 */
export function FigureQuiz({ documentId }: { documentId: string }) {
  const t = useT();
  const tq = t.quiz;
  const lang = useLang();
  const [questions, setQuestions] = useState<QuizItem[] | null>(null);
  const [needsFigures, setNeedsFigures] = useState(false);
  const [reading, setReading] = useState(false);
  const [readOnce, setReadOnce] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setQuestions(null);
    try {
      const r = await api.get<{ needsFigures: boolean; questions: FigureQuestion[] }>(
        `/documents/${documentId}/figure-quiz`,
      );
      setNeedsFigures(r.needsFigures);
      setQuestions(r.questions.map((q, i) => ({ ...q, document_id: documentId, question_index: i })));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [documentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial (y al cambiar de idioma)
    load();
  }, [load, lang]);

  async function readImages() {
    setReading(true);
    setError("");
    try {
      await api.post(`/documents/${documentId}/figures`);
      // Se espera a que termine de leerlas (el servidor lo hace en segundo plano).
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000));
        const s = await api.get<{ running: boolean; failed: boolean }>(`/documents/${documentId}/figures`);
        if (s.failed) throw new Error(t.document.figures.failed);
        if (!s.running) break;
      }
      setReadOnce(true);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReading(false);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (reading) return <Spinner label={tq.imagesReading} />;
  if (!questions) return <Spinner label={tq.imagesLoading} />;

  if (needsFigures || questions.length === 0)
    return (
      <div className="card mx-auto max-w-2xl p-5 text-sm">
        <p className="text-muted">{readOnce || !needsFigures ? tq.imagesNone : tq.imagesIntro}</p>
        {needsFigures && !readOnce && (
          <button className="btn-primary mt-3" onClick={readImages}>
            {tq.imagesRead}
          </button>
        )}
      </div>
    );

  return <Quiz key={questions.length} documentId={documentId} questions={questions} images />;
}
