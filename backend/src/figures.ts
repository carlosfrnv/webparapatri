import { z } from "zod";
import { completeJson } from "./ai";
import { STORAGE_BUCKET } from "./config";
import type { Lang } from "./i18n";
import { supabase } from "./supabase";
import type { Figure } from "./vision";

/**
 * Figuras de los apuntes guardadas como imagen (para las preguntas con imágenes) y otros extras
 * de cada documento (esquema del tema). Van en la tabla document_extras; si aún no existe
 * (falta ejecutar el SQL), simplemente no se guardan.
 */

export interface SavedFigure {
  n: number;
  page: number | null;
  label: string;
  description: string;
  path: string;
}

const MAX_SAVED = 20;
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

export async function getExtras(documentId: string, userId: string) {
  const { data, error } = await supabase
    .from("document_extras")
    .select("figures, figure_quiz, mindmap")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (missingTable(error?.code)) return { missing: true as const };
  if (error) throw error;
  return {
    missing: false as const,
    figures: (data?.figures ?? []) as SavedFigure[],
    figure_quiz: (data?.figure_quiz ?? {}) as Partial<Record<Lang, FigureQuestion[]>>,
    mindmap: (data?.mindmap ?? {}) as Partial<Record<Lang, MindNode>>,
  };
}

export async function saveExtras(
  documentId: string,
  userId: string,
  patch: { figures?: SavedFigure[]; figure_quiz?: unknown; mindmap?: unknown },
) {
  const { error } = await supabase
    .from("document_extras")
    .upsert({ document_id: documentId, user_id: userId, ...patch, updated_at: new Date().toISOString() });
  if (missingTable(error?.code)) return false;
  if (error) throw error;
  return true;
}

/** Borra las imágenes guardadas de las figuras de un documento. */
export async function removeFigureFiles(documentId: string, userId: string) {
  const folder = `${userId}/figuras/${documentId}`;
  const { data: old } = await supabase.storage.from(STORAGE_BUCKET).list(folder);
  if (old?.length) await supabase.storage.from(STORAGE_BUCKET).remove(old.map((o) => `${folder}/${o.name}`));
}

/** Guarda las imágenes de las figuras en Storage y su lista en document_extras (sustituye las anteriores). */
export async function saveFigures(documentId: string, userId: string, figures: Figure[]) {
  const withImage = figures.filter((f) => f.image).slice(0, MAX_SAVED);
  const folder = `${userId}/figuras/${documentId}`;
  // Se borran las de un análisis anterior.
  await removeFigureFiles(documentId, userId);
  const saved: SavedFigure[] = [];
  for (const [i, f] of withImage.entries()) {
    const path = `${folder}/${i + 1}.jpg`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, Buffer.from(f.image!, "base64"), { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.error("Error al guardar una figura:", error.message);
      continue;
    }
    saved.push({ n: i + 1, page: f.page, label: f.label, description: f.description, path });
  }
  // Figuras nuevas: las preguntas sobre las anteriores ya no valen.
  await saveExtras(documentId, userId, { figures: saved, figure_quiz: {} });
  return saved.length;
}

// ---------- Preguntas con imágenes ----------

export interface FigureQuestion {
  figure: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

const figureQuizSchema = z.object({
  questions: z.array(
    z.object({
      ref: z.number().int(),
      question: z.string().min(1),
      options: z.array(z.string()).length(4),
      correct_index: z.number().int().min(0).max(3),
      explanation: z.string(),
    }),
  ),
});

const BATCH = 5;
const MAX_QUESTIONS = 10;

/** Una pregunta tipo test por figura (hasta 10), hecha mirando la imagen. Se guarda por idioma. */
export async function generateFigureQuiz(documentId: string, userId: string, lang: Lang, figures: SavedFigure[]) {
  const chosen = figures.slice(0, MAX_QUESTIONS);
  const out: FigureQuestion[] = [];
  for (let i = 0; i < chosen.length; i += BATCH) {
    const batch = chosen.slice(i, i + BATCH);
    const images = [];
    for (const f of batch) {
      const { data } = await supabase.storage.from(STORAGE_BUCKET).download(f.path);
      if (data) images.push({ f, data: Buffer.from(await data.arrayBuffer()).toString("base64") });
    }
    if (images.length === 0) continue;
    const order = images
      .map((x, j) => `Imagen ${j + 1} → ref ${x.f.n} (${x.f.label}). Descripción: ${x.f.description}`)
      .join("\n");
    const prompt =
      lang === "es"
        ? `Eres profesor de Imagen Médica y Radioterapia. Las imágenes son figuras de los apuntes de una estudiante.
Para CADA imagen escribe UNA pregunta tipo test en español de España que solo se pueda responder mirando la imagen
(qué estructura señala una flecha o una etiqueta, qué muestra el esquema, qué plano o proyección es, qué modalidad…).
4 opciones plausibles, una sola correcta, y una explicación corta. No inventes nada que no se vea o no esté en la descripción.
Orden de las imágenes:
${order}
Responde SOLO con JSON: {"questions":[{"ref":<ref>,"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}`
        : `És professor de Imagem Médica e Radioterapia. As imagens são figuras dos apontamentos de uma estudante.
Para CADA imagem escreve UMA pergunta de escolha múltipla em português de Portugal que só se possa responder olhando para a imagem
(que estrutura assinala uma seta ou uma legenda, o que mostra o esquema, que plano ou incidência é, que modalidade…).
4 opções plausíveis, uma só certa, e uma explicação curta. Não inventes nada que não se veja ou não esteja na descrição.
Ordem das imagens:
${order}
Responde SÓ com JSON: {"questions":[{"ref":<ref>,"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}`;
    const result = await completeJson(prompt, figureQuizSchema, {
      lang,
      effort: "low",
      maxTokens: 6000,
      images: images.map((x) => ({ mediaType: "image/jpeg" as const, data: x.data })),
    });
    for (const q of result.questions) {
      if (batch.some((f) => f.n === q.ref))
        out.push({
          figure: q.ref,
          question: q.question,
          options: q.options,
          correct_index: q.correct_index,
          explanation: q.explanation,
        });
    }
  }
  return out;
}

// ---------- Esquema del tema (mapa conceptual) ----------

export interface MindNode {
  label: string;
  note?: string;
  children?: MindNode[];
}
