export type Area = "base" | "radiologia" | "medicina_nuclear" | "radioterapia" | "transversal";

export const AREAS: Area[] = ["base", "radiologia", "medicina_nuclear", "radioterapia", "transversal"];

export interface Subject {
  id: string;
  name: string;
  year: number | null;
  area: Area | null;
  document_count?: number;
}

export type SourceType = "apuntes" | "referencia";
export type ReferenceOrg = "IAEA" | "EFRS";

export interface DocumentItem {
  id: string;
  title: string;
  subject_id: string | null;
  suggested_subject_id: string | null;
  mime_type: string | null;
  status: "processing" | "ready" | "error";
  error_message: string | null;
  created_at: string;
  source_type?: SourceType;
  reference_org?: ReferenceOrg | null;
}

export interface KeyConcept {
  concept: string;
  explanation: string;
  why_it_matters: string;
}

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface StudyMaterials {
  document_id: string;
  summary: string;
  key_concepts: KeyConcept[];
  glossary: GlossaryItem[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  sources?: AnySource[] | null;
  lang?: "es" | "pt";
  generated_at: string;
}

export interface DueCard {
  document_id: string;
  document_title: string;
  card_index: number;
  front: string;
  back: string;
  is_new: boolean;
}

/** Fragmento local: de sus apuntes o de la biblioteca de referencia. */
export interface Source {
  n: number;
  kind?: SourceType; // los mensajes antiguos no tienen este campo: son apuntes
  org?: ReferenceOrg | null;
  chunk_id: number;
  document_id: string;
  document_title: string;
  page: number | null;
  excerpt: string;
}

/** Fuente consultada en vivo (solo nombre y enlace; el texto de la página nunca se guarda). */
export interface WebSource {
  kind: "web";
  site: "Radiopaedia" | "IAEA" | "EFRS";
  title: string;
  url: string;
}

/**
 * "Sugerencias de búsqueda" de Google: las condiciones de Gemini obligan a mostrarlas
 * cuando una respuesta ha usado la búsqueda con Google.
 */
export interface SearchSuggestions {
  kind: "search_suggestions";
  html: string;
}

export type AnySource = Source | WebSource | SearchSuggestions;
export const isWebSource = (s: AnySource): s is WebSource => s.kind === "web";
export const isSuggestions = (s: AnySource): s is SearchSuggestions => s.kind === "search_suggestions";
export const isLocalSource = (s: AnySource): s is Source => !isWebSource(s) && !isSuggestions(s);

export interface ChatMessage {
  id?: number | string;
  role: "user" | "assistant";
  content: string;
  sources?: AnySource[] | null;
}

export interface Stats {
  documents: number;
  reviewed_today: number;
  study_days_week: number;
  recent_quizzes: { score: number; total: number; created_at: string; title: string }[];
  recent_documents: { id: string; title: string; status: DocumentItem["status"]; created_at: string }[];
}

/** Marca que devuelve el chat cuando la pregunta no tiene que ver con sus estudios (ver backend/src/prompts.ts). */
export const OFF_TOPIC_MARKER = "[[FUERA_DE_TEMA]]";

export interface Exam {
  id: string;
  subject_id: string | null;
  subject_name: string | null;
  title: string;
  exam_date: string; // AAAA-MM-DD
  notes: string | null;
  days_left: number;
}

export type PlanTask =
  | { type: "flashcards"; count: number; subject_id: string }
  | { type: "prepare" | "test"; document_id: string; title: string; last_pct: number | null };

export interface ExamPlan {
  exam_id: string;
  tasks: PlanTask[];
  total_docs: number;
  mastered_docs: number;
}

export interface ExamsResponse {
  today: string;
  exams: Exam[];
  plan: ExamPlan[];
}
