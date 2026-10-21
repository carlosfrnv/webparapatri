"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle,
  Copy,
  FileDoc,
  MagnifyingGlass,
  NotePencil,
  Plus,
  Sparkle,
  Trash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SourceChips } from "@/components/Sources";
import { ErrorBox, Markdown, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import type { Subject, WebSource } from "@/lib/types";

/**
 * Asistente de trabajos: datos del trabajo, índice, investigación con fuentes fiables por apartado,
 * borradores con citas, bibliografía, revisión de su texto y exportación a Word.
 */

type Lang = "es" | "pt";

interface Meta {
  kind: string;
  words: number;
  lang: Lang;
  citation: "APA" | "Vancouver";
  subject?: string;
  instructions?: string;
}

interface Section {
  id: string;
  title: string;
  goal: string;
  words: number;
  research: string;
  sources: WebSource[];
  draft: string;
  // Lo que la IA está haciendo ahora en el servidor con este apartado, y el error si falló.
  status?: "research" | "draft" | null;
  error?: string | null;
}

interface Assignment {
  id: string;
  title: string;
  subject_id: string | null;
  meta: Meta;
  sections: Section[];
  updated_at?: string;
  running?: boolean;
}

const KINDS: Record<Lang, string[]> = {
  es: ["Trabajo escrito", "Presentación oral", "Póster", "Informe de prácticas", "Ensayo o reflexión"],
  pt: ["Trabalho escrito", "Apresentação oral", "Póster", "Relatório de estágio", "Ensaio ou reflexão"],
};

const TEXT = {
  es: {
    title: "Trabajos",
    subtitle: "Te ayuda con el índice, a buscar fuentes fiables, a redactar con citas y a revisar lo que escribes",
    back: "Volver",
    newTitle: "Nuevo trabajo",
    topic: "Tema o título del trabajo",
    kind: "Tipo",
    words: "Extensión (palabras)",
    workLang: "Idioma del trabajo",
    citation: "Citas",
    subject: "Asignatura",
    none: "—",
    instructions: "Instrucciones del profesor (opcional)",
    instructionsHint: "Pega aquí lo que os han pedido: estructura, criterios, extensión… La IA lo tendrá en cuenta.",
    create: "Crear",
    empty: "Aún no tienes trabajos. Crea uno con su tema y lo vamos preparando paso a paso.",
    needsSql: "Falta un paso: hay que actualizar la base de datos (ejecutar el SQL en Supabase).",
    progress: (r: number, d: number, n: number) => `${r}/${n} investigados · ${d}/${n} redactados`,
    tabs: { write: "Índice y redacción", bib: "Bibliografía", review: "Revisar mi texto" },
    editData: "Datos del trabajo",
    save: "Guardar",
    proposeOutline: "Proponer índice",
    proposing: "Pensando el índice…",
    orWrite: "O escribe tú el índice (un apartado por línea):",
    useOutline: "Usar este índice",
    addSection: "Añadir apartado",
    goal: "Qué contar",
    research: "Investigar",
    researchLabel: "Investigación y fuentes",
    researching: "Buscando en fuentes fiables… (puede tardar un minuto)",
    auto: "Hacer el trabajo entero",
    autoHint:
      "La IA investiga y redacta todos los apartados que falten, uno detrás de otro (unos minutos). Puedes cerrar la web: sigue trabajando sola.",
    autoRunning: (d: number, n: number) =>
      `La IA está trabajando… ${d} de ${n} apartados redactados. Puedes cerrar la web: sigue sola y al volver lo verás.`,
    useAndAuto: "Usar este índice y hacer el trabajo entero",
    draft: "Redactar borrador",
    drafting: "Redactando…",
    redo: "Rehacer",
    draftLabel: "Borrador (edítalo con tus palabras)",
    noResearch: "Primero investiga este apartado para que el borrador tenga datos y citas.",
    del: "Borrar",
    confirmDel: "¿Borrar este trabajo?",
    confirmDelSection: "¿Quitar este apartado?",
    bibEmpty: "La bibliografía se va formando sola a medida que investigas los apartados.",
    copy: "Copiar",
    copied: "Copiado",
    reviewHint:
      "Pega aquí un párrafo o un apartado que hayas escrito y te digo qué está bien, qué mejorar y qué corregir.",
    reviewBtn: "Revisar",
    reviewing: "Revisando…",
    word: "Descargar en Word",
    integrity:
      "Los borradores son un punto de partida: reescríbelos con tus palabras, comprueba cada fuente (abre los enlaces) y cita siempre. Así el trabajo es tuyo de verdad.",
    references: "Referencias bibliográficas",
    words_: (n: number) => `${n} palabras`,
  },
  pt: {
    title: "Trabalhos",
    subtitle: "Ajuda-te com o índice, a procurar fontes fiáveis, a redigir com citações e a rever o que escreves",
    back: "Voltar",
    newTitle: "Novo trabalho",
    topic: "Tema ou título do trabalho",
    kind: "Tipo",
    words: "Extensão (palavras)",
    workLang: "Língua do trabalho",
    citation: "Citações",
    subject: "Disciplina",
    none: "—",
    instructions: "Instruções do professor (opcional)",
    instructionsHint: "Cola aqui o que vos pediram: estrutura, critérios, extensão… A IA vai ter isso em conta.",
    create: "Criar",
    empty: "Ainda não tens trabalhos. Cria um com o tema e vamos prepará-lo passo a passo.",
    needsSql: "Falta um passo: é preciso atualizar a base de dados (executar o SQL no Supabase).",
    progress: (r: number, d: number, n: number) => `${r}/${n} pesquisados · ${d}/${n} redigidos`,
    tabs: { write: "Índice e redação", bib: "Bibliografia", review: "Rever o meu texto" },
    editData: "Dados do trabalho",
    save: "Guardar",
    proposeOutline: "Propor índice",
    proposing: "A pensar no índice…",
    orWrite: "Ou escreve tu o índice (uma secção por linha):",
    useOutline: "Usar este índice",
    addSection: "Adicionar secção",
    goal: "O que contar",
    research: "Pesquisar",
    researchLabel: "Pesquisa e fontes",
    researching: "A procurar em fontes fiáveis… (pode demorar um minuto)",
    auto: "Fazer o trabalho todo",
    autoHint:
      "A IA pesquisa e redige todas as secções que faltam, uma a seguir à outra (alguns minutos). Podes fechar a web: continua a trabalhar sozinha.",
    autoRunning: (d: number, n: number) =>
      `A IA está a trabalhar… ${d} de ${n} secções redigidas. Podes fechar a web: continua sozinha e quando voltares vês.`,
    useAndAuto: "Usar este índice e fazer o trabalho todo",
    draft: "Redigir rascunho",
    drafting: "A redigir…",
    redo: "Refazer",
    draftLabel: "Rascunho (edita-o com as tuas palavras)",
    noResearch: "Primeiro pesquisa esta secção para o rascunho ter dados e citações.",
    del: "Apagar",
    confirmDel: "Apagar este trabalho?",
    confirmDelSection: "Tirar esta secção?",
    bibEmpty: "A bibliografia vai-se formando sozinha à medida que pesquisas as secções.",
    copy: "Copiar",
    copied: "Copiado",
    reviewHint:
      "Cola aqui um parágrafo ou uma secção que tenhas escrito e digo-te o que está bem, o que melhorar e o que corrigir.",
    reviewBtn: "Rever",
    reviewing: "A rever…",
    word: "Descarregar em Word",
    integrity:
      "Os rascunhos são um ponto de partida: reescreve-os com as tuas palavras, verifica cada fonte (abre as ligações) e cita sempre. Assim o trabalho é mesmo teu.",
    references: "Referências bibliográficas",
    words_: (n: number) => `${n} palavras`,
  },
};
type Tx = (typeof TEXT)["es"];

const newId = () => Math.random().toString(36).slice(2, 10);

/** Líneas de la sección "Fuentes"/"Fontes" de cada investigación, sin repetir. */
function bibliography(sections: Section[], style: Meta["citation"]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sections) {
    const m = s.research.match(/###\s*(Fuentes|Fontes)\s*\n([\s\S]*?)(?=\n###|$)/i);
    if (!m) continue;
    for (const raw of m[2].split("\n")) {
      const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
      if (line.length < 12 || line === "—") continue;
      const key = line
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return style === "APA" ? out.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })) : out;
}

// ---------- Lista y creación ----------

export function AssignmentList() {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const router = useRouter();
  const [data, setData] = useState<{
    ready: boolean;
    items: (Assignment & { sections: unknown; drafted: number })[];
  } | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    subject_id: "",
    kind: KINDS[lang][0],
    words: 2000,
    // Por defecto, el trabajo se escribe en el idioma de la web (se puede cambiar en el formulario).
    lang: lang,
    citation: "APA" as Meta["citation"],
    instructions: "",
  });

  const load = useCallback(() => {
    api
      .get<{ ready: boolean; items: (Assignment & { sections: unknown; drafted: number })[] }>("/assignments")
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
    api
      .get<Subject[]>("/subjects")
      .then(setSubjects)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const subject = subjects.find((s) => s.id === form.subject_id)?.name;
      const a = await api.post<Assignment>("/assignments", {
        title: form.title.trim(),
        subject_id: form.subject_id || null,
        meta: {
          kind: form.kind,
          words: form.words,
          lang: form.lang,
          citation: form.citation,
          subject,
          instructions: form.instructions.trim() || undefined,
        },
      });
      router.push(`/trabajos/${a.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div>
      <Link href="/estudiar" className="text-accent mb-4 inline-flex items-center gap-1 font-semibold">
        <ArrowLeft size={18} aria-hidden="true" /> {tx.back}
      </Link>
      <PageHeader icon={NotePencil} title={tx.title} subtitle={tx.subtitle} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && !data.ready && <p className="card bg-warning-soft text-amber p-4">{tx.needsSql}</p>}
      {data?.ready && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {data.items.length === 0 ? (
              <p className="card text-muted p-4">{tx.empty}</p>
            ) : (
              data.items.map((a) => (
                <Link key={a.id} href={`/trabajos/${a.id}`} className="card hover:border-accent block p-4">
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-muted mt-1 text-sm">
                    {a.meta.kind} · {tx.words_(a.meta.words)} · {a.meta.lang.toUpperCase()}
                    {typeof a.sections === "number" && a.sections > 0 && ` · ${a.drafted}/${a.sections}`}
                  </div>
                </Link>
              ))
            )}
          </div>
          <form onSubmit={create} className="card space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-bold">
              <Plus size={18} aria-hidden="true" /> {tx.newTitle}
            </h2>
            <label className="block">
              <span className="text-sm font-semibold">{tx.topic}</span>
              <input
                className="input mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={300}
                required
              />
            </label>
            <MetaFields form={form} setForm={setForm} subjects={subjects} tx={tx} lang={lang} />
            <button className="btn-primary" disabled={busy || form.title.trim().length < 2}>
              {tx.create}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface MetaForm {
  subject_id: string;
  kind: string;
  words: number;
  lang: Lang;
  citation: Meta["citation"];
  instructions: string;
}

function MetaFields<T extends MetaForm>({
  form,
  setForm,
  subjects,
  tx,
  lang,
}: {
  form: T;
  setForm: (f: T) => void;
  subjects: Subject[];
  tx: Tx;
  lang: Lang;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-semibold">{tx.kind}</span>
          <select className="input mt-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {[...new Set([form.kind, ...KINDS[lang]])].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{tx.words}</span>
          <input
            type="number"
            className="input mt-1"
            min={100}
            max={30000}
            step={100}
            value={form.words}
            onChange={(e) => setForm({ ...form, words: Math.max(100, Math.min(30000, Number(e.target.value) || 100)) })}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{tx.workLang}</span>
          <select
            className="input mt-1"
            value={form.lang}
            onChange={(e) => setForm({ ...form, lang: e.target.value as Lang })}
          >
            <option value="pt">Português</option>
            <option value="es">Español</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">{tx.citation}</span>
          <select
            className="input mt-1"
            value={form.citation}
            onChange={(e) => setForm({ ...form, citation: e.target.value as Meta["citation"] })}
          >
            <option value="APA">APA 7</option>
            <option value="Vancouver">Vancouver</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-semibold">{tx.subject}</span>
        <select
          className="input mt-1"
          value={form.subject_id}
          onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
        >
          <option value="">{tx.none}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold">{tx.instructions}</span>
        <textarea
          className="input mt-1 min-h-24"
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          maxLength={8000}
          placeholder={tx.instructionsHint}
        />
      </label>
    </>
  );
}

// ---------- Un trabajo ----------

type Tab = "write" | "bib" | "review";

export function AssignmentView({ id }: { id: string }) {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const router = useRouter();
  const [a, setA] = useState<Assignment | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("write");
  const [editMeta, setEditMeta] = useState(false);

  const load = useCallback(() => {
    api
      .get<Assignment>(`/assignments/${id}`)
      .then(setA)
      .catch((e) => setError(errorMessage(e)));
    api
      .get<Subject[]>("/subjects")
      .then(setSubjects)
      .catch(() => undefined);
  }, [id]);
  useEffect(load, [load]);

  const saveSections = useCallback(
    async (sections: Section[]) => {
      setA((x) => (x ? { ...x, sections } : x));
      try {
        await api.patch(`/assignments/${id}`, { sections });
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [id],
  );

  // La IA trabaja en el servidor: aquí solo se lanza y luego se pregunta cada pocos segundos cómo va.
  const launch = async (path: string) => {
    setError("");
    try {
      setA(await api.post<Assignment>(`/assignments/${id}/${path}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const run = (s: Section, kind: "research" | "draft") => launch(`sections/${s.id}/${kind}`);

  const running = !!a?.running;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      api
        .get<Assignment>(`/assignments/${id}`)
        .then(setA)
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [running, id]);

  if (error && !a) return <ErrorBox message={error} onRetry={load} />;
  if (!a) return <Spinner />;
  const n = a.sections.length;
  const researched = a.sections.filter((s) => s.research).length;
  const drafted = a.sections.filter((s) => s.draft).length;

  return (
    <div>
      <Link href="/trabajos" className="text-accent mb-4 inline-flex items-center gap-1 font-semibold">
        <ArrowLeft size={18} aria-hidden="true" /> {tx.title}
      </Link>
      <PageHeader
        icon={NotePencil}
        title={a.title}
        subtitle={`${a.meta.kind} · ${tx.words_(a.meta.words)} · ${a.meta.lang === "pt" ? "Português" : "Español"} · ${a.meta.citation}${a.meta.subject ? ` · ${a.meta.subject}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => exportWord(a, tx)} disabled={!drafted}>
              <FileDoc size={18} aria-hidden="true" /> {tx.word}
            </button>
            <button
              className="btn-ghost text-danger"
              onClick={async () => {
                if (!confirm(tx.confirmDel)) return;
                await api.del(`/assignments/${id}`);
                router.push("/trabajos");
              }}
            >
              <Trash size={18} aria-hidden="true" />
            </button>
          </div>
        }
      />
      {n > 0 && (
        <div className="mb-4">
          <div className="text-muted mb-1 text-sm">{tx.progress(researched, drafted, n)}</div>
          <div className="bg-surface-2 h-2 overflow-hidden rounded-full">
            <div className="bg-accent h-full" style={{ width: `${((researched + drafted) / (2 * n)) * 100}%` }} />
          </div>
        </div>
      )}
      {error && <ErrorBox message={error} />}

      <details className="card mb-4 p-4" open={editMeta} onToggle={(e) => setEditMeta(e.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold">{tx.editData}</summary>
        {editMeta && <MetaEditor a={a} subjects={subjects} tx={tx} lang={lang} onSaved={setA} />}
      </details>

      <div className="bg-surface-2 mb-5 flex w-max max-w-full gap-1 overflow-x-auto rounded-xl p-1" role="tablist">
        {(Object.keys(tx.tabs) as Tab[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold whitespace-nowrap ${
              tab === k ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            {tx.tabs[k]}
          </button>
        ))}
      </div>

      {tab === "write" && (
        <div className="space-y-4">
          <p className="bg-surface-2 text-muted rounded-xl p-3 text-sm">{tx.integrity}</p>
          {n === 0 ? (
            <OutlineStart
              id={id}
              tx={tx}
              onReady={async (sections, auto) => {
                await saveSections(sections);
                if (auto) await launch("auto");
              }}
            />
          ) : (
            <>
              {running ? (
                <div className="card border-accent flex items-center gap-3 border-2 p-4">
                  <Spinner />
                  <p className="text-sm font-medium">{tx.autoRunning(drafted, n)}</p>
                </div>
              ) : (
                drafted < n && (
                  <div className="card space-y-2 p-4">
                    <button className="btn-primary w-full sm:w-auto" onClick={() => launch("auto")}>
                      <Sparkle size={18} aria-hidden="true" /> {tx.auto}
                    </button>
                    <p className="text-muted text-sm">{tx.autoHint}</p>
                  </div>
                )
              )}
              {a.sections.map((s, i) => (
                <SectionCard
                  key={s.id}
                  s={s}
                  i={i}
                  n={n}
                  tx={tx}
                  working={s.status ?? undefined}
                  busy={running}
                  onChange={(patch) => saveSections(a.sections.map((y) => (y.id === s.id ? { ...y, ...patch } : y)))}
                  onMove={(d) => {
                    const list = [...a.sections];
                    [list[i], list[i + d]] = [list[i + d], list[i]];
                    saveSections(list);
                  }}
                  onDelete={() =>
                    confirm(tx.confirmDelSection) && saveSections(a.sections.filter((y) => y.id !== s.id))
                  }
                  onRun={(k) => run(s, k)}
                />
              ))}
              <button
                className="btn-ghost"
                onClick={() =>
                  saveSections([
                    ...a.sections,
                    { id: newId(), title: `${n + 1}. `, goal: "", words: 0, research: "", sources: [], draft: "" },
                  ])
                }
              >
                <Plus size={18} aria-hidden="true" /> {tx.addSection}
              </button>
            </>
          )}
        </div>
      )}
      {tab === "bib" && <Bibliography a={a} tx={tx} />}
      {tab === "review" && <Review id={id} tx={tx} />}
    </div>
  );
}

function MetaEditor({
  a,
  subjects,
  tx,
  lang,
  onSaved,
}: {
  a: Assignment;
  subjects: Subject[];
  tx: Tx;
  lang: Lang;
  onSaved: (a: Assignment) => void;
}) {
  const [form, setForm] = useState({
    title: a.title,
    subject_id: a.subject_id ?? "",
    kind: a.meta.kind,
    words: a.meta.words,
    lang: a.meta.lang,
    citation: a.meta.citation,
    instructions: a.meta.instructions ?? "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const saved = await api.patch<Assignment>(`/assignments/${a.id}`, {
            title: form.title.trim(),
            subject_id: form.subject_id || null,
            meta: {
              kind: form.kind,
              words: form.words,
              lang: form.lang,
              citation: form.citation,
              subject: subjects.find((s) => s.id === form.subject_id)?.name,
              instructions: form.instructions.trim() || undefined,
            },
          });
          onSaved(saved);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block">
        <span className="text-sm font-semibold">{tx.topic}</span>
        <input
          className="input mt-1"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <MetaFields form={form} setForm={setForm} subjects={subjects} tx={tx} lang={lang} />
      <button className="btn-primary" disabled={busy || form.title.trim().length < 2}>
        {tx.save}
      </button>
    </form>
  );
}

function OutlineStart({ id, tx, onReady }: { id: string; tx: Tx; onReady: (s: Section[], auto: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Section[] | null>(null);
  const [typed, setTyped] = useState("");
  const typedSections = useMemo(
    () =>
      typed
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((title) => ({ id: newId(), title, goal: "", words: 0, research: "", sources: [], draft: "" })),
    [typed],
  );
  return (
    <div className="card space-y-4 p-4">
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setProposal((await api.post<{ sections: Section[] }>(`/assignments/${id}/outline`)).sections);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkle size={18} aria-hidden="true" /> {tx.proposeOutline}
      </button>
      {busy && <Spinner label={tx.proposing} />}
      {error && <ErrorBox message={error} />}
      {proposal && (
        <div className="space-y-2">
          <ol className="space-y-1">
            {proposal.map((s) => (
              <li key={s.id}>
                <div className="font-semibold">{s.title}</div>
                <div className="text-muted text-sm">
                  {s.goal} {s.words ? `· ${tx.words_(s.words)}` : ""}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => onReady(proposal, true)}>
              <Sparkle size={18} aria-hidden="true" /> {tx.useAndAuto}
            </button>
            <button className="btn-secondary" onClick={() => onReady(proposal, false)}>
              <CheckCircle size={18} aria-hidden="true" /> {tx.useOutline}
            </button>
          </div>
        </div>
      )}
      <div>
        <div className="text-sm font-semibold">{tx.orWrite}</div>
        <textarea
          className="input mt-1 min-h-32"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={"1. Introducción\n2. …\n3. Conclusión"}
        />
        {typedSections.length > 0 && (
          <button className="btn-secondary mt-2" onClick={() => onReady(typedSections, false)}>
            {tx.useOutline} ({typedSections.length})
          </button>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  s,
  i,
  n,
  tx,
  working,
  busy,
  onChange,
  onMove,
  onDelete,
  onRun,
}: {
  s: Section;
  i: number;
  n: number;
  tx: Tx;
  working?: "research" | "draft";
  busy: boolean;
  onChange: (patch: Partial<Section>) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onRun: (k: "research" | "draft") => void;
}) {
  const [title, setTitle] = useState(s.title);
  const [goal, setGoal] = useState(s.goal);
  const [draft, setDraft] = useState(s.draft);
  const [syncedDraft, setSyncedDraft] = useState(s.draft);
  // Si llega un borrador nuevo de la IA, se muestra (sin pisar lo que esté escribiendo si no ha cambiado).
  if (s.draft !== syncedDraft) {
    setSyncedDraft(s.draft);
    setDraft(s.draft);
  }
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <input
            className="input font-semibold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== s.title && onChange({ title })}
          />
          <input
            className="input text-sm"
            value={goal}
            placeholder={tx.goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => goal !== s.goal && onChange({ goal })}
          />
        </div>
        <div className="flex flex-col">
          <button className="btn-ghost min-h-8 px-2" disabled={i === 0} onClick={() => onMove(-1)} aria-label="↑">
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button className="btn-ghost min-h-8 px-2" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="↓">
            <ArrowDown size={16} aria-hidden="true" />
          </button>
          <button className="btn-ghost text-danger min-h-8 px-2" onClick={onDelete} aria-label={tx.del}>
            <Trash size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy} onClick={() => onRun("research")}>
          <MagnifyingGlass size={18} aria-hidden="true" /> {s.research ? `${tx.research} · ${tx.redo}` : tx.research}
        </button>
        <button className={s.research ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={() => onRun("draft")}>
          <NotePencil size={18} aria-hidden="true" /> {s.draft ? `${tx.draft} · ${tx.redo}` : tx.draft}
        </button>
      </div>
      {working && <Spinner label={working === "research" ? tx.researching : tx.drafting} />}
      {s.error && !working && <ErrorBox message={s.error} />}

      {s.research && (
        <details className="bg-surface-2 rounded-xl p-3" open={!s.draft}>
          <summary className="cursor-pointer text-sm font-semibold">
            <BookOpen size={16} className="mr-1 inline" aria-hidden="true" />
            {tx.researchLabel}
          </summary>
          <div className="mt-2 text-sm">
            <Markdown>{s.research}</Markdown>
          </div>
          {s.sources.length > 0 && <SourceChips sources={s.sources} />}
        </details>
      )}
      {!s.research && !s.draft && <p className="text-muted text-sm">{tx.noResearch}</p>}

      {(s.draft || draft) && (
        <label className="block">
          <span className="flex justify-between text-sm font-semibold">
            {tx.draftLabel}
            <span className="text-muted font-normal">{tx.words_(words)}</span>
          </span>
          <textarea
            className="input mt-1 min-h-56 leading-relaxed"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== s.draft && onChange({ draft })}
            disabled={working === "draft"}
          />
        </label>
      )}
    </div>
  );
}

function Bibliography({ a, tx }: { a: Assignment; tx: Tx }) {
  const list = bibliography(a.sections, a.meta.citation);
  const [copied, setCopied] = useState(false);
  if (!list.length) return <p className="card text-muted p-4">{tx.bibEmpty}</p>;
  const text = list.map((l, i) => (a.meta.citation === "Vancouver" ? `${i + 1}. ${l}` : l)).join("\n");
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{tx.references}</h2>
        <button
          className="btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy size={18} aria-hidden="true" /> {copied ? tx.copied : tx.copy}
        </button>
      </div>
      <ol className={`space-y-2 text-sm ${a.meta.citation === "Vancouver" ? "list-decimal pl-5" : ""}`}>
        {list.map((l) => (
          <li key={l} className={a.meta.citation === "APA" ? "pl-6 -indent-6" : ""}>
            <Markdown>{l}</Markdown>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Review({ id, tx }: { id: string; tx: Tx }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <p className="text-muted text-sm">{tx.reviewHint}</p>
        <textarea className="input min-h-56" value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} />
        <button
          className="btn-primary"
          disabled={busy || text.trim().length < 20}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setReview((await api.post<{ review: string }>(`/assignments/${id}/review`, { text })).review);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tx.reviewBtn}
        </button>
        {busy && <Spinner label={tx.reviewing} />}
        {error && <ErrorBox message={error} />}
      </div>
      {review && (
        <div className="card p-4">
          <Markdown>{review}</Markdown>
        </div>
      )}
    </div>
  );
}

// ---------- Word ----------

/** Quita el Markdown básico de una línea (negritas, cursivas, enlaces) para Word. */
const plain = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/\[Web\]\s*/g, "")
    .trim();

async function exportWord(a: Assignment, tx: Tx) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
  const body: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: a.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
  ];
  if (a.meta.subject) body.push(new Paragraph({ text: a.meta.subject, alignment: AlignmentType.CENTER }));
  body.push(new Paragraph({ text: "" }));
  for (const s of a.sections) {
    body.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_1 }));
    for (const para of s.draft.split(/\n\s*\n/)) {
      const t = plain(para.replace(/\n/g, " "));
      if (t) body.push(new Paragraph({ children: [new TextRun(t)], spacing: { after: 160, line: 360 } }));
    }
  }
  const bib = bibliography(a.sections, a.meta.citation);
  if (bib.length) {
    body.push(new Paragraph({ text: tx.references, heading: HeadingLevel.HEADING_1 }));
    bib.forEach((l, i) =>
      body.push(
        new Paragraph({
          children: [new TextRun(a.meta.citation === "Vancouver" ? `${i + 1}. ${plain(l)}` : plain(l))],
          indent: a.meta.citation === "APA" ? { left: 720, hanging: 720 } : undefined,
          spacing: { after: 120 },
        }),
      ),
    );
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children: body }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${a.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "trabajo"}.docx`;
  // El enlace tiene que estar en la página para que el navegador respete el nombre del archivo.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
