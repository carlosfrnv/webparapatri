import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { asyncHandler } from "../http";
import { langOf } from "../i18n";
import { materialInLang } from "../study";
import { supabase } from "../supabase";

/**
 * Búsqueda en los resúmenes (complementa a /search, que busca en los apuntes): los apuntes están en portugués
 * y los resúmenes en el idioma de la web, así que con la web en español también encuentra lo que escriba
 * en español. Sin tildes ni mayúsculas. No gasta IA.
 */
export const findRouter = Router();

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Trozo de ~220 caracteres alrededor de la primera aparición de alguna de las palabras buscadas. */
export function snippet(text: string, words: string[], size = 220) {
  const flat = plain(text);
  let at = -1;
  for (const w of words) {
    const i = flat.indexOf(plain(w));
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  if (at < 0) return clean(text.slice(0, size)) + (text.length > size ? "…" : "");
  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, start + size);
  return (start > 0 ? "…" : "") + clean(text.slice(start, end)) + (end < text.length ? "…" : "");
}

findRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const lang = langOf(req);
    const q = z.string().trim().min(2).max(100).parse(req.query.q);
    const subjectId = z.string().uuid().optional().catch(undefined).parse(req.query.subject_id);
    const words = q.split(/\s+/).filter((w) => w.length >= 2);

    // Archivos (apuntes listos) de la asignatura o de todas.
    let docsQuery = supabase
      .from("documents")
      .select("id, title, subject_id")
      .eq("user_id", userId)
      .eq("source_type", "apuntes")
      .eq("status", "ready");
    if (subjectId) docsQuery = docsQuery.eq("subject_id", subjectId);
    const { data: docs, error } = await docsQuery;
    if (error) throw error;
    const docById = new Map((docs ?? []).map((d) => [d.id as string, d]));
    if (docById.size === 0) {
      res.json({ summaries: [] });
      return;
    }
    const ids = [...docById.keys()];

    // En los resúmenes (en el idioma de la web), sin tildes ni mayúsculas.
    const { data: mats } = await supabase
      .from("study_materials")
      .select("document_id, summary, lang, translations")
      .eq("user_id", userId)
      .in("document_id", ids);
    const summaries = (mats ?? [])
      .map((row) => ({ row, text: ((materialInLang(row, lang) ?? row) as { summary: string }).summary ?? "" }))
      .filter(({ text }) => words.every((w) => plain(text).includes(plain(w))))
      .slice(0, 20)
      .map(({ row, text }) => ({
        document_id: row.document_id,
        title: docById.get(row.document_id)?.title ?? "",
        subject_id: docById.get(row.document_id)?.subject_id ?? null,
        snippet: snippet(text.replace(/[#*_>`|]/g, " "), words),
      }));

    res.json({ summaries });
  }),
);
