import type { Lang } from "./i18n";
import { supabase } from "./supabase";

type Area = "base" | "radiologia" | "medicina_nuclear" | "radioterapia" | "transversal";

// Asignaturas iniciales, sacadas del horario de 1.º curso (1.er semestre, 2026/27)
// de la ESSCVP Alto Tâmega. Todo se puede editar o borrar desde la web.
const INITIAL_SUBJECTS: { year: number; area: Area; es: string; pt: string }[] = [
  { year: 1, area: "base", es: "Anatomofisiología", pt: "Anatomofisiologia" },
  { year: 1, area: "base", es: "Física General", pt: "Física Geral" },
  { year: 1, area: "base", es: "Bioquímica", pt: "Bioquímica" },
  { year: 1, area: "base", es: "Biomatemática y Bioestadística", pt: "Biomatemática e Bioestatística" },
  { year: 1, area: "transversal", es: "Integración a la Imagen", pt: "Integração à Imagem" },
  { year: 1, area: "transversal", es: "Psicología", pt: "Psicologia" },
  { year: 1, area: "transversal", es: "Identidad y Voluntariado", pt: "Identidade e Voluntariado" },
];

// Varias peticiones pueden llegar a la vez (p. ej., el calendario pide asignaturas y exámenes):
// así solo se crean una vez.
const running = new Map<string, Promise<void>>();

/**
 * Crea las asignaturas iniciales solo la primera vez y si todavía no tiene ninguna asignatura,
 * en el idioma que tenga elegido en la web (español por defecto).
 * Queda registrado en user_settings para que no vuelvan a aparecer si las borra.
 */
export function seedSubjectsIfEmpty(userId: string, lang: Lang): Promise<void> {
  let job = running.get(userId);
  if (!job) {
    job = seed(userId, lang).finally(() => running.delete(userId));
    running.set(userId, job);
  }
  return job;
}

async function seed(userId: string, lang: Lang) {
  const { data: settings } = await supabase.from("user_settings").select("seeded").eq("user_id", userId).maybeSingle();
  if (settings?.seeded) return;

  const { count, error } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  if ((count ?? 0) === 0) {
    const { error: insertError } = await supabase.from("subjects").insert(
      INITIAL_SUBJECTS.map((s) => ({
        name: s[lang],
        translations: { es: s.es, pt: s.pt },
        year: s.year,
        area: s.area,
        user_id: userId,
      })),
    );
    if (insertError) throw insertError;
  }
  await supabase.from("user_settings").upsert({ user_id: userId, seeded: true });
}

/** Nombre de la asignatura en el idioma de la web (las iniciales tienen traducción; las suyas, no). */
export function localName(subject: { name: string; translations?: unknown }, lang: Lang): string {
  const t = subject.translations as Partial<Record<Lang, string>> | null | undefined;
  return t?.[lang] ?? subject.name;
}
