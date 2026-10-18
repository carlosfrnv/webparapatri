import { Router } from "express";
import { z } from "zod";
import { completeJson } from "../ai";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { aiLimiter } from "../limits";
import { localName } from "../seed";
import { materialInLang } from "../study";
import { supabase } from "../supabase";

/**
 * Examen oral: la web le pregunta un concepto clave de sus temas (sin gastar IA), ella lo explica
 * hablando y la IA corrige la respuesta comparándola con lo que dicen sus apuntes.
 */
export const oralRouter = Router();

interface Concept {
  concept: string;
  explanation: string;
  why_it_matters: string;
}

const shuffle = <T>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Preguntas: conceptos clave de un archivo o, repartidos entre todos sus temas, de una asignatura. */
oralRouter.get(
  "/questions",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const { subject_id, document_id, count } = z
      .object({
        subject_id: z.string().uuid().optional(),
        document_id: z.string().uuid().optional(),
        count: z.coerce.number().int().min(3).max(20).catch(5),
      })
      .parse(req.query);
    if (!subject_id && !document_id) throw new HttpError(400, "invalidSubject");

    let subjectName = "";
    let query = supabase
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("source_type", "apuntes")
      .eq("status", "ready");
    if (document_id) query = query.eq("id", document_id);
    else {
      const { data: subject } = await supabase
        .from("subjects")
        .select("id, name, translations")
        .eq("id", subject_id!)
        .eq("user_id", userId)
        .maybeSingle();
      if (!subject) throw new HttpError(404, "invalidSubject");
      subjectName = localName(subject, lang);
      query = query.eq("subject_id", subject_id!);
    }
    const { data: docs, error } = await query;
    if (error) throw error;
    const ids = (docs ?? []).map((d) => d.id);

    const pools: { document_id: string; document_title: string; concept: string; explanation: string }[][] = [];
    if (ids.length > 0) {
      const { data: rows, error: e2 } = await supabase
        .from("study_materials")
        .select("document_id, key_concepts, lang, translations, documents(title)")
        .eq("user_id", userId)
        .in("document_id", ids);
      if (e2) throw e2;
      for (const row of rows ?? []) {
        const concepts = (materialInLang(row, lang)?.key_concepts ?? row.key_concepts) as Concept[] | null;
        const title = (row.documents as unknown as { title: string } | null)?.title ?? "";
        if (concepts?.length)
          pools.push(
            shuffle(
              concepts.map((c) => ({
                document_id: row.document_id,
                document_title: title,
                concept: c.concept,
                explanation: `${c.explanation} ${c.why_it_matters}`.trim(),
              })),
            ),
          );
      }
    }
    // Por turnos, para que salgan todos los temas.
    const items: (typeof pools)[number] = [];
    const shuffled = shuffle(pools);
    while (items.length < count && shuffled.some((p) => p.length > 0)) {
      for (const p of shuffled) {
        const next = p.pop();
        if (next && items.length < count) items.push(next);
      }
    }
    res.json({ subject_name: subjectName, items: shuffle(items), missing_topics: ids.length - pools.length });
  }),
);

const gradeSchema = z.object({
  concept: z.string().min(1).max(300),
  expected: z.string().max(4000),
  answer: z.string().max(6000),
});

const resultSchema = z.object({
  score: z.number().min(0).max(10),
  good: z.string(),
  missing: z.string(),
  model_answer: z.string(),
});

/** Corrige su respuesta oral (nota de 0 a 10, lo que ha dicho bien, lo que le falta y una respuesta modelo). */
oralRouter.post(
  "/grade",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const lang = langOf(req);
    const { concept, expected, answer } = gradeSchema.parse(req.body);
    if (!answer.trim()) {
      res.json({ score: 0, good: "", missing: expected, model_answer: expected });
      return;
    }
    const prompt =
      lang === "es"
        ? `Eres un profesor amable de Imagen Médica y Radioterapia que hace un examen oral a una estudiante de primer curso.
Pregunta: explica «${concept}».
Lo que dicen sus apuntes (referencia): ${expected}
Lo que ha respondido ella (transcrito de voz, puede tener errores de reconocimiento: no los tengas en cuenta): «${answer}»
Evalúa solo el contenido, comparado con la referencia. Sé justo y motivador, en español de España, tuteando.
- score: nota de 0 a 10 (puede tener medio punto).
- good: 1-2 frases sobre lo que ha dicho bien (vacío si nada).
- missing: lo importante que le ha faltado o ha dicho mal, en 1-3 frases (vacío si nada).
- model_answer: cómo sería una respuesta oral de 10, en 2-4 frases claras.
Responde SOLO con JSON: {"score":0,"good":"","missing":"","model_answer":""}`
        : `És um professor simpático de Imagem Médica e Radioterapia que faz um exame oral a uma estudante do primeiro ano.
Pergunta: explica «${concept}».
O que dizem os apontamentos dela (referência): ${expected}
O que ela respondeu (transcrito de voz, pode ter erros de reconhecimento: não os tenhas em conta): «${answer}»
Avalia só o conteúdo, comparado com a referência. Sê justo e motivador, em português de Portugal, tratando-a por tu.
- score: nota de 0 a 10 (pode ter meio valor).
- good: 1-2 frases sobre o que disse bem (vazio se nada).
- missing: o importante que lhe faltou ou disse mal, em 1-3 frases (vazio se nada).
- model_answer: como seria uma resposta oral de 10, em 2-4 frases claras.
Responde SÓ com JSON: {"score":0,"good":"","missing":"","model_answer":""}`;
    const r = await completeJson(prompt, resultSchema, { lang, effort: "low", maxTokens: 1500 });
    res.json({ ...r, score: Math.round(r.score * 2) / 2 });
  }),
);
