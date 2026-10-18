import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { langOf, t } from "./i18n";
import { supabase } from "./supabase";

export interface AuthedRequest extends Request {
  userId: string;
  email: string;
}

// Pequeña caché para no preguntar a Supabase en cada petición.
const cache = new Map<string, { userId: string; email: string; expires: number }>();
const CACHE_MS = 5 * 60 * 1000;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: t(langOf(req), "missingSession") });
    return;
  }

  const cached = cache.get(token);
  if (cached && cached.expires > Date.now()) {
    (req as AuthedRequest).userId = cached.userId;
    (req as AuthedRequest).email = cached.email;
    next();
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: t(langOf(req), "expiredSession") });
    return;
  }

  // Si hay lista de emails, solo esos. Si no, cualquier usuario de Supabase (el registro está desactivado).
  if (config.ALLOWED_EMAILS.length > 0 && !config.ALLOWED_EMAILS.includes((data.user.email ?? "").toLowerCase())) {
    res.status(403).json({ error: t(langOf(req), "forbiddenEmail") });
    return;
  }

  if (cache.size > 100) cache.clear();
  const email = (data.user.email ?? "").toLowerCase();
  cache.set(token, { userId: data.user.id, email, expires: Date.now() + CACHE_MS });
  (req as AuthedRequest).userId = data.user.id;
  (req as AuthedRequest).email = email;
  next();
}

export function userIdOf(req: Request): string {
  return (req as AuthedRequest).userId;
}

/**
 * Quién está usando la web: "student" es ella (el primer email de ALLOWED_EMAIL) y "partner" es Carlos
 * (cualquier otro email de la lista). Sin lista de emails, todos cuentan como "student".
 */
export function roleOf(req: Request): "student" | "partner" {
  const email = (req as AuthedRequest).email;
  return config.ALLOWED_EMAILS.length > 1 && email && email !== config.ALLOWED_EMAIL ? "partner" : "student";
}
