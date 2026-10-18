import { Router } from "express";
import { z } from "zod";
import { roleOf, userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { pushToStudent } from "../push";
import { supabase } from "../supabase";

/**
 * Lo que comparten las dos cuentas: el buzón (Carlos le escribe notas que ella ve al entrar).
 * No va por usuario: es de los dos.
 */
export const coupleRouter = Router();

// Si aún no se han creado las tablas (falta ejecutar el SQL): al leer, vacío; al escribir, aviso.
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";
const check = (error: { code?: string } | null) => {
  if (missingTable(error?.code)) throw new HttpError(409, "needsUpdate");
  if (error) throw error;
};

coupleRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json({ role: roleOf(req) });
  }),
);

// ---------- Buzón ----------

coupleRouter.get(
  "/notes",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("love_notes")
      .select("id, body, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (missingTable(error?.code)) {
      res.json([]);
      return;
    }
    check(error);
    res.json(data ?? []);
  }),
);

coupleRouter.post(
  "/notes",
  asyncHandler(async (req, res) => {
    if (roleOf(req) !== "partner") throw new HttpError(403, "invalidData");
    const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
    const { data, error } = await supabase
      .from("love_notes")
      .insert({ body, author_id: userIdOf(req) })
      .select("id, body, created_at, read_at")
      .single();
    check(error);
    // Aviso en su móvil o iPad (si tiene los recordatorios activados).
    pushToStudent((lang) => ({
      title: lang === "pt" ? "💌 O Carlos deixou-te uma nota" : "💌 Carlos te ha dejado una nota",
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      url: "/",
    })).catch((err) => console.error("Error al avisar de la nota:", err));
    res.status(201).json(data);
  }),
);

coupleRouter.post(
  "/notes/:id/read",
  asyncHandler(async (req, res) => {
    // Solo cuenta como leída cuando la abre ella.
    if (roleOf(req) !== "student") {
      res.status(204).end();
      return;
    }
    const { error } = await supabase
      .from("love_notes")
      .update({ read_at: new Date().toISOString() })
      .eq("id", Number(req.params.id))
      .is("read_at", null);
    check(error);
    res.status(204).end();
  }),
);

coupleRouter.delete(
  "/notes/:id",
  asyncHandler(async (req, res) => {
    if (roleOf(req) !== "partner") throw new HttpError(403, "invalidData");
    const { error } = await supabase.from("love_notes").delete().eq("id", Number(req.params.id));
    check(error);
    res.status(204).end();
  }),
);
