import { supabase } from "./supabase";

type Area = "base" | "radiologia" | "medicina_nuclear" | "radioterapia" | "transversal";

// Proposta inicial (não é o plano oficial). Tudo é editável na web.
const INITIAL_SUBJECTS: { year: number; area: Area; name: string }[] = [
  { year: 1, area: "base", name: "Anatomia" },
  { year: 1, area: "base", name: "Fisiologia" },
  { year: 1, area: "base", name: "Física das Radiações" },
  { year: 1, area: "base", name: "Biofísica" },
  { year: 1, area: "base", name: "Bioquímica" },
  { year: 1, area: "transversal", name: "Introdução à Imagem Médica e Radioterapia" },
  { year: 1, area: "transversal", name: "Psicologia e Comunicação em Saúde" },
  { year: 1, area: "transversal", name: "Primeiros Socorros" },

  { year: 2, area: "radiologia", name: "Anatomia Radiológica" },
  { year: 2, area: "base", name: "Radiobiologia" },
  { year: 2, area: "transversal", name: "Proteção Radiológica" },
  { year: 2, area: "radiologia", name: "Radiologia Convencional" },
  { year: 2, area: "radiologia", name: "Tomografia Computorizada" },
  { year: 2, area: "medicina_nuclear", name: "Princípios de Medicina Nuclear" },
  { year: 2, area: "radioterapia", name: "Princípios de Radioterapia" },
  { year: 2, area: "base", name: "Patologia" },

  { year: 3, area: "radiologia", name: "Ressonância Magnética" },
  { year: 3, area: "radiologia", name: "Ultrassonografia" },
  { year: 3, area: "radiologia", name: "Mamografia" },
  { year: 3, area: "radiologia", name: "Radiologia de Intervenção / Angiografia" },
  { year: 3, area: "medicina_nuclear", name: "Medicina Nuclear e PET" },
  { year: 3, area: "medicina_nuclear", name: "Radiofarmácia" },
  { year: 3, area: "radioterapia", name: "Planeamento e Dosimetria em Radioterapia" },
  { year: 3, area: "radioterapia", name: "Braquiterapia" },
  { year: 3, area: "transversal", name: "Controlo de Qualidade" },

  { year: 4, area: "transversal", name: "Ensino Clínico – Radiologia" },
  { year: 4, area: "transversal", name: "Ensino Clínico – Medicina Nuclear" },
  { year: 4, area: "transversal", name: "Ensino Clínico – Radioterapia" },
  { year: 4, area: "transversal", name: "Investigação / Projeto Final" },
  { year: 4, area: "transversal", name: "Gestão e Ética Profissional" },
];

/**
 * Cria as disciplinas iniciais apenas na primeira vez e se ela ainda não tiver nenhuma.
 * Fica registado em user_settings para não voltarem a aparecer se ela as apagar todas.
 */
export async function seedSubjectsIfEmpty(userId: string) {
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
      .insert(INITIAL_SUBJECTS.map((s) => ({ ...s, user_id: userId })));
    if (insertError) throw insertError;
  }
  await supabase.from("user_settings").upsert({ user_id: userId, seeded: true });
}
