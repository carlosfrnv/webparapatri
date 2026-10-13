"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FlashcardSession } from "@/components/FlashcardSession";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { DocumentItem, DueCard } from "@/lib/types";

export default function StudyPage() {
  const [due, setDue] = useState<{ total_due: number; total_cards: number; cards: DueCard[] } | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [session, setSession] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, list] = await Promise.all([
        api.get<{ total_due: number; total_cards: number; cards: DueCard[] }>("/flashcards/due?limit=40"),
        api.get<DocumentItem[]>("/documents"),
      ]);
      setDue(d);
      setDocs(list.filter((x) => x.status === "ready"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    // O estado só muda depois do pedido (após o await), não de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (session && due) {
    return (
      <>
        <button className="btn-ghost mb-4 px-0" onClick={() => setSession(false)}>
          ← Sair da revisão
        </button>
        <FlashcardSession
          cards={due.cards}
          onFinish={() => {
            setSession(false);
            load();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Estudar" subtitle="Flashcards com repetição espaçada e testes de autoavaliação." />
      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {!due && !error && <Spinner label="A carregar…" />}

      {due && (
        <div className="space-y-8">
          <section className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">🧠 Revisão de flashcards</h2>
              <p className="text-muted mt-1">
                {due.total_cards === 0
                  ? "Ainda não há flashcards. Abre um ficheiro na Biblioteca e elas são criadas automaticamente."
                  : due.total_due === 0
                    ? "Não tens nada para rever agora. Volta mais tarde! 🎉"
                    : `Tens ${due.total_due} ${due.total_due === 1 ? "cartão" : "cartões"} para rever${due.total_due > due.cards.length ? ` (começamos por ${due.cards.length})` : ""}.`}
              </p>
            </div>
            <button className="btn-primary" disabled={due.cards.length === 0} onClick={() => setSession(true)}>
              Começar revisão
            </button>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">📝 Testes</h2>
            <p className="text-muted mb-3">Escolhe um ficheiro para fazeres o teste de 10 perguntas.</p>
            {docs.length === 0 ? (
              <p className="card text-muted p-4">Ainda não tens ficheiros prontos.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/documento/${d.id}#teste`}
                      className="card hover:border-accent flex min-h-14 items-center justify-between gap-3 p-4"
                    >
                      <span className="truncate font-medium">{d.title}</span>
                      <span className="text-accent" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
