"use client";

import { ArrowLeft, Cards, DownloadSimple, MagnifyingGlass, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GradientIcon } from "@/components/GradientIcon";
import { type Box, OcclusionEditor, OcclusionView, occlusionText } from "@/components/Occlusion";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import type { DocumentItem } from "@/lib/types";

/**
 * Mazos tipo Anki: tarjetas propias con la programación de Anki (Otra vez / Difícil / Bien / Fácil).
 * Es aparte del repaso de las tarjetas de los apuntes, que sigue igual.
 */

type Lang = "es" | "pt";
type Rating = 1 | 2 | 3 | 4;

interface DeckSummary {
  id: string;
  name: string;
  new_per_day: number;
  total: number;
  new_total: number;
  new_today: number;
  learning: number;
  review: number;
}

interface DeckCard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  state: "new" | "learning" | "review" | "relearning";
  interval_days: number;
  due_at: string;
  previews?: Record<Rating, number>;
  // Tarjetas de imagen (nombres tapados).
  image_url?: string | null;
  occlusion?: { boxes: Box[]; target: number } | null;
}

interface DeckDetail {
  id: string;
  name: string;
  new_per_day: number;
  cards: DeckCard[];
  forecast: number[];
}

const TEXT = {
  es: {
    title: "Mazos (estilo Anki)",
    subtitle: "Tus propias tarjetas con la repetición espaciada de Anki",
    back: "Volver",
    newDeck: "Nuevo mazo",
    deckName: "Nombre del mazo",
    create: "Crear",
    noDecks: "Aún no tienes mazos. Crea uno y añade tarjetas, o cópialas de tus apuntes.",
    needsSql: "Falta un paso: hay que actualizar la base de datos (ejecutar el SQL de los mazos en Supabase).",
    counts: { new: "Nuevas", learning: "Aprendiendo", review: "Repasar" },
    study: "Estudiar",
    open: "Abrir",
    tabs: { study: "Estudiar", add: "Añadir", browse: "Tarjetas", settings: "Ajustes" },
    front: "Anverso (pregunta)",
    backSide: "Reverso (respuesta)",
    addCard: "Añadir tarjeta",
    added: (n: number) => (n === 1 ? "1 tarjeta añadida" : `${n} tarjetas añadidas`),
    importTitle: "Copiar de tus apuntes",
    importHelp: "Copia las tarjetas que ya generó la web para un archivo (las que ya estén en el mazo no se repiten).",
    importBtn: "Copiar al mazo",
    imported: (a: number, s: number) => `${a} copiadas${s ? `, ${s} ya estaban` : ""}`,
    chooseDoc: "Elige un archivo…",
    pasteTitle: "Pegar de Anki o de una lista",
    pasteHelp:
      "Una tarjeta por línea: pregunta y respuesta separadas por un tabulador (exportación de Anki en texto), «;» o « - ».",
    pasteBtn: "Añadir las tarjetas",
    pasteFound: (n: number) => `${n} tarjetas detectadas`,
    search: "Buscar en las tarjetas…",
    empty: "Este mazo no tiene tarjetas todavía.",
    state: { new: "Nueva", learning: "Aprendiendo", review: "Repaso", relearning: "Reaprendiendo" },
    dueIn: (s: string) => `Toca ${s}`,
    save: "Guardar",
    cancel: "Cancelar",
    del: "Borrar",
    confirmDeleteCard: "¿Borrar esta tarjeta?",
    newPerDay: "Tarjetas nuevas al día",
    rename: "Nombre",
    deleteDeck: "Borrar el mazo",
    confirmDeleteDeck: "¿Borrar el mazo y todas sus tarjetas? No se puede deshacer.",
    forecast: "Repasos de los próximos días",
    days: ["Hoy", "Mañana", "+2", "+3", "+4", "+5", "+6"],
    show: "Mostrar respuesta",
    buttons: ["Otra vez", "Difícil", "Bien", "Fácil"],
    finished: "¡Has terminado por hoy con este mazo! 🎉",
    finishedHelp: "Vuelve mañana: la repetición espaciada funciona mejor poco a poco cada día.",
    waiting: (s: string) => `Las tarjetas que estás aprendiendo vuelven en ${s}.`,
    keys: "Atajos: espacio para mostrar · 1–4 para responder",
    howTitle: "¿Cómo funciona?",
    how: [
      "Otra vez: no la sabías. Vuelve a salir en 1 minuto (y si ya la sabías de antes, baja su facilidad).",
      "Difícil: la sabías con esfuerzo. Sale algo antes de lo normal.",
      "Bien: la sabías. El intervalo se multiplica (1 día, 3, 8, 20…).",
      "Fácil: demasiado fácil. Salta más lejos.",
    ],
  },
  pt: {
    title: "Baralhos (estilo Anki)",
    subtitle: "Os teus próprios cartões com a repetição espaçada do Anki",
    back: "Voltar",
    newDeck: "Novo baralho",
    deckName: "Nome do baralho",
    create: "Criar",
    noDecks: "Ainda não tens baralhos. Cria um e adiciona cartões, ou copia-os dos teus apontamentos.",
    needsSql: "Falta um passo: é preciso atualizar a base de dados (executar o SQL dos baralhos no Supabase).",
    counts: { new: "Novos", learning: "A aprender", review: "Rever" },
    study: "Estudar",
    open: "Abrir",
    tabs: { study: "Estudar", add: "Adicionar", browse: "Cartões", settings: "Definições" },
    front: "Frente (pergunta)",
    backSide: "Verso (resposta)",
    addCard: "Adicionar cartão",
    added: (n: number) => (n === 1 ? "1 cartão adicionado" : `${n} cartões adicionados`),
    importTitle: "Copiar dos teus apontamentos",
    importHelp: "Copia os cartões que a web já gerou para um ficheiro (os que já estão no baralho não se repetem).",
    importBtn: "Copiar para o baralho",
    imported: (a: number, s: number) => `${a} copiados${s ? `, ${s} já estavam` : ""}`,
    chooseDoc: "Escolhe um ficheiro…",
    pasteTitle: "Colar do Anki ou de uma lista",
    pasteHelp:
      "Um cartão por linha: pergunta e resposta separadas por um tabulador (exportação do Anki em texto), «;» ou « - ».",
    pasteBtn: "Adicionar os cartões",
    pasteFound: (n: number) => `${n} cartões detetados`,
    search: "Procurar nos cartões…",
    empty: "Este baralho ainda não tem cartões.",
    state: { new: "Novo", learning: "A aprender", review: "Revisão", relearning: "A reaprender" },
    dueIn: (s: string) => `Sai ${s}`,
    save: "Guardar",
    cancel: "Cancelar",
    del: "Apagar",
    confirmDeleteCard: "Apagar este cartão?",
    newPerDay: "Cartões novos por dia",
    rename: "Nome",
    deleteDeck: "Apagar o baralho",
    confirmDeleteDeck: "Apagar o baralho e todos os cartões? Não se pode desfazer.",
    forecast: "Revisões dos próximos dias",
    days: ["Hoje", "Amanhã", "+2", "+3", "+4", "+5", "+6"],
    show: "Mostrar resposta",
    buttons: ["Outra vez", "Difícil", "Bom", "Fácil"],
    finished: "Terminaste por hoje com este baralho! 🎉",
    finishedHelp: "Volta amanhã: a repetição espaçada funciona melhor aos poucos todos os dias.",
    waiting: (s: string) => `Os cartões que estás a aprender voltam dentro de ${s}.`,
    keys: "Atalhos: espaço para mostrar · 1–4 para responder",
    howTitle: "Como funciona?",
    how: [
      "Outra vez: não sabias. Volta a sair dentro de 1 minuto (e se já o sabias, baixa a sua facilidade).",
      "Difícil: sabias com esforço. Sai um pouco antes do normal.",
      "Bom: sabias. O intervalo multiplica-se (1 dia, 3, 8, 20…).",
      "Fácil: demasiado fácil. Salta mais longe.",
    ],
  },
};

const tz = () => new Date().getTimezoneOffset();

/** "1 min", "10 min", "3 d", "2 mes", "1,5 a" (como en los botones de Anki). */
function span(seconds: number, lang: Lang) {
  const m = seconds / 60;
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} d`;
  if (d < 365) return `${(d / 30).toFixed(1).replace(".0", "").replace(".", ",")} ${lang === "es" ? "mes" : "mês"}`;
  return `${(d / 365).toFixed(1).replace(".0", "").replace(".", ",")} ${lang === "es" ? "a" : "a"}`;
}

function Counts({ d, tx }: { d: Pick<DeckSummary, "new_today" | "learning" | "review">; tx: (typeof TEXT)["es"] }) {
  return (
    <div className="flex gap-3 font-mono text-sm font-bold">
      <span className="text-sky-600" title={tx.counts.new}>
        {d.new_today}
      </span>
      <span className="text-rose-600" title={tx.counts.learning}>
        {d.learning}
      </span>
      <span className="text-emerald-600" title={tx.counts.review}>
        {d.review}
      </span>
    </div>
  );
}

// ---------- Lista de mazos ----------

export function DeckList() {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const [data, setData] = useState<{ ready: boolean; decks: DeckSummary[] } | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ ready: boolean; decks: DeckSummary[] }>(`/decks?tz=${tz()}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post("/decks", { name: name.trim() });
      setName("");
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link href="/estudiar" className="text-accent mb-4 inline-flex items-center gap-1 font-semibold">
        <ArrowLeft size={18} aria-hidden="true" /> {tx.back}
      </Link>
      <PageHeader icon={Cards} title={tx.title} subtitle={tx.subtitle} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && !data.ready && <p className="card bg-warning-soft text-amber p-4">{tx.needsSql}</p>}
      {data?.ready && (
        <div className="space-y-4">
          {data.decks.length === 0 ? (
            <p className="card text-muted p-4">{tx.noDecks}</p>
          ) : (
            <div className="card divide-border divide-y p-0">
              <div className="text-muted flex items-center justify-between px-5 py-2 text-xs font-bold tracking-wider uppercase">
                <span />
                <span className="flex gap-3">
                  <span className="text-sky-600">{tx.counts.new}</span>
                  <span className="text-rose-600">{tx.counts.learning}</span>
                  <span className="text-emerald-600">{tx.counts.review}</span>
                </span>
              </div>
              {data.decks.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <Link href={`/mazos/${d.id}`} className="min-w-0 flex-1 text-lg font-semibold hover:underline">
                    {d.name}
                    <span className="text-muted ml-2 text-sm font-normal">({d.total})</span>
                  </Link>
                  <Counts d={d} tx={tx} />
                  <Link
                    href={`/mazos/${d.id}?estudiar=1`}
                    className={`btn-primary min-h-10 ${d.new_today + d.learning + d.review === 0 ? "pointer-events-none opacity-50" : ""}`}
                  >
                    {tx.study}
                  </Link>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={create} className="card flex flex-wrap items-center gap-3 p-4">
            <GradientIcon icon={Plus} tone="violet" size={40} />
            <input
              className="input min-w-0 flex-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tx.deckName}
              maxLength={120}
              aria-label={tx.deckName}
            />
            <button className="btn-primary" disabled={busy || !name.trim()}>
              {tx.create}
            </button>
          </form>
          <details className="card p-4">
            <summary className="cursor-pointer font-semibold">{tx.howTitle}</summary>
            <ul className="text-muted mt-2 space-y-1 text-sm">
              {tx.how.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

// ---------- Un mazo ----------

type Tab = "study" | "add" | "browse" | "settings";

export function DeckView({ id, startStudying }: { id: string; startStudying: boolean }) {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("study");
  const [studying, setStudying] = useState(startStudying);

  const load = useCallback(() => {
    api
      .get<DeckDetail>(`/decks/${id}?tz=${tz()}`)
      .then(setDeck)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!deck) return <Spinner />;

  return (
    <div>
      <Link href="/mazos" className="text-accent mb-4 inline-flex items-center gap-1 font-semibold">
        <ArrowLeft size={18} aria-hidden="true" /> {tx.title}
      </Link>
      <PageHeader icon={Cards} title={deck.name} />
      {studying ? (
        <DeckStudy
          id={id}
          onExit={() => {
            setStudying(false);
            load();
          }}
        />
      ) : (
        <>
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
          {tab === "study" && <Overview deck={deck} tx={tx} onStudy={() => setStudying(true)} />}
          {tab === "add" && <AddCards deck={deck} tx={tx} onAdded={load} />}
          {tab === "browse" && <Browse deck={deck} tx={tx} lang={lang} onChange={load} />}
          {tab === "settings" && <Settings deck={deck} tx={tx} onChange={load} />}
        </>
      )}
    </div>
  );
}

function Overview({ deck, tx, onStudy }: { deck: DeckDetail; tx: (typeof TEXT)["es"]; onStudy: () => void }) {
  const [counts, setCounts] = useState<DeckSummary | null>(null);
  useEffect(() => {
    api
      .get<{ decks: DeckSummary[] }>(`/decks?tz=${tz()}`)
      .then((r) => setCounts(r.decks.find((d) => d.id === deck.id) ?? null))
      .catch(() => undefined);
  }, [deck]);
  const max = Math.max(1, ...deck.forecast);
  const pending = counts ? counts.new_today + counts.learning + counts.review : 0;
  return (
    <div className="space-y-4">
      <div className="card flex flex-col items-center gap-4 p-6 text-center">
        {counts && (
          <div className="grid grid-cols-3 gap-6">
            {(
              [
                ["new_today", tx.counts.new, "text-sky-600"],
                ["learning", tx.counts.learning, "text-rose-600"],
                ["review", tx.counts.review, "text-emerald-600"],
              ] as const
            ).map(([k, label, color]) => (
              <div key={k}>
                <div className={`font-mono text-3xl font-bold ${color}`}>{counts[k]}</div>
                <div className="text-muted text-sm">{label}</div>
              </div>
            ))}
          </div>
        )}
        <button className="btn-primary min-w-48 text-lg" onClick={onStudy} disabled={!counts || pending === 0}>
          {tx.study}
        </button>
        {counts && pending === 0 && <p className="text-muted text-sm">{deck.cards.length ? tx.finished : tx.empty}</p>}
      </div>
      <div className="card p-4">
        <div className="text-muted mb-3 text-xs font-bold tracking-wider uppercase">{tx.forecast}</div>
        <div className="flex h-28 items-end gap-2">
          {deck.forecast.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-muted text-xs">{n}</span>
              <div className="bg-accent w-full rounded-t-md" style={{ height: `${(n / max) * 70 + (n ? 4 : 1)}px` }} />
              <span className="text-muted text-xs">{tx.days[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Separa "pregunta<TAB>respuesta", "pregunta;respuesta" o "pregunta - respuesta" (una por línea). */
function parsePasted(text: string) {
  const out: { front: string; back: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.includes("\t") ? line.split("\t") : line.includes(";") ? line.split(";") : line.split(" - ");
    if (parts.length < 2) continue;
    const front = parts[0].trim();
    const back = parts.slice(1).join(" ").trim();
    if (front && back) out.push({ front, back });
  }
  return out;
}

function AddCards({ deck, tx, onAdded }: { deck: DeckDetail; tx: (typeof TEXT)["es"]; onAdded: () => void }) {
  const lang = useLang() as Lang;
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [doc, setDoc] = useState("");
  const [paste, setPaste] = useState("");
  const parsed = useMemo(() => parsePasted(paste), [paste]);

  useEffect(() => {
    api
      .get<DocumentItem[]>("/documents")
      .then((d) => setDocs(d.filter((x) => x.status === "ready" && (x.source_type ?? "apuntes") === "apuntes")))
      .catch(() => undefined);
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg("");
    try {
      setMsg(await fn());
      onAdded();
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <OcclusionEditor deckId={deck.id} lang={lang} onCreated={onAdded} />
      <form
        className="card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api.post(`/decks/${deck.id}/cards`, { cards: [{ front, back }] });
            setFront("");
            setBack("");
            return tx.added(1);
          });
        }}
      >
        <label className="block">
          <span className="font-semibold">{tx.front}</span>
          <textarea
            className="input mt-1 min-h-20"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            maxLength={4000}
          />
        </label>
        <label className="block">
          <span className="font-semibold">{tx.backSide}</span>
          <textarea
            className="input mt-1 min-h-24"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            maxLength={8000}
          />
        </label>
        <button className="btn-primary" disabled={busy || !front.trim() || !back.trim()}>
          <Plus size={18} aria-hidden="true" /> {tx.addCard}
        </button>
      </form>
      {msg && (
        <p className="bg-success-soft text-success rounded-xl p-3 text-sm font-semibold" role="status">
          {msg}
        </p>
      )}

      <div className="card space-y-3 p-4">
        <h2 className="font-bold">{tx.importTitle}</h2>
        <p className="text-muted text-sm">{tx.importHelp}</p>
        <div className="flex flex-wrap gap-2">
          <select
            className="input min-w-0 flex-1"
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            aria-label={tx.importTitle}
          >
            <option value="">{tx.chooseDoc}</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <button
            className="btn-secondary"
            disabled={busy || !doc}
            onClick={() =>
              run(async () => {
                const r = await api.post<{ added: number; skipped: number }>(`/decks/${deck.id}/import`, {
                  document_id: doc,
                });
                return tx.imported(r.added, r.skipped);
              })
            }
          >
            <DownloadSimple size={18} aria-hidden="true" /> {tx.importBtn}
          </button>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="font-bold">{tx.pasteTitle}</h2>
        <p className="text-muted text-sm">{tx.pasteHelp}</p>
        <textarea
          className="input min-h-32 font-mono text-sm"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"¿Qué es el efecto fotoeléctrico?\tAbsorción total del fotón por un electrón de capa interna"}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-secondary"
            disabled={busy || parsed.length === 0}
            onClick={() =>
              run(async () => {
                await api.post(`/decks/${deck.id}/cards`, { cards: parsed.slice(0, 2000) });
                setPaste("");
                return tx.added(Math.min(parsed.length, 2000));
              })
            }
          >
            {tx.pasteBtn}
          </button>
          {paste && <span className="text-muted text-sm">{tx.pasteFound(parsed.length)}</span>}
        </div>
      </div>
    </div>
  );
}

function Browse({
  deck,
  tx,
  lang,
  onChange,
}: {
  deck: DeckDetail;
  tx: (typeof TEXT)["es"];
  lang: Lang;
  onChange: () => void;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ front: "", back: "" });
  const [error, setError] = useState("");
  const shown = deck.cards.filter((c) => !q || `${c.front} ${c.back}`.toLowerCase().includes(q.toLowerCase()));
  const [now] = useState(() => Date.now());

  if (deck.cards.length === 0) return <p className="card text-muted p-4">{tx.empty}</p>;
  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass size={18} className="text-muted absolute top-1/2 left-3 -translate-y-1/2" aria-hidden="true" />
        <input
          className="input pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tx.search}
          aria-label={tx.search}
        />
      </div>
      {error && <ErrorBox message={error} />}
      <ul className="space-y-2">
        {shown.map((c) => (
          <li key={c.id} className="card p-4">
            {editing === c.id ? (
              <div className="space-y-2">
                <textarea
                  className="input min-h-16"
                  value={draft.front}
                  onChange={(e) => setDraft({ ...draft, front: e.target.value })}
                />
                <textarea
                  className="input min-h-20"
                  value={draft.back}
                  onChange={(e) => setDraft({ ...draft, back: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    className="btn-primary min-h-9"
                    disabled={!draft.front.trim() || !draft.back.trim()}
                    onClick={async () => {
                      try {
                        await api.patch(`/decks/cards/${c.id}`, draft);
                        setEditing(null);
                        onChange();
                      } catch (err) {
                        setError(errorMessage(err));
                      }
                    }}
                  >
                    {tx.save}
                  </button>
                  <button className="btn-ghost min-h-9" onClick={() => setEditing(null)}>
                    {tx.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {c.image_url && c.occlusion ? (
                    <div className="max-w-xs">
                      <OcclusionView url={c.image_url} boxes={c.occlusion.boxes} target={c.occlusion.target} revealed />
                    </div>
                  ) : (
                    <div className="font-semibold whitespace-pre-wrap">{c.front}</div>
                  )}
                  <div className="text-muted mt-1 text-sm whitespace-pre-wrap">{c.back}</div>
                  <div className="text-muted mt-2 text-xs">
                    {tx.state[c.state]}
                    {c.state !== "new" &&
                      ` · ${tx.dueIn(new Date(c.due_at).getTime() <= now ? "ya" : span((new Date(c.due_at).getTime() - now) / 1000, lang))}`}
                  </div>
                </div>
                <button
                  className="btn-ghost min-h-9 px-2"
                  aria-label={tx.save}
                  onClick={() => {
                    setEditing(c.id);
                    setDraft({ front: c.front, back: c.back });
                  }}
                >
                  <PencilSimple size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn-ghost text-danger min-h-9 px-2"
                  aria-label={tx.del}
                  onClick={async () => {
                    if (!confirm(tx.confirmDeleteCard)) return;
                    try {
                      await api.del(`/decks/cards/${c.id}`);
                      onChange();
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  }}
                >
                  <Trash size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Settings({ deck, tx, onChange }: { deck: DeckDetail; tx: (typeof TEXT)["es"]; onChange: () => void }) {
  const [name, setName] = useState(deck.name);
  const [perDay, setPerDay] = useState(deck.new_per_day);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  return (
    <div className="space-y-4">
      <form
        className="card space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.patch(`/decks/${deck.id}`, { name: name.trim(), new_per_day: perDay });
            setSaved(true);
            onChange();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <label className="block">
          <span className="font-semibold">{tx.rename}</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label className="block">
          <span className="font-semibold">{tx.newPerDay}</span>
          <input
            type="number"
            className="input mt-1 w-32"
            min={0}
            max={500}
            value={perDay}
            onChange={(e) => setPerDay(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
          />
        </label>
        <button className="btn-primary" disabled={!name.trim()}>
          {tx.save}
        </button>
        {saved && <span className="text-success ml-3 text-sm font-semibold">✓</span>}
      </form>
      {error && <ErrorBox message={error} />}
      <button
        className="btn-ghost text-danger"
        onClick={async () => {
          if (!confirm(tx.confirmDeleteDeck)) return;
          try {
            await api.del(`/decks/${deck.id}`);
            router.push("/mazos");
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <Trash size={18} aria-hidden="true" /> {tx.deleteDeck}
      </button>
    </div>
  );
}

// ---------- Sesión de estudio ----------

function DeckStudy({ id, onExit }: { id: string; onExit: () => void }) {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const [queue, setQueue] = useState<DeckCard[] | null>(null);
  const [aheadMs, setAheadMs] = useState(20 * 60_000);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api
      .get<{ cards: DeckCard[]; learn_ahead_ms: number }>(`/decks/${id}/study?tz=${tz()}`)
      .then((r) => {
        setQueue(r.cards);
        setAheadMs(r.learn_ahead_ms);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  // Reloj para las tarjetas en aprendizaje que vuelven a los pocos minutos.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Siguiente tarjeta: las de aprendizaje que ya tocan, luego repasos y nuevas; si solo quedan de
  // aprendizaje que aún no tocan, se adelanta la primera (como hace Anki).
  const learning = (c: DeckCard) => c.state === "learning" || c.state === "relearning";
  const current = useMemo(() => {
    if (!queue?.length) return null;
    const dueLearning = queue.filter((c) => learning(c) && new Date(c.due_at).getTime() <= now);
    if (dueLearning.length) return dueLearning[0];
    const other = queue.find((c) => !learning(c));
    return other ?? queue[0];
  }, [queue, now]);

  const counts = useMemo(() => {
    const q = queue ?? [];
    return {
      new_today: q.filter((c) => c.state === "new").length,
      learning: q.filter(learning).length,
      review: q.filter((c) => c.state === "review").length,
    };
  }, [queue]);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        const next = await api.post<DeckCard>(`/decks/cards/${current.id}/answer`, { rating });
        setQueue((q) => {
          const rest = (q ?? []).filter((c) => c.id !== current.id);
          // Si vuelve dentro de poco (aprendizaje), se queda en la cola de hoy.
          if (learning(next) && new Date(next.due_at).getTime() - Date.now() <= aheadMs) {
            rest.push(next);
            rest.sort((a, b) => Number(!learning(a)) - Number(!learning(b)) || a.due_at.localeCompare(b.due_at));
          }
          return rest;
        });
        setShown(false);
        setNow(Date.now());
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [current, busy, aheadMs],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) answer(Number(e.key) as Rating);
      else if (shown && e.key === " ") {
        e.preventDefault();
        answer(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, answer]);

  if (error) return <ErrorBox message={error} />;
  if (!queue) return <Spinner />;

  if (!current) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <div className="text-xl font-bold">{tx.finished}</div>
        <p className="text-muted">{tx.finishedHelp}</p>
        <button className="btn-primary mt-2" onClick={onExit}>
          {tx.back}
        </button>
      </div>
    );
  }

  const early = learning(current) && new Date(current.due_at).getTime() > now;
  const tone = ["bg-rose-600", "bg-amber-500", "bg-emerald-600", "bg-sky-600"];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <button className="btn-ghost min-h-9 px-2" onClick={onExit}>
          <ArrowLeft size={18} aria-hidden="true" /> {tx.back}
        </button>
        <Counts d={counts} tx={tx} />
      </div>
      {early && (
        <p className="text-muted text-center text-sm">
          {tx.waiting(span((new Date(current.due_at).getTime() - now) / 1000, lang))}
        </p>
      )}
      <div className="card min-h-40 p-6 text-center sm:min-h-64">
        {current.image_url && current.occlusion ? (
          <>
            <div className="text-muted mb-3 text-sm font-semibold">
              {current.front.replace(/^🖼️\s*/, "") || occlusionText(lang).question}
            </div>
            <OcclusionView
              url={current.image_url}
              boxes={current.occlusion.boxes}
              target={current.occlusion.target}
              revealed={shown}
            />
          </>
        ) : (
          <div className="text-xl font-semibold whitespace-pre-wrap">{current.front}</div>
        )}
        {shown && (
          <>
            <hr className="border-border my-5" />
            <div className="text-lg whitespace-pre-wrap">{current.back}</div>
          </>
        )}
      </div>
      {!shown ? (
        <button className="btn-primary w-full text-lg" onClick={() => setShown(true)}>
          {tx.show}
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {([1, 2, 3, 4] as Rating[]).map((r) => (
            <button
              key={r}
              disabled={busy}
              onClick={() => answer(r)}
              className={`flex min-h-16 flex-col items-center justify-center rounded-xl px-1 font-semibold text-white ${tone[r - 1]} disabled:opacity-60`}
            >
              <span className="text-xs opacity-90">{current.previews ? span(current.previews[r], lang) : ""}</span>
              <span className="text-sm sm:text-base">{tx.buttons[r - 1]}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-muted hidden text-center text-xs sm:block">{tx.keys}</p>
    </div>
  );
}
