import type { Request } from "express";
import { rateLimit } from "express-rate-limit";
import { langOf, t } from "./i18n";

// Control de coste: como máximo 10 peticiones a la IA por minuto.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: (req: Request) => ({ error: t(langOf(req), "tooManyAi") }),
});

// Límite general contra abusos.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: (req: Request) => ({ error: t(langOf(req), "tooMany") }),
});
