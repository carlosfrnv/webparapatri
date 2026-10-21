"use client";

import {
  ArrowCounterClockwise,
  Brain,
  CaretRight,
  Cards,
  CheckCircle,
  Exam,
  Microphone,
  NotePencil,
  Shuffle,
  Stack,
  Timer,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { FlashcardSession } from "@/components/FlashcardSession";
import { GradientIcon } from "@/components/GradientIcon";
import { subjectLook } from "@/components/subjectLook";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import { offlineCards, saveOfflineCards, syncReviews } from "@/lib/offline";
import type { DocumentItem, DueCard, Subject } from "@/lib/types";

interface DueResponse {
  total_due: number;
  total_cards: number;
  cards: DueCard[];
  by_document?: Record<string, { due: number; total: number }>;
}

function StudyPageContent() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  // ?asignatura=<id> (p. ej., desde el calendario) o ?documento=<id>: repasar solo eso.
  const subjectId = params.get("asignatura");
  const documentId = params.get("documento");
  const [due, setDue] = useState<DueResponse | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [session, setSession] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState<DueCard[] | null>(null);
  const [offlineSession, setOfflineSession] = useState(false);
  const [synced, setSynced] = useState(0);

  // Al cambiar de idioma se vuelven a pedir los datos (tarjetas y nombres de asignaturas en ese idioma).
  const lang = useLang();
  const load = useCallback(async () => {
    try {
      const filter = documentId
        ? `&document_id=${encodeURIComponent(documentId)}`
        : subjectId
          ? `&subject_id=${encodeURIComponent(subjectId)}`
          : "";
      // Primero se envían los repasos hechos sin conexión (así las tarjetas pendientes ya los tienen en cuenta).
      const sent = await syncReviews();
      if (sent) setSynced(sent);
      const [d, list, subs, m] = await Promise.all([
        api.get<DueResponse>(`/flashcards/due?limit=40${filter}`),
        api.get<DocumentItem[]>("/documents"),
        api.get<Subject[]>("/subjects"),
        api.get<{ items: { subject_id?: string | null }[] }>("/quiz/mistakes").catch(() => ({ items: [] })),
      ]);
      setMistakes(m.items.filter((q) => !subjectId || q.subject_id === subjectId).length);
      setDue(d);
      setOffline(null);
      // Copia en el dispositivo para poder repasar sin internet (solo el repaso de todo).
      if (!subjectId && !documentId) saveOfflineCards(d.cards, lang);
      setDocs(list.filter((x) => x.status === "ready"));
      setSubjects(subs);
    } catch (err) {
      if ((err as { status?: number }).status === 0) setOffline(offlineCards()?.cards ?? null);
      setError(errorMessage(err));
    }
  }, [subjectId, documentId, lang]);

  useEffect(() => {
    // El estado solo cambia después de la petición (tras el await), no de forma síncrona.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, lang]);

  if (offlineSession && offline) {
    return (
      <>
        <button className="btn-ghost mb-4 px-0" onClick={() => setOfflineSession(false)}>
          {t.studyPage.exit}
        </button>
        <FlashcardSession
          cards={offline}
          onFinish={() => {
            setOfflineSession(false);
            setOffline(offlineCards()?.cards ?? null);
            load();
          }}
        />
      </>
    );
  }

  if (session && due) {
    return (
      <>
        <button className="btn-ghost mb-4 px-0" onClick={() => setSession(false)}>
          {t.studyPage.exit}
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

  const filtered = Boolean(subjectId || documentId);
  const filterName = documentId
    ? docs.find((d) => d.id === documentId)?.title
    : subjects.find((s) => s.id === subjectId)?.name;
  const byDoc = due?.by_document ?? {};

  // Grupos por asignatura (en el orden de la Biblioteca) y, al final, los archivos sin asignatura.
  const groups = [
    ...subjects.map((s) => ({
      key: s.id,
      subject: s as Subject | null,
      docs: docs.filter((d) => d.subject_id === s.id),
    })),
    {
      key: "none",
      subject: null,
      docs: docs.filter((d) => !d.subject_id || !subjects.some((s) => s.id === d.subject_id)),
    },
  ]
    .filter((g) => g.docs.length > 0)
    .filter((g) => !subjectId || g.key === subjectId)
    .map((g) => ({
      ...g,
      docs: documentId ? g.docs.filter((d) => d.id === documentId) : g.docs,
      due: g.docs.reduce((sum, d) => sum + (byDoc[d.id]?.due ?? 0), 0),
    }))
    .filter((g) => g.docs.length > 0);

  return (
    <>
      <PageHeader icon={Brain} title={t.studyPage.title} subtitle={t.studyPage.subtitle} />

      {filtered && filterName && (
        <p className="bg-accent-soft mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm">
          <span>{t.studyPage.onlySubject(filterName)}</span>
          <button
            className="text-accent font-medium"
            onClick={() => {
              setDue(null);
              router.replace("/estudiar");
            }}
          >
            {t.studyPage.showAll}
          </button>
        </p>
      )}

      {synced > 0 && <p className="bg-success-soft mb-4 rounded-xl p-3 text-sm">{t.studyPage.synced(synced)}</p>}
      {error && offline && offline.length > 0 && (
        <section className="card border-accent mb-4 flex flex-col items-start gap-4 border-2 p-5 sm:flex-row sm:items-center">
          <GradientIcon icon={Cards} tone="violet" size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">📴 {t.studyPage.offlineTitle}</h2>
            <p className="text-muted mt-0.5 text-sm">{t.studyPage.offlineText(offline.length)}</p>
          </div>
          <button className="btn-primary" onClick={() => setOfflineSession(true)}>
            {t.studyPage.offlineStart}
          </button>
        </section>
      )}
      {error && !offline?.length && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            load();
          }}
        />
      )}
      {!due && !error && <Spinner label={t.common.loading} />}

      {due && (
        <div className="space-y-8">
          {/* Repaso de lo elegido (o de todo mezclado) */}
          <section className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <GradientIcon icon={filtered ? Cards : Shuffle} tone="violet" size={52} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{filtered ? t.studyPage.reviewTitle : t.studyPage.generalTitle}</h2>
              <p className="text-muted mt-0.5 text-sm">
                {due.total_cards === 0
                  ? t.studyPage.noCards
                  : due.total_due === 0
                    ? t.studyPage.nothingDue
                    : filtered
                      ? t.studyPage.due(due.total_due, due.cards.length)
                      : t.studyPage.generalText(due.total_due)}
              </p>
            </div>
            <button className="btn-primary" disabled={due.cards.length === 0} onClick={() => setSession(true)}>
              {t.studyPage.start}
            </button>
          </section>

          {/* Trabajos: índice, fuentes, borradores y revisión */}
          <section className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <GradientIcon icon={NotePencil} tone="amber" size={52} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{t.assignments.title}</h2>
              <p className="text-muted mt-0.5 text-sm">{t.assignments.subtitle}</p>
            </div>
            <Link href="/trabajos" className="btn-secondary">
              {t.assignments.open}
            </Link>
          </section>

          {/* Láminas de anatomía ya hechas */}
          <section className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <GradientIcon icon={Stack} tone="teal" size={52} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{t.tools.plates.title}</h2>
              <p className="text-muted mt-0.5 text-sm">{t.tools.plates.subtitle}</p>
            </div>
            <Link href="/laminas" className="btn-secondary">
              {t.tools.plates.open}
            </Link>
          </section>

          {/* Mazos tipo Anki (tarjetas propias, aparte de las de los apuntes) */}
          <section className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <GradientIcon icon={Cards} tone="blue" size={52} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{t.decks.title}</h2>
              <p className="text-muted mt-0.5 text-sm">{t.decks.subtitle}</p>
            </div>
            <Link href="/mazos" className="btn-secondary">
              {t.decks.open}
            </Link>
          </section>

          {/* Pomodoro */}
          <section className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <GradientIcon icon={Timer} tone="amber" size={52} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{t.pomodoro.title}</h2>
              <p className="text-muted mt-0.5 text-sm">{t.pomodoro.subtitle}</p>
            </div>
            <Link href="/pomodoro" className="btn-secondary">
              {t.pomodoro.start}
            </Link>
          </section>

          {/* Repaso de fallos */}
          <section className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <GradientIcon icon={ArrowCounterClockwise} tone="pink" size={52} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">{t.mistakes.title}</h2>
              <p className="text-muted mt-0.5 text-sm">{t.mistakes.count(mistakes)}</p>
            </div>
            <Link
              href={subjectId ? `/fallos?asignatura=${subjectId}` : "/fallos"}
              className={`btn-secondary ${mistakes === 0 ? "pointer-events-none opacity-50" : ""}`}
              aria-disabled={mistakes === 0}
            >
              {t.mistakes.start}
            </Link>
          </section>

          {groups.length === 0 ? (
            <p className="card text-muted p-4">{t.studyPage.noReady}</p>
          ) : (
            <section className="space-y-5">
              {!filtered && <h2 className="text-lg font-bold">{t.studyPage.bySubject}</h2>}
              {groups.map((g) => {
                const look = g.subject ? subjectLook(g.subject) : null;
                return (
                  <div key={g.key} className="card overflow-hidden p-0">
                    <div className="border-border flex flex-wrap items-center gap-3 border-b p-4 sm:p-5">
                      {look ? (
                        <GradientIcon icon={look.icon} tone={look.tone} />
                      ) : (
                        <GradientIcon icon={Cards} tone="slate" />
                      )}
                      <div className="min-w-[10rem] flex-1">
                        <p className="font-display text-lg leading-snug font-bold">
                          {g.subject?.name ?? t.studyPage.unassigned}
                        </p>
                        <p className="text-muted text-sm">
                          {g.due > 0 ? t.studyPage.dueBadge(g.due) : t.studyPage.upToDate}
                        </p>
                      </div>
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                        {!filtered && g.subject && g.due > 0 && (
                          <Link
                            href={`/estudiar?asignatura=${g.subject.id}`}
                            className="btn-secondary min-h-10 flex-1 text-sm sm:flex-none"
                          >
                            <Cards size={18} weight="duotone" aria-hidden="true" /> {t.studyPage.reviewSubject}
                          </Link>
                        )}
                        {g.subject && (
                          <Link
                            href={`/simulacro?asignatura=${g.subject.id}`}
                            className="btn-secondary min-h-10 flex-1 text-sm sm:flex-none"
                          >
                            <Timer size={18} weight="duotone" aria-hidden="true" /> {t.mock.button}
                          </Link>
                        )}
                        {g.subject && (
                          <Link
                            href={`/oral?asignatura=${g.subject.id}`}
                            className="btn-secondary min-h-10 flex-1 text-sm sm:flex-none"
                          >
                            <Microphone size={18} weight="duotone" aria-hidden="true" /> {t.oral.button}
                          </Link>
                        )}
                      </div>
                    </div>
                    <ul className="divide-border divide-y">
                      {g.docs.map((d) => {
                        const counts = byDoc[d.id];
                        return (
                          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                            <Link
                              href={`/documento/${d.id}`}
                              className="hover:text-accent min-w-0 flex-1 basis-full font-medium sm:basis-auto"
                            >
                              <span className="block">{d.title}</span>
                              <span className="text-muted text-xs font-normal">
                                {!counts || counts.total === 0
                                  ? t.studyPage.noCardsDoc
                                  : counts.due > 0
                                    ? t.studyPage.dueOf(counts.due, counts.total)
                                    : t.studyPage.upToDate}
                              </span>
                            </Link>
                            <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
                              {counts && counts.due > 0 ? (
                                <Link
                                  href={`/estudiar?documento=${d.id}`}
                                  className="btn-secondary min-h-9 px-3 text-sm"
                                  aria-label={`${t.studyPage.flashcards}: ${d.title}`}
                                >
                                  <Cards size={18} weight="duotone" aria-hidden="true" /> {t.studyPage.flashcards}
                                </Link>
                              ) : counts && counts.total > 0 ? (
                                <span className="text-success inline-flex min-h-9 items-center gap-1 px-2 text-sm font-medium">
                                  <CheckCircle size={18} weight="fill" aria-hidden="true" /> {t.studyPage.upToDate}
                                </span>
                              ) : null}
                              <Link
                                href={`/documento/${d.id}#test`}
                                className="btn-secondary min-h-9 px-3 text-sm"
                                aria-label={`${t.studyPage.test}: ${d.title}`}
                              >
                                <Exam size={18} weight="duotone" aria-hidden="true" /> {t.studyPage.test}
                                <CaretRight size={14} aria-hidden="true" />
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default function StudyPage() {
  // useSearchParams necesita un Suspense alrededor.
  return (
    <Suspense>
      <StudyPageContent />
    </Suspense>
  );
}
