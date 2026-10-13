import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { langOf, t } from "./i18n";
import { supabase } from "./supabase";

export interface AuthedRequest extends Request {
  userId: string;
}

// Pequena cache para não perguntar ao Supabase em cada pedido.
const cache = new Map<string, { userId: string; expires: number }>();
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
    next();
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: t(langOf(req), "expiredSession") });
    return;
  }

  if ((data.user.email ?? "").toLowerCase() !== config.ALLOWED_EMAIL) {
    res.status(403).json({ error: t(langOf(req), "forbiddenEmail") });
    return;
  }

  if (cache.size > 100) cache.clear();
  cache.set(token, { userId: data.user.id, expires: Date.now() + CACHE_MS });
  (req as AuthedRequest).userId = data.user.id;
  next();
}

export function userIdOf(req: Request): string {
  return (req as AuthedRequest).userId;
}
