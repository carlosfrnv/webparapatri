"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDocError } from "@/components/DocumentList";
import { FigureQuiz } from "@/components/FigureQuiz";
import { HighlightTools, useHighlightPaint, useHighlights } from "@/components/Highlights";
import { FlashcardSession } from "@/components/FlashcardSession";
import { MindMapTab } from "@/components/MindMap";
import { Quiz } from "@/components/Quiz";
import { ReadAloud } from "@/components/ReadAloud";
import { SourceChips } from "@/components/Sources";
import { SummaryWithFigures, useFigureImages } from "@/components/SummaryFigures";
import { ErrorBox, fileIcon, Spinner, StatusBadge } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { DocumentItem, DueCard, StudyMaterials } from "@/lib/types";

const TABS = ["resumen", "conceptos", "glosario", "esquema", "flashcards", "test", "archivo"] as const;
type TabId = (typeof TABS)[number];

function useHashTab(): [TabId, (t: TabId) => void] {
  const [tab, setTab] = useState<TabId>("resumen");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as TabId;
      if (TABS.includes(h)) setTab(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return [
    tab,
    (t) => {
      setTab(t);
      history.replaceState(null, "", `#${t}`);
    },
  ];
}

function OriginalFile({ doc }: { doc: DocumentItem }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<{ url: string }>(`/documents/${doc.id}/file`)
      .then((r) => setUrl(r.url))
      .catch((err) => setError(errorMessage(err)));
  }, [doc.id]);

  if (error) return <ErrorBox message={error} />;
  if (!url) return <Spinner label={t.document.openingFile} />;
  const isPdf = doc.mime_type?.includes("pdf");
  return (
    <div className="space-y-3">
      <a href={url} target="_blank" rel="noreferrer" className="btn-secondary">
        {fileIcon(doc.mime_type)} {isPdf ? t.document.openNewWindow : t.document.download}
      </a>
      {/* Clase grabada: se puede volver a escuchar */}
      {doc.mime_type?.startsWith("audio/") && (
        <audio controls preload="metadata" src={url} className="w-full">
          <track kind="captions" />
        </audio>
      )}
      {isPdf && (
        <iframe
          src={url}
          title={doc.title}
          className="border-border hidden h-[75vh] w-full rounded-2xl border md:block"
        />
      )}
    </div>
  );
}

function FlashcardsTab({ doc, materials }: { doc: DocumentItem; materials: StudyMaterials }) {
  const t = useT();
  const [due, setDue] = useState<DueCard[] | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const loadDue = useCallback(() => {
    api
      .get<{ cards: DueCard[] }>(`/flashcards/due?document_id=${doc.id}&limit=100`)
      .then((r) => setDue(r.cards))
      .catch(() => setDue([]));
  }, [doc.id]);
  useEffect(loadDue, [loadDue]);

  if (reviewing && due) {
    return (
      <FlashcardSession
        cards={due}
        showSource={false}
        onFinish={() => {
          setReviewing(false);
          loadDue();
        }}
      />
    );
  }

  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <p>{t.document.cardsDue(due?.length ?? "…", materials.flashcards.length)}</p>
        <button className="btn-primary" disabled={!due?.length} onClick={() => setReviewing(true)}>
          {t.document.reviewCards}
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {materials.flashcards.map((c, i) => (
          <li key={i} className="card p-4">
            <p className="font-medium">{c.front}</p>
            <p className="border-border text-muted mt-2 border-t pt-2">{c.back}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Test normal o con imágenes de sus apuntes. */
function TestTab({ doc, materials }: { doc: DocumentItem; materials: StudyMaterials }) {
  const t = useT();
  const [mode, setMode] = useState<"normal" | "images">("normal");
  return (
    <>
      <div className="bg-surface-2 mx-auto mb-4 flex w-fit gap-1 rounded-xl p-1" role="group">
        {(["normal", "images"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${mode === m ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
          >
            {m === "normal" ? t.quiz.normal : t.quiz.withImages}
          </button>
        ))}
      </div>
      {mode === "normal" ? (
        <Quiz
          documentId={doc.id}
          questions={materials.quiz.map((q, i) => ({ ...q, document_id: doc.id, question_index: i }))}
        />
      ) : (
        <FigureQuiz documentId={doc.id} />
      )}
    </>
  );
}

/** Leer las figuras de un archivo subido antes de que la IA mirase las imágenes. */
function FiguresPanel({
  doc,
  onRegenerate,
  busy,
  saved,
  onRead,
}: {
  doc: DocumentItem;
  onRegenerate: () => void;
  busy: boolean;
  /** Figuras guardadas como imagen (las que salen en el resumen). */
  saved: number;
  onRead: () => void;
}) {
  const t = useT();
  const tf = t.document.figures;
  const [state, setState] = useState<{ count: number; running: boolean; failed: boolean } | null>(null);
  // Veces que ha pulsado "leer" en esta visita (para volver a consultar el estado y mostrar el aviso).
  const [runs, setRuns] = useState(0);
  const justRead = runs > 0;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await api.get<{ count: number; running: boolean; failed: boolean }>(`/documents/${doc.id}/figures`);
        if (!alive) return;
        setState(s);
        if (s.running) timer = setTimeout(poll, 5000);
        // Acaba de leerlas: el resumen vuelve a pedir las imágenes.
        else if (runs > 0) onRead();
      } catch {
        /* si falla, simplemente no se muestra */
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [doc.id, runs, onRead]);

  if (!state) return null;

  async function start() {
    setState((s) => (s ? { ...s, running: true, failed: false } : s));
    try {
      await api.post(`/documents/${doc.id}/figures`);
      setRuns((n) => n + 1);
    } catch {
      setState((s) => (s ? { ...s, running: false, failed: true } : s));
    }
  }

  return (
    <div className="card mt-6 p-4 text-sm sm:p-5">
      <p className="font-semibold">{tf.title}</p>
      {state.running ? (
        <p className="text-muted mt-2 flex items-center gap-2" role="status">
          <span
            className="border-border border-t-accent h-4 w-4 animate-spin rounded-full border-2"
            aria-hidden="true"
          />
          {tf.reading}
        </p>
      ) : (
        <>
          <p className="text-muted mt-1">
            {state.failed ? tf.failed : state.count > 0 ? tf.done(state.count) : justRead ? tf.none : tf.intro}
          </p>
          {!justRead && state.count > 0 && saved === 0 && <p className="text-muted mt-1">{tf.needImages}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {justRead && state.count > 0 && !state.failed ? (
              <>
                <p className="bg-accent-soft w-full rounded-xl p-3">{tf.redoHint}</p>
                <button className="btn-primary" disabled={busy} onClick={onRegenerate}>
                  {busy ? t.document.regenerating : t.document.regenerate}
                </button>
              </>
            ) : (
              <button className="btn-secondary" onClick={start}>
                {state.count > 0 ? tf.reread : tf.read}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function DocumentPage() {
  const t = useT();
  const lang = useLang();
  const docError = useDocError();
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [materials, setMaterials] = useState<StudyMaterials | null>(null);
  const [error, setError] = useState("");
  const [studyError, setStudyError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useHashTab();
  const [figVersion, setFigVersion] = useState(0);
  const figures = useFigureImages(id, figVersion);
  const figuresRead = useCallback(() => setFigVersion((v) => v + 1), []);
  // Subrayados y notas del resumen.
  const summaryRef = useRef<HTMLDivElement>(null);
  const [highlights, setHighlights] = useHighlights(id);
  useHighlightPaint(summaryRef, highlights, `${tab}-${materials?.generated_at}-${figures.length}`);

  const loadStudy = useCallback(
    async (regenerate = false) => {
      setStudyError("");
      setGenerating(true);
      try {
        const m = regenerate
          ? await api.post<StudyMaterials>(`/documents/${id}/study/regenerate`)
          : await api.get<StudyMaterials>(`/documents/${id}/study`);
        setMaterials(m);
      } catch (err) {
        setStudyError(errorMessage(err));
      } finally {
        setGenerating(false);
      }
    },
    [id],
  );

  useEffect(() => {
    api
      .get<DocumentItem>(`/documents/${id}`)
      .then((d) => {
        setDoc(d);
        // La biblioteca de referencia solo sirve para buscar: no tiene material de estudio.
        if (d.status === "ready" && d.source_type !== "referencia") loadStudy();
      })
      .catch((err) => setError(errorMessage(err)));
    // Al cambiar de idioma se vuelve a pedir: llega la versión guardada o se traduce la primera vez.
  }, [id, loadStudy, lang]);

  if (error) return <ErrorBox message={error} />;
  if (!doc) return <Spinner label={t.common.loading} />;

  const isRef = doc.source_type === "referencia";
  const backHref = isRef ? "/referencia" : doc.subject_id ? `/asignatura/${doc.subject_id}` : "/biblioteca";
  const visibleTabs = isRef ? (["archivo"] as const) : TABS;
  const activeTab: TabId = isRef ? "archivo" : tab;
  // Mientras llega la versión en el idioma nuevo, se avisa de que se está traduciendo.
  const translating = generating && materials && (materials.lang ?? "es") !== lang;

  return (
    <>
      <Link href={backHref} className="text-accent mb-3 inline-block text-sm font-medium">
        ← {t.common.back}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{doc.title}</h1>
          <div className="mt-1">
            <StatusBadge status={doc.status} />
          </div>
        </div>
        {!isRef && (
          <div className="flex flex-wrap gap-2">
            {materials && (
              <Link href={`/documento/${doc.id}/imprimir`} className="btn-secondary">
                {t.print.button}
              </Link>
            )}
            <Link href={`/chat#doc=${doc.id}`} className="btn-secondary">
              {t.document.ask}
            </Link>
          </div>
        )}
      </div>

      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="bg-surface-2 flex w-max gap-1 rounded-xl p-1" role="tablist" aria-label={t.document.tabsLabel}>
          {visibleTabs.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setTab(id)}
              className={`min-h-10 rounded-lg px-4 text-sm font-medium whitespace-nowrap ${
                activeTab === id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {t.document.tabs[id]}
            </button>
          ))}
        </div>
      </div>

      {isRef && <p className="bg-warning-soft mb-5 rounded-xl p-4 text-sm">{t.reference.onlySearch}</p>}

      {translating && activeTab !== "archivo" && (
        <div className="bg-accent-soft mb-5 flex items-center gap-3 rounded-xl p-4 text-sm" role="status">
          <span
            className="border-border border-t-accent h-4 w-4 animate-spin rounded-full border-2"
            aria-hidden="true"
          />
          {t.document.translating(t.document.langName[lang])}
        </div>
      )}

      {activeTab === "archivo" ? (
        <OriginalFile doc={doc} />
      ) : doc.status !== "ready" ? (
        <ErrorBox message={docError(doc.error_message) ?? t.document.notReady} />
      ) : generating && !materials ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Spinner />
          <p className="font-semibold">{t.document.preparingTitle}</p>
          <p className="text-muted max-w-md text-sm">{t.document.preparingText}</p>
        </div>
      ) : studyError && !materials ? (
        <ErrorBox message={studyError} onRetry={() => loadStudy()} />
      ) : materials ? (
        <div role="tabpanel">
          {tab === "resumen" && (
            <article className="card p-5 sm:p-8">
              <ReadAloud key={`${materials.generated_at}-${materials.lang}`} text={materials.summary} />
              {highlights.length === 0 && <p className="text-muted mb-2 text-xs">{t.highlights.hint}</p>}
              <div ref={summaryRef}>
                <SummaryWithFigures markdown={materials.summary} figures={figures} />
              </div>
              <HighlightTools documentId={doc.id} root={summaryRef} items={highlights} setItems={setHighlights} />
              {materials.sources && materials.sources.length > 0 && (
                <div className="border-border mt-6 border-t pt-4">
                  <SourceChips sources={materials.sources} title={t.sources.consulted} />
                </div>
              )}
            </article>
          )}

          {tab === "conceptos" && (
            <ul className="space-y-3">
              {materials.key_concepts.map((c, i) => (
                <li key={i} className="card p-5">
                  <p className="text-lg font-semibold">{c.concept}</p>
                  <p className="mt-2">{c.explanation}</p>
                  <p className="bg-accent-soft mt-3 rounded-xl p-3 text-sm">
                    <strong>{t.document.whyItMatters}</strong> {c.why_it_matters}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {tab === "glosario" && (
            <dl className="card divide-border divide-y">
              {[...materials.glossary]
                .sort((a, b) => a.term.localeCompare(b.term, lang))
                .map((g, i) => (
                  <div key={i} className="p-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt className="font-semibold">{g.term}</dt>
                    <dd className="text-muted mt-1 sm:col-span-2 sm:mt-0">{g.definition}</dd>
                  </div>
                ))}
            </dl>
          )}

          {tab === "esquema" && <MindMapTab key={materials.generated_at} documentId={doc.id} />}

          {tab === "flashcards" && <FlashcardsTab key={materials.generated_at} doc={doc} materials={materials} />}

          {tab === "test" && <TestTab key={materials.generated_at} doc={doc} materials={materials} />}

          <div className="border-border text-muted mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <span>{t.document.disclaimer}</span>
            <button
              className="btn-ghost"
              disabled={generating}
              onClick={() => {
                if (confirm(t.document.confirmRegenerate)) loadStudy(true);
              }}
            >
              {generating ? t.document.regenerating : t.document.regenerate}
            </button>
          </div>
          {studyError && <p className="text-danger mt-2 text-sm">{studyError}</p>}
          <FiguresPanel
            doc={doc}
            saved={figures.length}
            onRead={figuresRead}
            busy={generating}
            onRegenerate={() => {
              if (confirm(t.document.confirmRegenerate)) loadStudy(true);
            }}
          />
        </div>
      ) : null}
    </>
  );
}
