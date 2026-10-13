import { Router } from "express";
import { z } from "zod";
import { userIdOf } from "../auth";
import { seedSubjectsIfEmpty } from "../seed";
import { supabase } from "../supabase";
import { asyncHandler, HttpError } from "../http";

export const subjectsRouter = Router();

const areaSchema = z.enum(["base", "radiologia", "medicina_nuclear", "radioterapia", "transversal"]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  year: z.number().int().min(1).max(4).nullable().optional(),
  area: areaSchema.nullable().optional(),
});
const updateSchema = createSchema.partial();

subjectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await seedSubjectsIfEmpty(userId);
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, year, area, created_at, documents(count)")
      .eq("user_id", userId)
      .order("year", { ascending: true, nullsFirst: false })
      .order("name");
    if (error) throw error;
    res.json(
      (data ?? []).map(({ documents, ...s }) => ({
        ...s,
        document_count: (documents as unknown as { count: number }[])[0]?.count ?? 0,
      })),
    );
  }),
);

subjectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabase
      .from("subjects")
      .insert({ ...body, user_id: userIdOf(req) })
      .select("*")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

subjectsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data, error } = await supabase
      .from("subjects")
      .update(body)
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req))
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Disciplina não encontrada.");
    res.json(data);
  }),
);

subjectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    // Os documentos ficam sem disciplina (on delete set null), não são apagados.
    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", String(req.params.id))
      .eq("user_id", userIdOf(req));
    if (error) throw error;
    res.status(204).end();
  }),
);
