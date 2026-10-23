"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle,
  Copy,
  FileDoc,
  FilePdf,
  MagnifyingGlass,
  NotePencil,
  Plus,
  Sparkle,
  ArrowCounterClockwise,
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
  cover?: Cover;
}

/** Portada del Word. */
interface Cover {
  institution: string;
  course: string;
  subject: string;
  title: string;
  subtitle: string;
  authors: string;
  number: string;
  teacher: string;
  year: string;
  semester: string;
  place: string;
  date: string;
  toc: boolean;
}

// Textos del Word en el idioma del trabajo (no en el de la web), según la guía de trabajos de la ESSCVP – Alto Tâmega.
const COVER_TEXT = {
  es: {
    course: "Licenciatura en Imagen Médica y Radioterapia",
    year: "1.º curso",
    number: "n.º",
    teacher: "Docente:",
    toc: "Índice",
    acronyms: "Lista de abreviaturas, siglas y acrónimos",
    symbols: "Lista de símbolos",
    references: "Referencias bibliográficas",
  },
  pt: {
    course: "Licenciatura em Imagem Médica e Radioterapia",
    year: "1.º ano",
    number: "n.º",
    teacher: "Docente:",
    toc: "Índice geral",
    acronyms: "Lista de abreviaturas, siglas e acrónimos",
    symbols: "Lista de símbolos",
    references: "Referências bibliográficas",
  },
};

function defaultCover(a: Assignment): Cover {
  const ct = COVER_TEXT[a.meta.lang];
  const now = new Date();
  const loc = a.meta.lang === "pt" ? "pt-PT" : "es-ES";
  // El curso empieza en septiembre: de septiembre a enero, 1.er semestre; de febrero a julio, 2.º.
  const second = now.getMonth() >= 1 && now.getMonth() <= 7;
  return {
    institution: "Escola Superior de Saúde Cruz Vermelha Portuguesa – Alto Tâmega",
    course: ct.course,
    subject: a.meta.subject ?? "",
    title: a.title,
    subtitle: "",
    authors: "",
    number: "",
    teacher: "",
    year: ct.year,
    semester: second ? "2.º semestre" : a.meta.lang === "pt" ? "1.º semestre" : "1.er semestre",
    place: "Chaves",
    // Como en el modelo de la escuela: "Chaves, outubro 2026" (mes en minúscula).
    date: `${now.toLocaleDateString(loc, { month: "long" })} ${now.getFullYear()}`,
    toc: true,
    ...Object.fromEntries(Object.entries(a.cover_defaults ?? {}).filter(([, v]) => typeof v === "string" && v.trim())),
  };
}
/** Quita emoticonos y espacios de sobra de un nombre de asignatura. */
const plainName = (t: string) =>
  t
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** Los trabajos se entregan en portugués: la asignatura va con su nombre en portugués, como en su horario. */
const ptName = (s?: Subject) => (s ? plainName(s.name_pt ?? s.name) : undefined);

/** Pasa un nombre guardado (quizá en español o con emoticono) al nombre en portugués de esa asignatura. */
function ptSubject(text: string, subjects: Subject[]) {
  const t = plainName(text);
  const hit = subjects.find((s) => plainName(s.name) === t || ptName(s) === t);
  return hit ? ptName(hit)! : t;
}

const coverOf = (a: Assignment, subjects: Subject[] = []): Cover => {
  const cover = { ...defaultCover(a), ...(a.meta.cover ?? {}) };
  const own = subjects.find((s) => s.id === a.subject_id);
  return { ...cover, subject: cover.subject ? ptSubject(cover.subject, subjects) : (ptName(own) ?? "") };
};

interface Section {
  id: string;
  title: string;
  goal: string;
  words: number;
  research: string;
  sources: WebSource[];
  draft: string;
  // Lo que la IA está haciendo ahora en el servidor con este apartado, y el error si falló.
  status?: "research" | "draft" | "queued" | "translate" | "polish" | null;
  // El borrador antes de la última revisión con Haiku (para deshacerla).
  before_polish?: string | null;
  error?: string | null;
  // Avisos de la IA sobre el borrador (aparte del texto: no van al Word).
  notes?: string;
  // Las referencias de la investigación ya se comprobaron solas.
  checked?: boolean;
}

interface Assignment {
  id: string;
  title: string;
  subject_id: string | null;
  meta: Meta;
  sections: Section[];
  updated_at?: string;
  running?: boolean;
  // Sus datos de la última portada que rellenó (para no tener que escribirlos otra vez).
  cover_defaults?: Partial<Cover> | null;
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
    tabs: { write: "Índice y redacción", cover: "Portada", bib: "Bibliografía", review: "Revisar mi texto" },
    coverIntro:
      "Portada y hoja de rosto como en el modelo de la guía de la escuela. Ya vienen rellenas: completa tu nombre, tu número mecanográfico y el docente.",
    coverFields: {
      institution: "Escuela",
      course: "Carrera",
      subject: "Asignatura",
      title: "Título del trabajo",
      subtitle: "Subtítulo o tipo (opcional)",
      authors: "Tu nombre completo (si sois varios, uno por línea: «Nombre, n.º 12345»)",
      number: "N.º mecanográfico",
      teacher: "Docente responsable de la UC",
      year: "Curso",
      semester: "Semestre",
      place: "Lugar",
      date: "Fecha",
    },
    coverToc: "",
    coverSaved: "Portada guardada",
    coverPreview: "Vista previa",
    capa: "Portada",
    rosto: "Hoja de rosto (con el docente)",
    coverReset: "Volver a lo de por defecto",
    editData: "Datos del trabajo",
    save: "Guardar",
    proposeOutline: "Proponer índice",
    proposing: "Pensando el índice…",
    orWrite: "O escribe tú el índice (un apartado por línea):",
    useOutline: "Usar este índice",
    addSection: "Añadir apartado",
    goal: "Qué contar",
    research: "Investigar",
    researchLabel: "Fuentes que ha consultado la IA",
    researchHint:
      "Son las páginas y artículos que la IA ha leído para escribir este apartado. No tienes que hacer nada con ellos: van solos a la Bibliografía. Si quieres, abre uno o dos para ver que existen.",
    notesTitle: "📝 Antes de entregar, mira esto:",
    retry: "Reintentar",
    guideTitle: "¿Qué tengo que hacer?",
    guide: [
      "Crea el índice (la IA te lo propone).",
      "Pulsa «Hacer el trabajo entero»: la IA busca fuentes y escribe todos los apartados.",
      "Lee cada borrador y cámbialo con tus palabras: quita, añade o reordena lo que quieras. Si sale un recuadro amarillo, léelo.",
      "Mira la pestaña «Bibliografía»: las referencias ya se comprueban solas (las que no existen se quitan). No tienes que buscar nada.",
      "Revisa la pestaña «Portada» (tu nombre, número y docente) y pulsa «Descargar en Word»: sale con el formato de la guía de la escuela (portada, folha de rosto, índice, listas de siglas y referencias).",
    ],
    researching: "Buscando en fuentes fiables… (puede tardar un minuto)",
    auto: "Hacer el trabajo entero",
    autoHint:
      "La IA investiga y redacta todos los apartados que falten, uno detrás de otro (unos minutos). Puedes cerrar la web: sigue trabajando sola.",
    useAndAuto: "Usar este índice y hacer el trabajo entero",
    draft: "Redactar borrador",
    drafting: "Redactando…",
    queued: "En cola: la IA lo hará en cuanto termine con el anterior…",
    translating: "Traduciendo al portugués…",
    polish: "Revisar con Haiku",
    polishHint:
      "Haiku es una IA mejor (de pago): corrige datos y citas, mejora la redacción y comprueba lo dudoso con una o dos búsquedas. Úsalo al final, cuando el borrador ya esté bien.",
    polishing: "Haiku está revisando el apartado… (un minuto)",
    polishChanges: "Lo que ha cambiado Haiku",
    undoPolish: "Deshacer la revisión",
    toPt: "Este trabajo está en español y la escuela pide entregarlos en portugués. La IA traduce todos los apartados (con las citas y referencias adaptadas) y el Word saldrá en portugués.",
    toPtBtn: "Pasar el trabajo a portugués",
    redo: "Rehacer",
    draftLabel: "Borrador (edítalo con tus palabras)",
    noResearch: "Al redactar, la IA investiga antes este apartado para que el borrador tenga datos y citas.",
    working: (r: number, d: number, n: number) =>
      `La IA está trabajando… ${r}/${n} investigados · ${d}/${n} redactados. Puedes cerrar la web: sigue sola y al volver lo verás.`,
    findRefs: "Buscar las referencias",
    findRefsHint: (n: number) =>
      `${n} ${n === 1 ? "apartado no tiene" : "apartados no tienen"} fuentes todavía. La IA las busca en fuentes fiables y monta la lista en el formato de citas del trabajo (no cambia tus borradores).`,
    citeHint:
      "Para que el texto lleve las citas (Autor, año) en su sitio, pulsa «Redactar borrador · Rehacer» en los apartados que se escribieron sin fuentes (ojo: sustituye ese borrador).",
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
    pdf: "Descargar en PDF",
    pdfBusy: "Preparando el PDF…",
    integrity:
      "Los borradores son un punto de partida: léelos y cámbialos con tus palabras. Así el trabajo es tuyo de verdad y podrás defenderlo si te preguntan.",
    checkedRefs: "✓ Enlaces y DOI comprobados automáticamente: las referencias que no existían se han quitado.",
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
    tabs: { write: "Índice e redação", cover: "Capa", bib: "Bibliografia", review: "Rever o meu texto" },
    coverIntro:
      "Capa e folha de rosto como no modelo do guia da escola. Já vêm preenchidas: completa o teu nome, o teu número mecanográfico e o docente.",
    coverFields: {
      institution: "Escola",
      course: "Curso",
      subject: "Unidade curricular",
      title: "Título do trabalho",
      subtitle: "Subtítulo ou tipo (opcional)",
      authors: "O teu nome completo (se forem vários, um por linha: «Nome, n.º 12345»)",
      number: "N.º mecanográfico",
      teacher: "Docente responsável pela UC",
      year: "Ano",
      semester: "Semestre",
      place: "Local",
      date: "Data",
    },
    coverToc: "",
    coverSaved: "Capa guardada",
    coverPreview: "Pré-visualização",
    capa: "Capa",
    rosto: "Folha de rosto (com o docente)",
    coverReset: "Voltar ao predefinido",
    editData: "Dados do trabalho",
    save: "Guardar",
    proposeOutline: "Propor índice",
    proposing: "A pensar no índice…",
    orWrite: "Ou escreve tu o índice (uma secção por linha):",
    useOutline: "Usar este índice",
    addSection: "Adicionar secção",
    goal: "O que contar",
    research: "Pesquisar",
    researchLabel: "Fontes que a IA consultou",
    researchHint:
      "São as páginas e artigos que a IA leu para escrever esta secção. Não tens de fazer nada com eles: vão sozinhos para a Bibliografia. Se quiseres, abre um ou dois para ver que existem.",
    notesTitle: "📝 Antes de entregar, vê isto:",
    retry: "Tentar outra vez",
    guideTitle: "O que tenho de fazer?",
    guide: [
      "Cria o índice (a IA propõe-to).",
      "Toca em «Fazer o trabalho todo»: a IA procura fontes e escreve todas as secções.",
      "Lê cada rascunho e muda-o com as tuas palavras: tira, acrescenta ou reordena o que quiseres. Se aparecer um quadro amarelo, lê-o.",
      "Vê o separador «Bibliografia»: as referências já são verificadas sozinhas (as que não existem são retiradas). Não tens de procurar nada.",
      "Revê o separador «Capa» (o teu nome, número e docente) e toca em «Descarregar em Word»: sai com o formato do guia da escola (capa, folha de rosto, índice, listas de siglas e referências).",
    ],
    researching: "A procurar em fontes fiáveis… (pode demorar um minuto)",
    auto: "Fazer o trabalho todo",
    autoHint:
      "A IA pesquisa e redige todas as secções que faltam, uma a seguir à outra (alguns minutos). Podes fechar a web: continua a trabalhar sozinha.",
    useAndAuto: "Usar este índice e fazer o trabalho todo",
    draft: "Redigir rascunho",
    drafting: "A redigir…",
    queued: "Em fila: a IA faz isto assim que acabar o anterior…",
    translating: "A traduzir para português…",
    polish: "Rever com o Haiku",
    polishHint:
      "O Haiku é uma IA melhor (paga): corrige dados e citações, melhora a redação e confirma o que for duvidoso com uma ou duas pesquisas. Usa-o no fim, quando o rascunho já estiver bem.",
    polishing: "O Haiku está a rever a secção… (um minuto)",
    polishChanges: "O que o Haiku mudou",
    undoPolish: "Desfazer a revisão",
    toPt: "Este trabalho está em espanhol e a escola pede para os entregar em português. A IA traduz todas as secções (com as citações e referências adaptadas) e o Word sai em português.",
    toPtBtn: "Passar o trabalho para português",
    redo: "Refazer",
    draftLabel: "Rascunho (edita-o com as tuas palavras)",
    noResearch: "Ao redigir, a IA pesquisa antes esta secção para o rascunho ter dados e citações.",
    working: (r: number, d: number, n: number) =>
      `A IA está a trabalhar… ${r}/${n} pesquisadas · ${d}/${n} redigidas. Podes fechar a web: continua sozinha e quando voltares vês.`,
    findRefs: "Procurar as referências",
    findRefsHint: (n: number) =>
      `${n} ${n === 1 ? "secção ainda não tem" : "secções ainda não têm"} fontes. A IA procura-as em fontes fiáveis e monta a lista no formato de citações do trabalho (não muda os teus rascunhos).`,
    citeHint:
      "Para o texto ter as citações (Autor, ano) no sítio certo, toca em «Redigir rascunho · Refazer» nas secções escritas sem fontes (atenção: substitui esse rascunho).",
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
    pdf: "Descarregar em PDF",
    pdfBusy: "A preparar o PDF…",
    integrity:
      "Os rascunhos são um ponto de partida: lê-os e muda-os com as tuas palavras. Assim o trabalho é mesmo teu e consegues defendê-lo se te perguntarem.",
    checkedRefs: "✓ Ligações e DOI verificados automaticamente: as referências que não existiam foram retiradas.",
    references: "Referências bibliográficas",
    words_: (n: number) => `${n} palavras`,
  },
};
type Tx = (typeof TEXT)["es"];

const newId = () => Math.random().toString(36).slice(2, 10);

/** Investigaciones antiguas traían "Pendiente de confirmar": ya no se enseña (la IA no usa esos datos). */
const cleanResearch = (md: string) =>
  md
    .replace(
      /\n?#{2,4}\s*(Pendiente de confirmar|Por confirmar|Dónde buscar|Onde procurar)[\s\S]*?(?=\n#{2,4}\s|$)/gi,
      "",
    )
    .trim();

// La IA no siempre titula igual la lista ("### Fontes", "## Fontes consultadas", "**Referências:**"…).
const SOURCES_RE =
  /^[ \t]*(?:#{1,4}[ \t]*)?\**[ \t]*(?:Fuentes|Fontes|Referencias|Referências|Bibliograf[ií]a)\b[^\n]*\n([\s\S]*?)(?=\n[ \t]*#{1,4}[ \t]|(?![\s\S]))/im;
// Si no hay título, se reconocen las referencias por su forma: "Autor, A. (2023). Título…"
// (no las frases con citas, como "Rich (1997, p. 7) recorda que…").
const REF_LINE_RE = /^\s*(?:[-*•]|\d+[.)])?\s*[^()\n]{2,300}?\.?\s*\((?:\d{4}[a-z]?|s\.\s?[df]\.)(?:,[^)\n]*)?\)\./i;

/** Líneas de la sección "Fuentes"/"Fontes" de cada investigación, sin repetir. */
function bibliography(sections: Section[], style: Meta["citation"]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sections) {
    const m = s.research.match(SOURCES_RE);
    const lines = m
      ? m[1].split("\n")
      : s.research.split("\n").filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l) && REF_LINE_RE.test(l));
    for (const raw of lines) {
      const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
      if (line.length < 12 || line === "—") continue;
      // En APA, solo referencias de verdad (no frases con citas que la IA haya dejado en la lista).
      if (style === "APA" && !REF_LINE_RE.test(line)) continue;
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
    kind: KINDS.pt[0],
    words: 2000,
    // La escuela pide entregar los trabajos en portugués (se puede cambiar en el formulario).
    lang: "pt" as Lang,
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
      const subject = ptName(subjects.find((s) => s.id === form.subject_id));
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
  // Se escribe libremente (se puede borrar del todo) y solo se ajusta a 100–30 000 al salir del campo.
  const [wordsText, setWordsText] = useState(String(form.words));
  const clampWords = (v: string) => Math.max(100, Math.min(30000, Math.round(Number(v) || 100)));
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
            inputMode="numeric"
            value={wordsText}
            onChange={(e) => {
              setWordsText(e.target.value);
              const n = Number(e.target.value);
              if (n >= 100 && n <= 30000) setForm({ ...form, words: Math.round(n) });
            }}
            onBlur={() => {
              const n = clampWords(wordsText);
              setWordsText(String(n));
              setForm({ ...form, words: n });
            }}
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
              {ptName(s)}
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

type Tab = "write" | "cover" | "bib" | "review";

export function AssignmentView({ id }: { id: string }) {
  const lang = useLang() as Lang;
  const tx = TEXT[lang];
  const router = useRouter();
  const [a, setA] = useState<Assignment | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("write");
  const [editMeta, setEditMeta] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

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
  const run = (s: Section, kind: "research" | "draft" | "polish") => launch(`sections/${s.id}/${kind}`);

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
        subtitle={`${a.meta.kind} · ${tx.words_(a.meta.words)} · ${a.meta.lang === "pt" ? "Português" : "Español"} · ${a.meta.citation}${a.meta.subject ? ` · ${ptSubject(a.meta.subject, subjects)}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => exportWord(a, subjects)} disabled={!drafted}>
              <FileDoc size={18} aria-hidden="true" /> {tx.word}
            </button>
            <button
              className="btn-secondary"
              disabled={!drafted || pdfBusy}
              onClick={async () => {
                setPdfBusy(true);
                try {
                  await exportPdf(a, subjects);
                } finally {
                  setPdfBusy(false);
                }
              }}
            >
              <FilePdf size={18} aria-hidden="true" /> {pdfBusy ? tx.pdfBusy : tx.pdf}
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

      {running && (
        <div className="card border-accent mb-4 flex items-center gap-3 border-2 p-4">
          <Spinner />
          <p className="text-sm font-medium">{tx.working(researched, drafted, n)}</p>
        </div>
      )}

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
          <details className="card p-4" open={drafted < n || n === 0}>
            <summary className="cursor-pointer font-semibold">{tx.guideTitle}</summary>
            <ol className="mt-3 space-y-2 text-sm">
              {tx.guide.map((step, k) => {
                const done = (k === 0 && n > 0) || (k === 1 && n > 0 && drafted === n);
                return (
                  <li key={k} className="flex gap-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        done ? "bg-success text-white" : "bg-accent-soft text-accent"
                      }`}
                    >
                      {done ? "✓" : k + 1}
                    </span>
                    <span className={done ? "text-muted line-through" : ""}>{step}</span>
                  </li>
                );
              })}
            </ol>
            <p className="text-muted mt-3 text-xs">{tx.integrity}</p>
          </details>
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
              {!running && a.meta.lang === "es" && (
                <div className="card border-accent space-y-2 border-2 p-4">
                  <p className="text-sm">🇵🇹 {tx.toPt}</p>
                  <button className="btn-primary" onClick={() => launch("translate")}>
                    {tx.toPtBtn}
                  </button>
                </div>
              )}
              {!running && drafted < n && (
                <div className="card space-y-2 p-4">
                  <button className="btn-primary w-full sm:w-auto" onClick={() => launch("auto")}>
                    <Sparkle size={18} aria-hidden="true" /> {tx.auto}
                  </button>
                  <p className="text-muted text-sm">{tx.autoHint}</p>
                </div>
              )}
              {a.sections.map((s, i) => (
                <SectionCard
                  key={s.id}
                  s={s}
                  i={i}
                  n={n}
                  tx={tx}
                  working={s.status ?? undefined}
                  busy={!!s.status}
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
      {tab === "cover" && <CoverEditor a={a} subjects={subjects} tx={tx} onSaved={setA} />}
      {tab === "bib" && <Bibliography a={a} tx={tx} running={running} onFind={() => launch("references")} />}
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
              subject: ptName(subjects.find((s) => s.id === form.subject_id)),
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
  working?: "research" | "draft" | "queued" | "translate" | "polish";
  busy: boolean;
  onChange: (patch: Partial<Section>) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  onRun: (k: "research" | "draft" | "polish") => void;
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
        {s.draft && (
          <button className="btn-secondary" disabled={busy} onClick={() => onRun("polish")} title={tx.polishHint}>
            <Sparkle size={18} aria-hidden="true" /> {tx.polish}
          </button>
        )}
      </div>
      {s.draft && !s.before_polish && !working && <p className="text-muted text-xs">{tx.polishHint}</p>}
      {working && (
        <Spinner
          label={
            working === "research"
              ? tx.researching
              : working === "draft"
                ? tx.drafting
                : working === "translate"
                  ? tx.translating
                  : working === "polish"
                    ? tx.polishing
                    : tx.queued
          }
        />
      )}
      {s.error && !working && (
        <ErrorBox message={s.error} onRetry={busy ? undefined : () => onRun(s.research ? "draft" : "research")} />
      )}

      {s.research && (
        <details className="bg-surface-2 rounded-xl p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            <BookOpen size={16} className="mr-1 inline" aria-hidden="true" />
            {tx.researchLabel}
          </summary>
          <p className="text-muted mt-2 text-xs">{tx.researchHint}</p>
          <div className="mt-2 text-sm">
            <Markdown>{cleanResearch(s.research)}</Markdown>
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
            disabled={working === "draft" || working === "polish"}
          />
        </label>
      )}
      {s.notes && s.draft && !working && (
        <div className="bg-warning-soft rounded-xl p-3 text-sm">
          <p className="font-semibold">{s.before_polish ? tx.polishChanges : tx.notesTitle}</p>
          <Markdown>{s.notes}</Markdown>
        </div>
      )}
      {s.before_polish && !working && (
        <button
          className="btn-ghost text-sm"
          onClick={() => onChange({ draft: s.before_polish!, before_polish: null, notes: "" })}
        >
          <ArrowCounterClockwise size={16} aria-hidden="true" /> {tx.undoPolish}
        </button>
      )}
    </div>
  );
}

/** Cómo se escribe el autor en la portada: "Nombre, n.º 12345" (si hay un solo autor y número aparte). */
function authorLines(cover: Cover, ct: (typeof COVER_TEXT)["es"]) {
  const lines = cover.authors
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 1 && cover.number.trim()) return [`${lines[0]}, ${ct.number} ${cover.number.trim()}`];
  return lines;
}

function CoverEditor({
  a,
  subjects,
  tx,
  onSaved,
}: {
  a: Assignment;
  subjects: Subject[];
  tx: Tx;
  onSaved: (a: Assignment) => void;
}) {
  const [raw, setCover] = useState<Cover>(() => coverOf(a, subjects));
  // Las asignaturas pueden llegar después de abrir la pestaña: el nombre se pasa al portugués al mostrarlo.
  const cover = { ...raw, subject: raw.subject && ptSubject(raw.subject, subjects) };
  // Sus asignaturas en portugués (y la que ya tuviera escrita, por si no es ninguna de ellas).
  const subjectOptions = [...new Set([...subjects.map((s) => ptName(s)!), cover.subject].filter(Boolean))];
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const ct = COVER_TEXT[a.meta.lang];
  const set = (k: keyof Cover, v: string | boolean) => {
    setCover((c) => ({ ...c, [k]: v }));
    setState("idle");
  };
  async function save(next = cover) {
    setState("saving");
    setError("");
    try {
      onSaved(await api.patch<Assignment>(`/assignments/${a.id}`, { meta: { ...a.meta, cover: next } }));
      setState("saved");
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  }
  const field = (k: Exclude<keyof Cover, "toc" | "institution">, multiline = false) => (
    <label key={k} className="block">
      <span className="text-sm font-semibold">{tx.coverFields[k]}</span>
      {multiline ? (
        <textarea className="input mt-1 min-h-20" value={cover[k]} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className="input mt-1" value={cover[k]} onChange={(e) => set(k, e.target.value)} />
      )}
    </label>
  );
  const authors = authorLines(cover, ct);
  // Hoja A4 en miniatura con la disposición del modelo de la escuela.
  const page = (rosto: boolean) => (
    <div
      className="flex aspect-[210/297] w-full flex-col items-center bg-white px-[9%] py-[8%] text-center text-[#222] shadow-lg"
      style={{ fontFamily: "Calibri, Carlito, Arial, sans-serif" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de la portada, no merece next/image */}
      <img src="/esscvp-logo.png" alt="" className="w-[26%]" />
      <p className="mt-[6%] text-[clamp(7px,1.3vw,11px)] font-semibold uppercase">{cover.course}</p>
      <p className="text-[clamp(6px,1.1vw,9px)]">{[cover.year, cover.semester].filter(Boolean).join(", ")}</p>
      {cover.subject && <p className="mt-[3%] text-[clamp(6px,1.1vw,9px)]">{cover.subject}</p>}
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-[clamp(9px,1.8vw,14px)] leading-tight font-bold">{cover.title}</p>
        {cover.subtitle && <p className="mt-1 text-[clamp(7px,1.3vw,11px)]">{cover.subtitle}</p>}
      </div>
      <div className="w-full text-right text-[clamp(6px,1.1vw,9px)] leading-relaxed">
        {authors.map((l, i) => (
          <p key={i} className="font-semibold">
            {l}
          </p>
        ))}
        {rosto && cover.teacher && (
          <p className="mt-[4%]">
            {ct.teacher} {cover.teacher}
          </p>
        )}
      </div>
      <p className="mt-[14%] text-[clamp(6px,1.1vw,9px)]">
        {rosto ? "\u00a0" : [cover.place, cover.date].filter(Boolean).join(", ")}
      </p>
    </div>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card space-y-3 p-4">
        <p className="text-muted text-sm">{tx.coverIntro}</p>
        {field("authors", true)}
        <div className="grid grid-cols-2 gap-3">
          {field("number")}
          {field("teacher")}
        </div>
        {field("title")}
        {field("subtitle")}
        <label className="block">
          <span className="text-sm font-semibold">{tx.coverFields.subject}</span>
          <select className="input mt-1" value={cover.subject} onChange={(e) => set("subject", e.target.value)}>
            <option value="">—</option>
            {subjectOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {field("course")}
        <div className="grid grid-cols-2 gap-3">
          {field("year")}
          {field("semester")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field("place")}
          {field("date")}
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={state === "saving"} onClick={() => save()}>
            {tx.save}
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              const d = defaultCover(a);
              setCover({ ...d, authors: cover.authors, number: cover.number, teacher: cover.teacher });
              setState("idle");
            }}
          >
            {tx.coverReset}
          </button>
          {state === "saved" && (
            <span className="text-success inline-flex items-center gap-1 text-sm font-medium">
              <CheckCircle size={18} weight="fill" aria-hidden="true" /> {tx.coverSaved}
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-muted mb-2 text-sm font-semibold">{tx.coverPreview}</p>
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <div>
            {page(false)}
            <p className="text-muted mt-1 text-center text-xs">{tx.capa}</p>
          </div>
          <div>
            {page(true)}
            <p className="text-muted mt-1 text-center text-xs">{tx.rosto}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bibliography({ a, tx, running, onFind }: { a: Assignment; tx: Tx; running: boolean; onFind: () => void }) {
  // La misma lista que irá al Word (sin apuntes de clase ni repetidas).
  const list = wordBibliography(a);
  const [copied, setCopied] = useState(false);
  const missing = a.sections.filter((s) => !s.research.trim()).length;
  const find = missing > 0 && !running && (
    <div className="card space-y-2 p-4">
      <button className="btn-primary w-full sm:w-auto" onClick={onFind}>
        <MagnifyingGlass size={18} aria-hidden="true" /> {tx.findRefs} (
        {a.meta.citation === "APA" ? "APA 7" : "Vancouver"})
      </button>
      <p className="text-muted text-sm">{tx.findRefsHint(missing)}</p>
    </div>
  );
  if (!list.length)
    return (
      <div className="space-y-4">
        {find}
        {!find && <p className="card text-muted p-4">{tx.bibEmpty}</p>}
      </div>
    );
  const withoutCites = a.sections.some(
    (s) => s.draft && /no hay investigaci|não há pesquisa|sin citas|sem citações/i.test(s.draft),
  );
  const text = list.map((l, i) => (a.meta.citation === "Vancouver" ? `${i + 1}. ${l}` : l)).join("\n");
  return (
    <div className="space-y-4">
      {find}
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
        {a.sections.some((s) => s.checked) && (
          <p className="bg-success-soft text-success rounded-xl p-3 text-sm font-medium">{tx.checkedRefs}</p>
        )}
        {withoutCites && <p className="bg-surface-2 text-muted rounded-xl p-3 text-sm">{tx.citeHint}</p>}
      </div>
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
/** Fragmentos de texto con **negrita** y *cursiva* (Markdown) para el Word. */
function inlineParts(text: string) {
  const clean = text
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/\[Web\]\s*/g, "")
    .replace(/<\/?[^>]+>/g, "");
  const parts: { text: string; bold?: boolean; italics?: boolean }[] = [];
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|_(?!\s)(.+?)_/g;
  let last = 0;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    if (m.index > last) parts.push({ text: clean.slice(last, m.index) });
    if (m[1]) parts.push({ text: m[1], bold: true });
    else parts.push({ text: m[2] ?? m[3], italics: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) parts.push({ text: clean.slice(last) });
  // Asteriscos sueltos que no formaban pareja (p. ej., "p. 15*").
  return parts.map((p) => ({ ...p, text: p.text.replace(/\*/g, "") })).filter((p) => p.text);
}

/** Bibliografía para el Word: sin sus apuntes de clase (no se citan en la lista final) y sin repetidas. */
function wordBibliography(a: Assignment) {
  const seen = new Set<string>();
  const list = bibliography(a.sections, a.meta.citation).map((l) =>
    a.meta.lang === "pt" ? l.replace(/\(s\.\s?f\.\)/g, "(s.d.)") : l,
  );
  return list.filter((line) => {
    if (/apuntes de clase|apontamentos|sin publicar|não publicad|\baula\b.*\bp\.\s*\d/i.test(line)) return false;
    const key = (line.match(/doi\.org\/\S+|https?:\/\/\S+/i)?.[0] ?? line).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const isIntro = (t: string) => /^\s*(\d+(\.\d+)*\.?\s*)?introdu/i.test(t);
const isConclusion = (t: string) => /^\s*(\d+(\.\d+)*\.?\s*)?(conclus|considera[cç][oõ]es finais)/i.test(t);

/**
 * Títulos como pide la guía: Introducción y Conclusión sin número; capítulos 1, 2… y subcapítulos 1.1, 1.2…
 * (se renumeran aunque la IA o ella los hayan numerado de otra forma).
 */
function displayTitles(sections: Section[]) {
  let chapter = 0;
  let sub = 0;
  return sections.map((s) => {
    const raw = s.title.trim();
    const bare = raw.replace(/^\d+(\.\d+)*\.?\s*/, "");
    if (isIntro(raw) || isConclusion(raw)) return { title: bare, level: 1 as const, numbered: false };
    if (/^\d+\.\d+/.test(raw) && chapter > 0) {
      sub++;
      return { title: `${chapter}.${sub}. ${bare}`, level: 2 as const, numbered: true };
    }
    chapter++;
    sub = 0;
    return { title: `${chapter}. ${bare}`, level: 1 as const, numbered: true };
  });
}

/** Párrafos del borrador (bloques separados por líneas en blanco; listas con guiones aparte). */
function draftBlocks(draft: string) {
  const out: { kind: "p" | "li" | "h"; text: string }[] = [];
  for (const block of draft.split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-•*]\s+/.test(l)))
      lines.forEach((l) => out.push({ kind: "li", text: l.replace(/^[-•*]\s+/, "") }));
    else if (/^#{1,4}\s/.test(lines[0])) {
      out.push({ kind: "h", text: lines[0].replace(/^#+\s*/, "") });
      if (lines.length > 1) out.push({ kind: "p", text: lines.slice(1).join(" ") });
    } else out.push({ kind: "p", text: lines.join(" ") });
  }
  return out;
}

/** Lo que necesitan el Word y el PDF: listas de siglas y símbolos (las hace la IA) y el logo de la escuela. */
async function exportExtras(a: Assignment) {
  const lists = await api
    .post<{ siglas: { sigla: string; significado: string }[]; simbolos: { simbolo: string; significado: string }[] }>(
      `/assignments/${a.id}/lists`,
    )
    .catch(() => ({ siglas: [], simbolos: [] }));
  const logo = await fetch("/esscvp-logo.png")
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  return { lists, logo };
}

const exportName = (a: Assignment) => a.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "trabajo";

/** PDF con el mismo formato que el Word (se ve igual en el iPad, en el ordenador o impreso). */
async function exportPdf(a: Assignment, subjects: Subject[]) {
  const { downloadWorkPdf } = await import("@/lib/workPdf");
  const cover = coverOf(a, subjects);
  const ct = COVER_TEXT[a.meta.lang];
  const titles = displayTitles(a.sections);
  const { lists, logo } = await exportExtras(a);
  let logoUrl: string | null = null;
  if (logo) {
    const bytes = new Uint8Array(logo);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    logoUrl = `data:image/png;base64,${btoa(bin)}`;
  }
  await downloadWorkPdf({
    fileName: exportName(a),
    logo: logoUrl,
    cover: {
      course: cover.course,
      yearSemester: [cover.year, cover.semester].filter(Boolean).join(", "),
      subject: cover.subject,
      title: cover.title,
      subtitle: cover.subtitle,
      authors: authorLines(cover, ct),
      teacherLine: cover.teacher ? `${ct.teacher} ${cover.teacher}` : "",
      placeDate: [cover.place, cover.date].filter(Boolean).join(", "),
    },
    labels: { toc: ct.toc, acronyms: ct.acronyms, symbols: ct.symbols, references: ct.references },
    sections: a.sections.map((s, i) => ({
      title: titles[i].title,
      level: titles[i].level,
      blocks: draftBlocks(s.draft).map((b) => ({ kind: b.kind, parts: inlineParts(b.text) })),
    })),
    references: wordBibliography(a).map(inlineParts),
    numberedRefs: a.meta.citation === "Vancouver",
    siglas: lists.siglas,
    simbolos: lists.simbolos,
  });
}

async function exportWord(a: Assignment, subjects: Subject[]) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    Footer,
    PageNumber,
    HeadingLevel,
    ImageRun,
    NumberFormat,
    SectionType,
    TabStopType,
    LeaderType,
    PageBreak,
  } = await import("docx");
  const cover = coverOf(a, subjects);
  const ct = COVER_TEXT[a.meta.lang];
  const titles = displayTitles(a.sections);
  const bib = wordBibliography(a);
  // Listas de siglas y símbolos (las hace la IA a partir del texto; si falla, el Word sale igual sin ellas).
  const { lists, logo } = await exportExtras(a);

  // ---- Formato de la guía: A4, márgenes 2,54 cm, Calibri 11, justificado, interlineado 1,5 ----
  const FONT = "Calibri";
  const TEXT_WIDTH = 11906 - 2 * 1440; // ancho útil en twips (para el tabulador del índice)
  type P = InstanceType<typeof Paragraph>;
  const run = (text: string, o: { size?: number; bold?: boolean; italics?: boolean; caps?: boolean } = {}) =>
    new TextRun({
      text,
      font: FONT,
      size: o.size ?? 22,
      bold: o.bold,
      italics: o.italics,
      allCaps: o.caps,
      color: "000000",
    });
  const line = (
    text: string,
    o: {
      size?: number;
      bold?: boolean;
      italics?: boolean;
      caps?: boolean;
      before?: number;
      after?: number;
      align?: "center" | "right";
      breakBefore?: boolean;
    } = {},
  ) =>
    new Paragraph({
      alignment: o.align === "right" ? AlignmentType.RIGHT : AlignmentType.CENTER,
      pageBreakBefore: o.breakBefore,
      spacing: { before: o.before ?? 0, after: o.after ?? 60 },
      children: [run(text, o)],
    });
  // Salto de página como carácter (no como propiedad del párrafo): la vista previa del iPad/iPhone solo respeta este.
  const pageTitle = (text: string, breakBefore: boolean) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [...(breakBefore ? [new PageBreak()] : []), run(text, { size: 24, bold: true })],
    });

  // ---- Capa y folha de rosto (modelo de la escuela) ----
  const coverPage = (rosto: boolean, breakBefore: boolean): P[] => {
    const out: P[] = [];
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        pageBreakBefore: breakBefore,
        children: logo
          ? [new ImageRun({ type: "png", data: logo, transformation: { width: 170, height: 120 } })]
          : [run(cover.institution, { bold: true })],
      }),
    );
    out.push(line(cover.course, { caps: true, before: 480 }));
    const ys = [cover.year, cover.semester].filter(Boolean).join(", ");
    if (ys) out.push(line(ys, { size: 20 }));
    if (cover.subject) out.push(line(cover.subject, { size: 20, before: 240 }));
    out.push(line(cover.title, { size: 28, bold: true, before: 2600 }));
    if (cover.subtitle) out.push(line(cover.subtitle, { size: 24 }));
    authorLines(cover, ct).forEach((l, i) =>
      out.push(line(l, { align: "right", bold: true, before: i === 0 ? 2400 : 0 })),
    );
    if (rosto && cover.teacher) out.push(line(`${ct.teacher} ${cover.teacher}`, { align: "right", before: 360 }));
    if (!rosto) {
      const placeDate = [cover.place, cover.date].filter(Boolean).join(", ");
      if (placeDate) out.push(line(placeDate, { before: 2600 }));
    }
    return out;
  };

  // ---- Cuerpo del trabajo (y estimación de la página de cada título para el índice) ----
  // Calibri 11 a 1,5 en A4 con márgenes de 2,54 cm: ~95 caracteres por línea y ~38 líneas por página
  // (medido abriendo el Word generado). Es una estimación: en trabajos largos puede variar una página.
  const CHARS = 95;
  const LINES = 38;
  let lines = 0;
  const pageNow = () => Math.floor(lines / LINES) + 1;
  const bodyPages: number[] = [];
  const body: P[] = [];
  a.sections.forEach((s, i) => {
    const t = titles[i];
    if (lines % LINES > LINES - 4) lines = Math.ceil(lines / LINES) * LINES; // un título no se queda solo al final
    if (lines % LINES !== 0) lines += 1.2;
    bodyPages.push(pageNow());
    lines += 1.6;
    body.push(
      new Paragraph({
        heading: t.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        keepNext: true,
        pageBreakBefore: i === 0,
        spacing: { before: i === 0 ? 0 : 240, after: 120, line: 360 },
        children: [run(t.title, { size: t.level === 1 ? 24 : 22, bold: true })],
      }),
    );
    for (const b of draftBlocks(s.draft)) {
      lines += Math.ceil((b.text.length + (b.kind === "li" ? 4 : 0)) / CHARS) + 0.3;
      body.push(
        new Paragraph({
          alignment: b.kind === "h" ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
          keepNext: b.kind === "h",
          spacing: { after: 120, line: 360 },
          indent: b.kind === "li" ? { left: 360, hanging: 240 } : undefined,
          children: [
            ...(b.kind === "li" ? [run("•\t")] : []),
            ...inlineParts(b.text).map((p) => run(p.text, { bold: p.bold || b.kind === "h", italics: p.italics })),
          ],
        }),
      );
    }
  });
  const refsPage = Math.ceil(Math.max(lines, 1) / LINES) + 1;
  if (bib.length) {
    body.push(pageTitle(ct.references, true));
    bib.forEach((l, i) =>
      body.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: a.meta.citation === "APA" ? { left: 720, hanging: 720 } : { left: 567, hanging: 567 },
          spacing: { after: 120, line: 360 },
          children: [
            ...(a.meta.citation === "Vancouver" ? [run(`${i + 1}.\t`)] : []),
            ...inlineParts(l).map((p) => run(p.text, { bold: p.bold, italics: p.italics })),
          ],
        }),
      ),
    );
  }

  // ---- Elementos pré-textuais: folha de rosto, índice geral y listas ----
  const pre: P[] = [...coverPage(true, false)];
  const tocEntry = (text: string, page: number, o: { bold?: boolean; indent?: number } = {}) =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH, leader: LeaderType.DOT }],
      indent: { left: o.indent ?? 0 },
      spacing: { after: 80, line: 360 },
      children: [run(text, { bold: o.bold }), run(`\t${page}`, { bold: o.bold })],
    });
  pre.push(pageTitle(ct.toc, true));
  titles.forEach((t, i) =>
    pre.push(tocEntry(t.title, bodyPages[i], { bold: t.level === 1, indent: t.level === 2 ? 360 : 0 })),
  );
  if (bib.length) pre.push(tocEntry(ct.references, refsPage, { bold: true }));
  if (lists.siglas.length) {
    pre.push(pageTitle(ct.acronyms, true));
    lists.siglas.forEach((x) =>
      pre.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.LEFT, position: 1700 }],
          indent: { left: 1700, hanging: 1700 },
          spacing: { after: 80, line: 360 },
          children: [run(x.sigla), run(`\t${x.significado}`)],
        }),
      ),
    );
  }
  if (lists.simbolos.length) {
    pre.push(pageTitle(ct.symbols, true));
    lists.simbolos.forEach((x) =>
      pre.push(
        new Paragraph({
          tabStops: [{ type: TabStopType.LEFT, position: 1700 }],
          indent: { left: 1700, hanging: 1700 },
          spacing: { after: 80, line: 360 },
          children: [run(x.simbolo), run(`\t${x.significado}`)],
        }),
      ),
    );
  }

  // Paginación de la guía: la capa no se cuenta; desde la folha de rosto (sin número visible) en romanos;
  // desde la introducción, números árabes. Abajo, centrada.
  const margin = { top: 1440, bottom: 1440, left: 1440, right: 1440 };
  const pageSize = { width: 11906, height: 16838 };
  const numberFooter = () =>
    new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })],
        }),
      ],
    });
  const emptyFooter = () => new Footer({ children: [new Paragraph({ children: [] })] });
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: { page: { size: pageSize, margin } },
        footers: { default: emptyFooter() },
        children: coverPage(false, false),
      },
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          titlePage: true,
          page: { size: pageSize, margin, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } },
        },
        footers: { default: numberFooter(), first: emptyFooter() },
        children: pre,
      },
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { size: pageSize, margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
        },
        footers: { default: numberFooter() },
        children: body,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${exportName(a)}.docx`;
  // El enlace tiene que estar en la página para que el navegador respete el nombre del archivo.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
