import type { Lang } from "./i18n";
import { supabase } from "./supabase";

type Area = "base" | "radiologia" | "medicina_nuclear" | "radioterapia" | "transversal";

// Asignaturas iniciales, sacadas en parte del plan de estudios publicado por la ESSCVP Alto Tâmega
// (1.º y 2.º curso; los nombres pueden no ser exactos). 3.º y 4.º se añaden desde la web.
// Todo se puede editar o borrar desde la Biblioteca.
const INITIAL_SUBJECTS: { year: number; area: Area; es: string; pt: string }[] = [
  { year: 1, area: "base", es: "Anatomía y Fisiología", pt: "Anatomia e Fisiologia" },
  { year: 1, area: "base", es: "Física General", pt: "Física Geral" },
  { year: 1, area: "base", es: "Biomatemática y Bioestadística", pt: "Biomatemática e Bioestatística" },
  { year: 1, area: "base", es: "Física de las Radiaciones y Radiobiología", pt: "Física das Radiações e Radiobiologia" },
  { year: 1, area: "transversal", es: "Comunicación en Salud", pt: "Comunicação em Saúde" },
  { year: 1, area: "transversal", es: "Psicología", pt: "Psicologia" },

  { year: 2, area: "radiologia", es: "Radioanatomía", pt: "Radioanatomia" },
  { year: 2, area: "radiologia", es: "Métodos y Técnicas en Radiología", pt: "Métodos e Técnicas em Radiologia" },
  { year: 2, area: "medicina_nuclear", es: "Medicina Nuclear", pt: "Medicina Nuclear" },
  { year: 2, area: "medicina_nuclear", es: "Radiofarmacia", pt: "Radiofarmácia" },
  { year: 2, area: "radioterapia", es: "Radioterapia", pt: "Radioterapia" },
];

/**
 * Crea las asignaturas iniciales solo la primera vez y si ella todavía no tiene ninguna,
 * en el idioma que tenga elegido en la web (español por defecto).
 * Queda registrado en user_settings para que no vuelvan a aparecer si las borra todas.
 */
export async function seedSubjectsIfEmpty(userId: string, lang: Lang) {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("seeded")
    .eq("user_id", userId)
    .maybeSingle();
  if (settings?.seeded) return;

  const { count, error } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  if ((count ?? 0) === 0) {
    const { error: insertError } = await supabase
      .from("subjects")
      .insert(INITIAL_SUBJECTS.map((s) => ({ name: s[lang], year: s.year, area: s.area, user_id: userId })));
    if (insertError) throw insertError;
  }
  await supabase.from("user_settings").upsert({ user_id: userId, seeded: true });
}
