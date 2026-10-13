import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string({ error: "Falta esta variável" }).min(1, "Falta esta variável"),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  SUPABASE_URL: z.string({ error: "Falta esta variável" }).url("Não é um URL válido"),
  SUPABASE_SERVICE_ROLE_KEY: z.string({ error: "Falta esta variável" }).min(1, "Falta esta variável"),
  ALLOWED_EMAIL: z.string({ error: "Falta esta variável" }).email("Não é um email válido"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(10000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Configuração inválida. Revê as variáveis de ambiente:");
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
