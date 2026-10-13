"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useDocError } from "@/components/DocumentList";
import { FlashcardSession } from "@/components/FlashcardSession";
import { Quiz } from "@/components/Quiz";
import { ErrorBox, fileIcon, Markdown, Spinner, StatusBadge } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type { DocumentItem, DueCard, StudyMaterials } from "@/lib/types";

const TABS = ["resumo", "conceitos", "glossario", "flashcards", "teste", "ficheiro"] as const;
type TabId = (typeof TABS)[number];

function useHashTab(): [TabId, (t: TabId) => void] {
  const [tab, setTab] = useState<TabId>("resumo");
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
        if (d.status === "ready") loadStudy();
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id, loadStudy]);

  if (error) return <ErrorBox message={error} />;
  if (!doc) return <Spinner label={t.common.loading} />;

  const backHref = doc.subject_id ? `/disciplina/${doc.subject_id}` : "/biblioteca";
  // Material gerado noutro idioma (a cache é por ficheiro): oferecemos gerá-lo de novo.
  const materialsLang = materials?.lang ?? "pt";
  const otherLang = materials && materialsLang !== lang;

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
        <Link href={`/chat#doc=${doc.id}`} className="btn-secondary">
          {t.document.ask}
        </Link>
      </div>

      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="bg-surface-2 flex w-max gap-1 rounded-xl p-1" role="tablist" aria-label={t.document.tabsLabel}>
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-10 rounded-lg px-4 text-sm font-medium whitespace-nowrap ${
                tab === id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {t.document.tabs[id]}
            </button>
          ))}
        </div>
      </div>

      {otherLang && tab !== "ficheiro" && (
        <div className="bg-accent-soft mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-sm">
          <span>{t.document.otherLang(t.document.langName[materialsLang])}</span>
          <button
            className="btn-primary min-h-9 px-3 py-1 text-sm"
            disabled={generating}
            onClick={() => {
              if (confirm(t.document.confirmRegenerate)) loadStudy(true);
            }}
          >
            {generating ? t.document.regenerating : t.document.generateIn(t.document.langName[lang])}
          </button>
        </div>
      )}

      {tab === "ficheiro" ? (
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
          {tab === "resumo" && (
            <article className="card p-5 sm:p-8">
              <Markdown>{materials.summary}</Markdown>
            </article>
          )}

          {tab === "conceitos" && (
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

          {tab === "glossario" && (
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

          {tab === "flashcards" && <FlashcardsTab key={materials.generated_at} doc={doc} materials={materials} />}

          {tab === "teste" && <Quiz key={materials.generated_at} documentId={doc.id} questions={materials.quiz} />}

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
        </div>
      ) : null}
    </>
  );
}
