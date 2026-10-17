import type { Lang } from "./i18n";
import { supabase } from "./supabase";

type Area = "base" | "radiologia" | "medicina_nuclear" | "radioterapia" | "transversal";

// Asignaturas y exámenes iniciales, sacados del horario de 1.º curso (1.er semestre, 2026/27)
// de la ESSCVP Alto Tâmega. Todo se puede editar o borrar desde la web.
const INITIAL_SUBJECTS: {
  key: string;
  year: number;
  area: Area;
  es: string;
  pt: string;
}[] = [
  {
    key: "anato",
    year: 1,
    area: "base",
    es: "Anatomofisiología",
    pt: "Anatomofisiologia",
  },
  {
    key: "fisica",
    year: 1,
    area: "base",
    es: "Física General",
    pt: "Física Geral",
  },
  { key: "bioq", year: 1, area: "base", es: "Bioquímica", pt: "Bioquímica" },
  {
    key: "biomat",
    year: 1,
    area: "base",
    es: "Biomatemática y Bioestadística",
    pt: "Biomatemática e Bioestatística",
  },
  {
    key: "imagen",
    year: 1,
    area: "transversal",
    es: "Integración a la Imagen",
    pt: "Integração à Imagem",
  },
  {
    key: "psico",
    year: 1,
    area: "transversal",
    es: "Psicología",
    pt: "Psicologia",
  },
  {
    key: "ident",
    year: 1,
    area: "transversal",
    es: "Identidad y Voluntariado",
    pt: "Identidade e Voluntariado",
  },
];

type ExamKind = "freq1" | "freq2" | "freq3" | "trabajos" | "normal";
const EXAM_TITLES: Record<ExamKind, Record<Lang, string>> = {
  freq1: { es: "1.ª Frequência", pt: "1.ª Frequência" },
  freq2: { es: "2.ª Frequência", pt: "2.ª Frequência" },
  freq3: { es: "3.ª Frequência", pt: "3.ª Frequência" },
  trabajos: { es: "Presentación de trabajos", pt: "Apresentação de trabalhos" },
  normal: { es: "Examen normal", pt: "Exame normal" },
};

// Fechas del horario. Los exámenes de recurso (8–12 feb.) no se añaden: solo si hacen falta.
const INITIAL_EXAMS: { subject: string; kind: ExamKind; date: string }[] = [
  { subject: "anato", kind: "freq1", date: "2026-10-23" },
  { subject: "biomat", kind: "freq1", date: "2026-11-13" },
  { subject: "fisica", kind: "freq1", date: "2026-11-14" },
  { subject: "imagen", kind: "trabajos", date: "2026-11-20" },
  { subject: "bioq", kind: "freq1", date: "2026-11-21" },
  { subject: "anato", kind: "freq2", date: "2026-12-02" },
  { subject: "ident", kind: "trabajos", date: "2027-01-14" },
  { subject: "psico", kind: "trabajos", date: "2027-01-15" },
  { subject: "bioq", kind: "freq2", date: "2027-01-20" },
  { subject: "fisica", kind: "freq2", date: "2027-01-22" },
  { subject: "anato", kind: "freq3", date: "2027-01-27" },
  { subject: "imagen", kind: "trabajos", date: "2027-01-28" },
  { subject: "biomat", kind: "freq2", date: "2027-01-29" },
  // En el horario, Bioquímica tiene "2.ª Frequência" el 20 (clase TP) y el 30 (clase teórica).
  { subject: "bioq", kind: "freq2", date: "2027-01-30" },
  { subject: "ident", kind: "normal", date: "2027-02-01" },
  { subject: "psico", kind: "normal", date: "2027-02-01" },
  { subject: "fisica", kind: "normal", date: "2027-02-02" },
  { subject: "anato", kind: "normal", date: "2027-02-04" },
  { subject: "imagen", kind: "normal", date: "2027-02-04" },
  { subject: "biomat", kind: "normal", date: "2027-02-05" },
  { subject: "bioq", kind: "normal", date: "2027-02-05" },
];

// Varias peticiones pueden llegar a la vez (p. ej., el calendario pide asignaturas y exámenes):
// así solo se crean una vez.
const running = new Map<string, Promise<void>>();

/**
 * Crea las asignaturas y exámenes iniciales solo la primera vez y si todavía no tiene ninguna asignatura,
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
    const { data: created, error: insertError } = await supabase
      .from("subjects")
      .insert(
        INITIAL_SUBJECTS.map((s) => ({
          name: s[lang],
          year: s.year,
          area: s.area,
          user_id: userId,
        })),
      )
      .select("id, name");
    if (insertError) throw insertError;
    const idByKey = new Map(INITIAL_SUBJECTS.map((s) => [s.key, created?.find((c) => c.name === s[lang])?.id ?? null]));
    const { error: examsError } = await supabase.from("exams").insert(
      INITIAL_EXAMS.map((e) => ({
        user_id: userId,
        subject_id: idByKey.get(e.subject),
        title: EXAM_TITLES[e.kind][lang],
        exam_date: e.date,
      })),
    );
    if (examsError) throw examsError;
  }
  await supabase.from("user_settings").upsert({ user_id: userId, seeded: true });
}
