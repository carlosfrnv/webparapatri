import type { Lang } from "./i18n";
import { supabase } from "./supabase";

type Area = "base" | "radiologia" | "medicina_nuclear" | "radioterapia" | "transversal";

// Propuesta inicial (no es el plan oficial). Todo se puede editar desde la web.
// Cada asignatura tiene su nombre en español y el nombre oficial en portugués.
const INITIAL_SUBJECTS: { year: number; area: Area; es: string; pt: string }[] = [
  { year: 1, area: "base", es: "Anatomía", pt: "Anatomia" },
  { year: 1, area: "base", es: "Fisiología", pt: "Fisiologia" },
  { year: 1, area: "base", es: "Física de las Radiaciones", pt: "Física das Radiações" },
  { year: 1, area: "base", es: "Biofísica", pt: "Biofísica" },
  { year: 1, area: "base", es: "Bioquímica", pt: "Bioquímica" },
  {
    year: 1,
    area: "transversal",
    es: "Introducción a la Imagen Médica y Radioterapia",
    pt: "Introdução à Imagem Médica e Radioterapia",
  },
  {
    year: 1,
    area: "transversal",
    es: "Psicología y Comunicación en Salud",
    pt: "Psicologia e Comunicação em Saúde",
  },
  { year: 1, area: "transversal", es: "Primeros Auxilios", pt: "Primeiros Socorros" },

  { year: 2, area: "radiologia", es: "Anatomía Radiológica", pt: "Anatomia Radiológica" },
  { year: 2, area: "base", es: "Radiobiología", pt: "Radiobiologia" },
  { year: 2, area: "transversal", es: "Protección Radiológica", pt: "Proteção Radiológica" },
  { year: 2, area: "radiologia", es: "Radiología Convencional", pt: "Radiologia Convencional" },
  { year: 2, area: "radiologia", es: "Tomografía Computarizada", pt: "Tomografia Computorizada" },
  { year: 2, area: "medicina_nuclear", es: "Principios de Medicina Nuclear", pt: "Princípios de Medicina Nuclear" },
  { year: 2, area: "radioterapia", es: "Principios de Radioterapia", pt: "Princípios de Radioterapia" },
  { year: 2, area: "base", es: "Patología", pt: "Patologia" },

  { year: 3, area: "radiologia", es: "Resonancia Magnética", pt: "Ressonância Magnética" },
  { year: 3, area: "radiologia", es: "Ecografía", pt: "Ultrassonografia" },
  { year: 3, area: "radiologia", es: "Mamografía", pt: "Mamografia" },
  {
    year: 3,
    area: "radiologia",
    es: "Radiología Intervencionista / Angiografía",
    pt: "Radiologia de Intervenção / Angiografia",
  },
  { year: 3, area: "medicina_nuclear", es: "Medicina Nuclear y PET", pt: "Medicina Nuclear e PET" },
  { year: 3, area: "medicina_nuclear", es: "Radiofarmacia", pt: "Radiofarmácia" },
  {
    year: 3,
    area: "radioterapia",
    es: "Planificación y Dosimetría en Radioterapia",
    pt: "Planeamento e Dosimetria em Radioterapia",
  },
  { year: 3, area: "radioterapia", es: "Braquiterapia", pt: "Braquiterapia" },
  { year: 3, area: "transversal", es: "Control de Calidad", pt: "Controlo de Qualidade" },

  { year: 4, area: "transversal", es: "Prácticas Clínicas – Radiología", pt: "Ensino Clínico – Radiologia" },
  {
    year: 4,
    area: "transversal",
    es: "Prácticas Clínicas – Medicina Nuclear",
    pt: "Ensino Clínico – Medicina Nuclear",
  },
  { year: 4, area: "transversal", es: "Prácticas Clínicas – Radioterapia", pt: "Ensino Clínico – Radioterapia" },
  { year: 4, area: "transversal", es: "Investigación / Proyecto Final", pt: "Investigação / Projeto Final" },
  { year: 4, area: "transversal", es: "Gestión y Ética Profesional", pt: "Gestão e Ética Profissional" },
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
