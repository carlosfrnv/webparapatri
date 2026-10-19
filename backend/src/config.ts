import { z } from "zod";

const envSchema = z.object({
  // IA: orden de proveedores y modelos. Se salta cualquiera cuya clave no esté configurada.
  AI_CHAIN: z
    .string()
    .default(
      "gemini:gemini-flash-latest,gemini:gemini-flash-lite-latest,groq:openai/gpt-oss-120b",
    ),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  // Opcional y de pago: solo se usa si se añade "anthropic:<modelo>" a AI_CHAIN.
  ANTHROPIC_API_KEY: z.string().optional(),
  SUPABASE_URL: z
    .string({ error: "Falta esta variable" })
    .url("No es una URL válida"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ error: "Falta esta variable" })
    .min(1, "Falta esta variable"),
  // Opcional. Uno o varios emails separados por comas: solo esos pueden usar la web. El primero es el de Patri
  // (los scripts usan sus datos). Si se deja vacío, puede entrar cualquier usuario creado en Supabase
  // (con el registro desactivado en Supabase, solo los que crees tú).
  ALLOWED_EMAIL: z
    .string()
    .default("")
    .refine(
      (v) =>
        !v.trim() ||
        v.split(",").every((e) => z.email().safeParse(e.trim()).success),
      "No es un email válido (si son varios, sepáralos con comas)",
    ),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(10000),
  // Claves de los recordatorios en el móvil (Web Push). Opcionales: si faltan, se generan solas
  // y se guardan en Supabase (ver push.ts).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // Hora (en Portugal) a la que se mandan los recordatorios del día.
  REMINDER_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  // Búsquedas web como máximo por pregunta (Radiopaedia, IAEA, EFRS). 0 = sin consulta online.
  WEB_MAX_SEARCHES: z.coerce.number().int().min(0).max(5).default(3),
  // Código y PIN de la tarjeta regalo de Primor (se pueden cambiar en Render). Solo se le enseña a ella al tocar "Descubrir código".
  GIFT_CODE: z.string().trim().default("410002376193"),
  GIFT_PIN: z.string().trim().default("4510"),
});

const parsed = envSchema.safeParse(process.env);
const hasAiKey =
  parsed.success &&
  !!(
    parsed.data.GEMINI_API_KEY ||
    parsed.data.GROQ_API_KEY ||
    parsed.data.ANTHROPIC_API_KEY
  );
if (parsed.success && !hasAiKey) {
  console.error(
    "Configuración no válida: falta la clave de la IA (GEMINI_API_KEY y/o GROQ_API_KEY).",
  );
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
  ALLOWED_EMAILS: parsed.data.ALLOWED_EMAIL.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  ALLOWED_EMAIL: parsed.data.ALLOWED_EMAIL.split(",")[0].trim().toLowerCase(),
  FRONTEND_ORIGINS: parsed.data.FRONTEND_ORIGIN.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
};

export const STORAGE_BUCKET = "temario";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Audio de clase: hasta ~3 horas en MP3 normal. Se comprime antes de guardarlo (~14 MB por hora).
export const MAX_AUDIO_BYTES = 300 * 1024 * 1024;
