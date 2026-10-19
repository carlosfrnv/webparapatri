import { z } from "zod";
import { completeJson } from "./ai";
import type { Lang } from "./i18n";
import { supabase } from "./supabase";

/**
 * Podcast del tema: un guion de charla entre dos presentadores, hecho con el resumen.
 * La voz la pone el propio iPad (gratis), así que la IA solo escribe el texto una vez y se guarda
 * en document_extras.podcast. Si esa columna aún no existe (falta el SQL), se hace cada vez.
 */

export const HOSTS: Record<Lang, [string, string]> = {
  es: ["Patricia", "Carlos"],
  pt: ["Patricia", "Carlos"],
};

const podcastSchema = z.object({
  title: z.string().transform((v) => v.slice(0, 200)),
  lines: z
    .array(
      z.object({
        who: z.coerce.number().int().min(0).max(1).catch(0),
        text: z.string().transform((v) => v.trim().slice(0, 600)),
      }),
    )
    .transform((a) => a.filter((l) => l.text).slice(0, 120))
    .refine((a) => a.length >= 6),
});

export type Podcast = z.infer<typeof podcastSchema>;

export function generatePodcast(
  lang: Lang,
  title: string,
  summary: string,
  concepts: string,
): Promise<Podcast> {
  const [a, b] = HOSTS[lang];
  const prompt =
    lang === "es"
      ? `Escribe el guion de un PODCAST de repaso de unos 10 minutos sobre este tema de Imagen Médica y Radioterapia, para una estudiante de primer curso que lo va a escuchar en el bus.
Presentadores: ${a} (who: 0), que explica el tema, y ${b} (who: 1), que hace las preguntas que se haría una estudiante, pide ejemplos y resume.
Título del archivo: ${title}
Cómo tiene que ser:
- Una charla natural y cercana entre dos amigos que saben del tema, en español de España. Nada de "bienvenidos a otro episodio" largo: un saludo corto y al tema.
- Recorre TODOS los apartados importantes del resumen en orden lógico, con los datos clave (valores, unidades, definiciones).
- Ejemplos y trucos para acordarse; de vez en cuando ${b} resume lo último en una frase.
- Frases cortas y fáciles de escuchar (se van a leer con voz sintética): sin tablas, listas, símbolos, emojis ni fórmulas en LaTeX. Las fórmulas, dichas con palabras.
- Al final, un repaso rápido de las 3-5 ideas que más caen en el examen y una despedida corta.
- Entre 40 y 70 intervenciones. Usa SOLO lo que hay en el resumen y los conceptos.
Resumen:
${summary}
Conceptos clave:
${concepts}
Responde SOLO con JSON: {"title":"","lines":[{"who":0,"text":""},{"who":1,"text":""}]}`
      : `Escreve o guião de um PODCAST de revisão de uns 10 minutos sobre este tema de Imagem Médica e Radioterapia, para uma estudante do primeiro ano que o vai ouvir no autocarro.
Apresentadores: ${a} (who: 0), que explica o tema, e ${b} (who: 1), que faz as perguntas que uma estudante faria, pede exemplos e resume.
Título do ficheiro: ${title}
Como tem de ser:
- Uma conversa natural e próxima entre dois amigos que sabem do tema, em português de Portugal. Nada de introduções longas: um cumprimento curto e ao tema.
- Percorre TODAS as partes importantes do resumo por ordem lógica, com os dados-chave (valores, unidades, definições).
- Exemplos e truques para memorizar; de vez em quando ${b} resume o último ponto numa frase.
- Frases curtas e fáceis de ouvir (vão ser lidas com voz sintética): sem tabelas, listas, símbolos, emojis nem fórmulas em LaTeX. As fórmulas, ditas por palavras.
- No fim, uma revisão rápida das 3-5 ideias que mais saem no exame e uma despedida curta.
- Entre 40 e 70 intervenções. Usa SÓ o que está no resumo e nos conceitos.
Resumo:
${summary}
Conceitos-chave:
${concepts}
Responde SÓ com JSON: {"title":"","lines":[{"who":0,"text":""},{"who":1,"text":""}]}`;
  return completeJson(prompt, podcastSchema, {
    lang,
    effort: "low",
    maxTokens: 9000,
  });
}

type Saved = Partial<Record<Lang, { from: string; podcast: Podcast }>>;

// La columna podcast puede no existir todavía (SQL sin ejecutar): entonces ni se lee ni se guarda.
const noColumn = (code?: string) =>
  code === "42703" ||
  code === "42P01" ||
  code === "PGRST205" ||
  code === "PGRST204";

export async function getSavedPodcasts(
  documentId: string,
  userId: string,
): Promise<Saved> {
  const { data, error } = await supabase
    .from("document_extras")
    .select("podcast")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (noColumn(error.code)) return {};
    throw error;
  }
  return (data?.podcast ?? {}) as Saved;
}

export async function savePodcasts(
  documentId: string,
  userId: string,
  podcasts: Saved,
) {
  const { error } = await supabase
    .from("document_extras")
    .upsert({
      document_id: documentId,
      user_id: userId,
      podcast: podcasts,
      updated_at: new Date().toISOString(),
    });
  if (error && !noColumn(error.code)) throw error;
}
