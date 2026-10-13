import { rateLimit } from "express-rate-limit";

// Controlo de custo: no máximo 10 pedidos à IA por minuto.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitos pedidos seguidos. Espera um minuto e tenta outra vez." },
});

// Limite geral contra abusos.
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitos pedidos seguidos. Espera um pouco." },
});
