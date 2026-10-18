import { Router } from "express";
import { z } from "zod";
import { type AuthedRequest, userIdOf } from "../auth";
import { asyncHandler, HttpError } from "../http";
import { langOf } from "../i18n";
import { pushToUser, vapidKeys } from "../push";
import { supabase } from "../supabase";

/** Activar y desactivar los recordatorios en este navegador. */
export const pushRouter = Router();

pushRouter.get(
  "/key",
  asyncHandler(async (_req, res) => {
    res.json({ key: (await vapidKeys())?.publicKey ?? null });
  }),
);

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

pushRouter.post(
  "/subscribe",
  asyncHandler(async (req, res) => {
    if (!(await vapidKeys())) throw new HttpError(409, "needsUpdate");
    const subscription = subscriptionSchema.parse(req.body?.subscription);
    const { error } = await supabase.from("push_subscriptions").upsert({
      endpoint: subscription.endpoint,
      user_id: userIdOf(req),
      email: (req as AuthedRequest).email || null,
      lang: langOf(req),
      subscription,
    });
    if (error?.code === "42P01" || error?.code === "PGRST205") throw new HttpError(409, "needsUpdate");
    if (error) throw error;
    res.status(201).json({ ok: true });
  }),
);

pushRouter.post(
  "/unsubscribe",
  asyncHandler(async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userIdOf(req));
    res.status(204).end();
  }),
);

/** Aviso de prueba, para comprobar que llegan. */
pushRouter.post(
  "/test",
  asyncHandler(async (req, res) => {
    const sent = await pushToUser(userIdOf(req), (lang) =>
      lang === "pt"
        ? { title: "Estudo IMR 🖤", body: "Os avisos estão ativados. Vais recebê-los aqui." }
        : { title: "Estudio IMR 🖤", body: "Los avisos están activados. Te llegarán aquí." },
    );
    res.json({ sent });
  }),
);
