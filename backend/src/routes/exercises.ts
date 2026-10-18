import { Router } from "express";
import { z } from "zod";
import { completeJson } from "../ai";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf, type Lang } from "../i18n";
import { aiLimiter } from "../limits";
import { materialInLang } from "../study";
import { supabase } from "../supabase";

/**
 * Ejercicios guiados (asignaturas de fórmulas): la IA crea un ejercicio parecido a los de sus apuntes, partido
 * en pasos; ella resuelve cada paso y se le corrige. Los resultados numéricos se comprueban sin IA.
 */
export const exercisesRouter = Router();

interface Material {
  document_id: string;
  title: string;
  summary: string;
  concepts: string[];
}

/** Material (en el idioma de la web) de los temas listos de la asignatura que ya tienen resumen. */
async function subjectMaterial(userId: string, subjectId: string, lang: Lang): Promise<Material[]> {
  const { data: subject } = await supabase
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!subject) throw new HttpError(404, "invalidSubject");
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("source_type", "apuntes")
    .eq("status", "ready");
  if (error) throw error;
  if (!docs?.length) return [];
  const { data: rows, error: e2 } = await supabase
    .from("study_materials")
    .select("document_id, summary, key_concepts, lang, translations")
    .eq("user_id", userId)
    .in(
      "document_id",
      docs.map((d) => d.id),
    );
  if (e2) throw e2;
  const titles = new Map(docs.map((d) => [d.id, d.title as string]));
  return (rows ?? []).map((row) => {
    const m = (materialInLang(row, lang) ?? row) as { summary: string; key_concepts: { concept: string }[] };
    return {
      document_id: row.document_id,
      title: titles.get(row.document_id) ?? "",
      summary: m.summary ?? "",
      concepts: (m.key_concepts ?? []).map((c) => c.concept),
    };
  });
}

/** Temas (archivos) de la asignatura con sus tipos de ejercicio (los conceptos clave). */
exercisesRouter.get(
  "/topics",
  asyncHandler(async (req, res) => {
    const subjectId = z.string().uuid().parse(req.query.subject_id);
    const material = await subjectMaterial(userIdOf(req), subjectId, langOf(req));
    res.json({
      topics: material.map((m) => ({ document_id: m.document_id, title: m.title, concepts: m.concepts })),
    });
  }),
);

const exerciseSchema = z.object({
  topic: z.string().min(1).max(120),
  statement: z.string().min(1),
  steps: z
    .array(
      z.object({
        instruction: z.string().min(1),
        hint: z.string(),
        answer: z.string().min(1),
        explanation: z.string(),
      }),
    )
    .min(1)
    .transform((s) => s.slice(0, 6)),
  final_answer: z.string(),
});

const newSchema = z.object({
  subject_id: z.string().uuid(),
  document_id: z.string().uuid().optional(),
  topic: z.string().max(200).optional(),
  avoid: z.array(z.string().max(200)).max(10).optional(),
});

/** Un ejercicio nuevo, de un tema elegido (o al azar) y, si se pide, de un tipo concreto. */
exercisesRouter.post(
  "/new",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const lang = langOf(req);
    const body = newSchema.parse(req.body);
    const material = await subjectMaterial(userIdOf(req), body.subject_id, lang);
    if (material.length === 0) throw new HttpError(409, "noMaterial");
    const pool = body.document_id ? material.filter((m) => m.document_id === body.document_id) : material;
    const doc = pool[Math.floor(Math.random() * pool.length)] ?? material[0];
    const prompt =
      lang === "es"
        ? `Eres profesor de una asignatura de fórmulas (matemáticas/estadística de primer curso de Imagen Médica y Radioterapia).
Crea UN ejercicio nuevo para practicar, parecido a los de estos apuntes${body.topic ? `, del tipo «${body.topic}»` : ""}.
${body.avoid?.length ? `No repitas estos enunciados: ${body.avoid.join(" | ")}` : ""}
- Con números sencillos (que se puedan hacer con calculadora) y, si encaja, con un contexto de imagen médica o radioterapia.
- "statement": el enunciado en Markdown; fórmulas en LaTeX ($...$).
- "steps": de 2 a 5 pasos para resolverlo, en orden. Cada paso:
  - "instruction": qué tiene que calcular en ese paso (sin dar el resultado).
  - "hint": una pista corta (la fórmula o la idea que necesita), sin dar el resultado.
  - "answer": el resultado de ese paso, corto: un número con sus unidades si las hay (p. ej. "16", "4 mSv", "1,63"); usa coma decimal.
  - "explanation": cómo se llega a ese resultado, en 1-2 frases con el cálculo.
- "final_answer": la respuesta final completa.
- "topic": el tipo de ejercicio en pocas palabras (p. ej. "Media aritmética").
Comprueba tú mismo cada cálculo antes de responder: los resultados tienen que ser exactos.
Todo en español de España.
APUNTES (${doc.title}):
${doc.summary.slice(0, 14000)}
Responde SOLO con JSON: {"topic":"","statement":"","steps":[{"instruction":"","hint":"","answer":"","explanation":""}],"final_answer":""}`
        : `És professor de uma cadeira de fórmulas (matemática/estatística do primeiro ano de Imagem Médica e Radioterapia).
Cria UM exercício novo para praticar, parecido com os destes apontamentos${body.topic ? `, do tipo «${body.topic}»` : ""}.
${body.avoid?.length ? `Não repitas estes enunciados: ${body.avoid.join(" | ")}` : ""}
- Com números simples (que se possam fazer com calculadora) e, se encaixar, com um contexto de imagem médica ou radioterapia.
- "statement": o enunciado em Markdown; fórmulas em LaTeX ($...$).
- "steps": de 2 a 5 passos para o resolver, por ordem. Cada passo:
  - "instruction": o que tem de calcular nesse passo (sem dar o resultado).
  - "hint": uma pista curta (a fórmula ou a ideia de que precisa), sem dar o resultado.
  - "answer": o resultado desse passo, curto: um número com as unidades se as houver (p. ex. "16", "4 mSv", "1,63"); usa vírgula decimal.
  - "explanation": como se chega a esse resultado, em 1-2 frases com o cálculo.
- "final_answer": a resposta final completa.
- "topic": o tipo de exercício em poucas palavras (p. ex. "Média aritmética").
Confirma tu próprio cada cálculo antes de responder: os resultados têm de estar certos.
Tudo em português de Portugal.
APONTAMENTOS (${doc.title}):
${doc.summary.slice(0, 14000)}
Responde SÓ com JSON: {"topic":"","statement":"","steps":[{"instruction":"","hint":"","answer":"","explanation":""}],"final_answer":""}`;
    const exercise = await completeJson(prompt, exerciseSchema, { lang, effort: "medium", maxTokens: 4000 });
    res.json({ ...exercise, document_id: doc.document_id, document_title: doc.title });
  }),
);

/** Primer número de un texto ("≈ 1,63 mSv" → 1.63); null si no hay. */
export function firstNumber(text: string): number | null {
  const m = text.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?(?:[eE]-?\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Decimales con los que está escrito un número ("1,6" → 1). */
const decimalsOf = (text: string) => text.replace(/\s/g, "").match(/\d[.,](\d+)/)?.[1].length ?? 0;

/**
 * ¿Coinciden dos números? Se perdona el redondeo: 1 % de diferencia, o el resultado redondeado a los decimales
 * que ella ha escrito (1,6 por 1,63), siempre que no redondee demasiado (2 por 1,63 no vale).
 */
export function sameNumber(given: number, expected: number, givenText = String(given)) {
  if (Math.abs(given - expected) <= Math.max(Math.abs(expected) * 0.01, 0.011)) return true;
  const d = decimalsOf(givenText);
  if (d === 0 && Math.abs(expected) < 10) return false;
  const f = 10 ** d;
  return Math.round(expected * f) / f === Math.round(given * f) / f;
}

const checkSchema = z.object({
  statement: z.string().max(4000),
  instruction: z.string().max(1000),
  expected: z.string().max(300),
  answer: z.string().max(500),
});

/** Corrige un paso: si las dos respuestas son números, se comparan sin IA; si no, la IA dice si está bien. */
exercisesRouter.post(
  "/check",
  asyncHandler(async (req, res) => {
    const lang = langOf(req);
    const b = checkSchema.parse(req.body);
    const expected = firstNumber(b.expected);
    const given = firstNumber(b.answer);
    const onlyNumber = /^[\s≈~=]*-?\d+(?:[.,]\d+)?\s*[a-zA-Zµ%²³/]*\s*$/.test(b.expected);
    if (expected !== null && given !== null && onlyNumber) {
      res.json({ correct: sameNumber(given, expected, b.answer), feedback: "" });
      return;
    }
    if (!b.answer.trim()) {
      res.json({ correct: false, feedback: "" });
      return;
    }
    const prompt =
      lang === "es"
        ? `Corrige el paso de un ejercicio de una estudiante de primer curso. Sé breve y amable, en español de España, tuteando.
Enunciado: ${b.statement}
Paso: ${b.instruction}
Resultado correcto: ${b.expected}
Lo que ha puesto ella: «${b.answer}»
Si es equivalente al resultado correcto (aunque esté escrito de otra forma o redondeado), es correcto.
Si no, en "feedback" dile en una o dos frases qué ha fallado, sin darle el resultado.
Responde SOLO con JSON: {"correct":true,"feedback":""}`
        : `Corrige o passo de um exercício de uma estudante do primeiro ano. Sê breve e simpático, em português de Portugal, tratando-a por tu.
Enunciado: ${b.statement}
Passo: ${b.instruction}
Resultado certo: ${b.expected}
O que ela escreveu: «${b.answer}»
Se for equivalente ao resultado certo (mesmo que escrito de outra forma ou arredondado), está certo.
Se não, em "feedback" diz-lhe numa ou duas frases o que falhou, sem lhe dar o resultado.
Responde SÓ com JSON: {"correct":true,"feedback":""}`;
    const r = await completeJson(prompt, z.object({ correct: z.boolean(), feedback: z.string() }), {
      lang,
      effort: "low",
      maxTokens: 600,
    });
    res.json(r);
  }),
);

/** Si falla un número, la IA le dice qué ha podido fallar (sin darle el resultado). */
exercisesRouter.post(
  "/why",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const lang = langOf(req);
    const b = checkSchema.parse(req.body);
    const prompt =
      lang === "es"
        ? `Una estudiante de primer curso ha fallado este paso de un ejercicio. En una o dos frases, en español de España y con cariño,
dile qué ha podido hacer mal (un error típico que explique su número), SIN darle el resultado correcto.
Enunciado: ${b.statement}
Paso: ${b.instruction}
Resultado correcto: ${b.expected}
Lo que ha puesto ella: «${b.answer}»
Responde SOLO con JSON: {"feedback":""}`
        : `Uma estudante do primeiro ano errou este passo de um exercício. Numa ou duas frases, em português de Portugal e com carinho,
diz-lhe o que pode ter feito mal (um erro típico que explique o número dela), SEM lhe dar o resultado certo.
Enunciado: ${b.statement}
Passo: ${b.instruction}
Resultado certo: ${b.expected}
O que ela escreveu: «${b.answer}»
Responde SÓ com JSON: {"feedback":""}`;
    res.json(await completeJson(prompt, z.object({ feedback: z.string() }), { lang, effort: "low", maxTokens: 400 }));
  }),
);
