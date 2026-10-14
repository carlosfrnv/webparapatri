import { z } from "zod";

const envSchema = z.object({
  // IA: orden de proveedores y modelos. Se salta cualquiera cuya clave no esté configurada.
  AI_CHAIN: z
    .string()
    .default("gemini:gemini-flash-latest,gemini:gemini-flash-lite-latest,groq:openai/gpt-oss-120b"),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  // Opcional y de pago: solo se usa si se añade "anthropic:<modelo>" a AI_CHAIN.
  ANTHROPIC_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string({ error: "Falta esta variable" }).url("No es una URL válida"),
  SUPABASE_SERVICE_ROLE_KEY: z.string({ error: "Falta esta variable" }).min(1, "Falta esta variable"),
  ALLOWED_EMAIL: z.string({ error: "Falta esta variable" }).email("No es un email válido"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(10000),
  // Búsquedas web como máximo por pregunta (Radiopaedia, IAEA, EFRS). 0 = sin consulta online.
  WEB_MAX_SEARCHES: z.coerce.number().int().min(0).max(5).default(3),
});

const parsed = envSchema.safeParse(process.env);
const hasAiKey =
  parsed.success && !!(parsed.data.GEMINI_API_KEY || parsed.data.GROQ_API_KEY || parsed.data.ANTHROPIC_API_KEY);
if (parsed.success && !hasAiKey) {
  console.error("Configuración no válida: falta la clave de la IA (GEMINI_API_KEY y/o GROQ_API_KEY).");
  process.exit(1);
}
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
