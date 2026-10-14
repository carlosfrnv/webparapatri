import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string({ error: "Falta esta variable" }).min(1, "Falta esta variable"),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  SUPABASE_URL: z.string({ error: "Falta esta variable" }).url("No es una URL válida"),
  SUPABASE_SERVICE_ROLE_KEY: z.string({ error: "Falta esta variable" }).min(1, "Falta esta variable"),
  ALLOWED_EMAIL: z.string({ error: "Falta esta variable" }).email("No es un email válido"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(10000),
  // Búsquedas web como máximo por pregunta (Radiopaedia, IAEA, EFRS). 0 = sin consulta online.
  WEB_MAX_SEARCHES: z.coerce.number().int().min(0).max(5).default(3),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuración no válida. Revisa las variables de entorno:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  ...parsed.data,
  ALLOWED_EMAIL: parsed.data.ALLOWED_EMAIL.trim().toLowerCase(),
  FRONTEND_ORIGINS: parsed.data.FRONTEND_ORIGIN.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
};

export const STORAGE_BUCKET = "temario";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
