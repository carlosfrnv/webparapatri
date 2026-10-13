import type { Request } from "express";
import { rateLimit } from "express-rate-limit";
import { langOf, t } from "./i18n";

// Controlo de custo: no máximo 10 pedidos à IA por minuto.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: (req: Request) => ({ error: t(langOf(req), "tooManyAi") }),
});

// Limite geral contra abusos.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: (req: Request) => ({ error: t(langOf(req), "tooMany") }),
});
