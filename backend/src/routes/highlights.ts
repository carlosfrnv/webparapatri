import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { supabase } from "../supabase";

/** Subrayados y notas que ella pone en los resúmenes (por archivo y por idioma del resumen). */
export const highlightsRouter = Router();

const FIELDS = "id, document_id, lang, quote, color, note, created_at";
const COLORS = ["yellow", "orange", "red", "pink", "green", "blue"] as const;
// Si aún no se ha creado la tabla (falta ejecutar el SQL): se ve el resumen sin subrayados y se avisa al guardar.
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

highlightsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const documentId = z.string().uuid().parse(req.query.document_id);
    const { data, error } = await supabase
      .from("highlights")
      .select(FIELDS)
      .eq("user_id", userIdOf(req))
      .eq("document_id", documentId)
      .eq("lang", langOf(req))
      .order("created_at");
    if (missingTable(error?.code)) {
      res.json([]);
      return;
    }
    if (error) throw error;
    res.json(data ?? []);
  }),
);

highlightsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const body = z
      .object({
        document_id: z.string().uuid(),
        quote: z.string().trim().min(2).max(2000),
        color: z.enum(COLORS).default("yellow"),
        note: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(req.body);
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", body.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!doc) throw new HttpError(404, "documentNotFound");
    const { data, error } = await supabase
      .from("highlights")
      .insert({ ...body, note: body.note || null, user_id: userId, lang: langOf(req) })
      .select(FIELDS)
      .single();
    if (missingTable(error?.code)) throw new HttpError(409, "needsUpdate");
    if (error) throw error;
    res.status(201).json(data);
  }),
);

highlightsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ color: z.enum(COLORS).optional(), note: z.string().trim().max(2000).nullable().optional() })
      .parse(req.body);
    const { data, error } = await supabase
      .from("highlights")
      .update({ ...body, ...(body.note !== undefined ? { note: body.note || null } : {}) })
      .eq("id", z.string().uuid().parse(req.params.id))
      .eq("user_id", userIdOf(req))
      .select(FIELDS)
      .single();
    if (error) throw error;
    res.json(data);
  }),
);

highlightsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("highlights")
      .delete()
      .eq("id", z.string().uuid().parse(req.params.id))
      .eq("user_id", userIdOf(req));
    if (error) throw error;
    res.status(204).end();
  }),
);
