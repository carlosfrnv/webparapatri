import { Router } from "express";
import { z } from "zod";
import { completeJson } from "../ai";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf, type Lang } from "../i18n";
import { aiLimiter } from "../limits";
import { localName } from "../seed";
import { materialInLang } from "../study";
import { supabase } from "../supabase";

/**
 * Verdadero o falso: la IA escribe afirmaciones sobre sus temas (la mitad, más o menos, con un error
 * sutil) a partir del resumen y los conceptos clave de cada archivo. Cada ronda sale distinta.
 */
export const trueFalseRouter = Router();

interface Concept {
  concept: string;
  explanation: string;
}

// Como mucho estos temas por ronda (elegidos al azar), para que el texto que se manda no sea enorme.
const MAX_TOPICS = 6;
const SUMMARY_CHARS = 3500;

const shuffle = <T>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const langName = (l: Lang) => (l === "pt" ? "português europeu" : "español de España");

const prompt = (lang: Lang, count: number, topics: { title: string; text: string }[]) =>
  `Eres un profesor de 1.º de la Licenciatura en Imagen Médica y Radioterapia (Portugal) que prepara un ejercicio de
VERDADERO O FALSO para que su alumna repase y retenga lo importante de sus temas.

TEMAS (numerados; usa SOLO esta información, no inventes datos):
${topics.map((t, i) => `[${i}] ${t.title}\n${t.text}`).join("\n\n")}

Escribe exactamente ${count} afirmaciones, repartidas entre los temas, sobre lo que más cae en un examen: definiciones,
funciones, localizaciones, cifras, unidades, clasificaciones, causas y consecuencias.
- Más o menos la mitad verdaderas y la mitad falsas, en orden mezclado.
- Las falsas deben parecer creíbles: cambia UN detalle concreto (un número, un órgano, un término, «aumenta» por
  «disminuye», una excepción…). Nada de falsas evidentes, absurdas o con trampas de redacción.
- Cada afirmación, una sola idea, en una frase clara y sin «siempre/nunca» de trampa. No repitas ideas.
- En "explanation", una o dos frases: por qué es verdadera o, si es falsa, cuál es la versión correcta.
- "topic" es el número del tema del que sale.
Escribe en ${langName(lang)}.

Responde SOLO con JSON: {"items":[{"statement":"...","answer":true,"explanation":"...","topic":0}]}`;

trueFalseRouter.post(
  "/",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const { subject_id, document_id, count } = z
      .object({
        subject_id: z.string().uuid().optional(),
        document_id: z.string().uuid().optional(),
        count: z.number().int().min(5).max(30).catch(15),
      })
      .parse(req.body ?? {});

    // Sin asignatura ni archivo: de todos sus temas.
    let subjectName = "";
    let query = supabase
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("source_type", "apuntes")
      .eq("status", "ready");
    if (document_id) query = query.eq("id", document_id);
    else if (subject_id) {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id, name, translations")
        .eq("id", subject_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!subject) throw new HttpError(404, "invalidSubject");
      subjectName = localName(subject, lang);
      query = query.eq("subject_id", subject_id);
    }
    const { data: docs, error } = await query;
    if (error) throw error;
    const ids = (docs ?? []).map((d) => d.id);

    const usable: { document_id: string; title: string; text: string }[] = [];
    if (ids.length > 0) {
      const { data: rows, error: e2 } = await supabase
        .from("study_materials")
        .select("document_id, summary, key_concepts, lang, translations, documents(title)")
        .eq("user_id", userId)
        .in("document_id", ids);
      if (e2) throw e2;
      for (const row of rows ?? []) {
        const m = materialInLang(row, lang) ?? row;
        const concepts = ((m.key_concepts ?? []) as Concept[]).map((c) => `- ${c.concept}: ${c.explanation}`).join("\n");
        const summary = String(m.summary ?? "").slice(0, SUMMARY_CHARS);
        if (!summary && !concepts) continue;
        usable.push({
          document_id: row.document_id,
          title: (row.documents as unknown as { title: string } | null)?.title ?? "",
          text: `${concepts}\n${summary}`.trim(),
        });
      }
    }
    // Temas listos que aún no se han abierto nunca (no tienen resumen): no entran.
    const missing = ids.length - usable.length;
    const topics = shuffle(usable).slice(0, MAX_TOPICS);
    if (topics.length === 0) {
      res.json({ subject_name: subjectName, items: [], missing_topics: missing });
      return;
    }

    const out = await completeJson(
      prompt(lang, count, topics),
      z.object({
        items: z
          .array(
            z.object({
              statement: z.string().min(5).max(600),
              answer: z.boolean(),
              explanation: z.string().max(1200).default(""),
              topic: z.coerce.number().int().catch(0),
            }),
          )
          .min(1),
      }),
      { lang, effort: "medium", maxTokens: 8000 },
    );
    const items = out.items.slice(0, count).map(({ topic, ...q }) => {
      const t = topics[topic] ?? topics[0];
      return { ...q, document_id: t.document_id, document_title: t.title };
    });
    res.json({ subject_name: subjectName, items, missing_topics: missing });
  }),
);
