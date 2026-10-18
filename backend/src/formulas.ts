import { supabase } from "./supabase";

/**
 * Asignaturas de fórmulas (Biomatemática, Estadística, Cálculo…). En ellas la IA lee cada página buscando
 * fórmulas (no solo las figuras) y el resumen es una guía práctica para resolver ejercicios.
 */
export const FORMULA_SUBJECT = /matem|estat[ií]st|c[aá]lculo|[aá]lgebra/i;

export async function isFormulaDocument(documentId: string, userId: string): Promise<boolean> {
  const { data: doc } = await supabase
    .from("documents")
    .select("subject_id")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!doc?.subject_id) return false;
  const { data: subject } = await supabase
    .from("subjects")
    .select("name")
    .eq("id", doc.subject_id)
    .eq("user_id", userId)
    .maybeSingle();
  return FORMULA_SUBJECT.test(subject?.name ?? "");
}
