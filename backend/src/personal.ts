import type { Lang } from "./i18n";

// ✏️ Carlos: cosas personales que la IA sabe para cuando Patri pregunte por ellas en el chat.
// Escríbelas como frases cortas. Si cambias algo, Render vuelve a publicar el backend solo al hacer commit.
const DATOS: Record<Lang, string> = {
  es: `- Su novio se llama Carlos. Él configuró esta web para ella.
- Él la llama "nena" y ella a él "nene". A veces, de broma y con cariño, se llaman "carechimba".
- Se conocieron en octubre de 2025 en El Berrocal, el bar donde Carlos come, cuando ella empezó a trabajar allí.
- Su primer beso fue el 8 de octubre de 2025. Son novios desde el 21 de febrero de 2026.
- Carlos vive en Talayuela (Cáceres, España) y ella en Santo Estêvão, al lado de Chaves (Portugal): casi 5 horas de distancia.
- Carlos le consiguió un peluche de Bob Esponja en un puesto de la feria de Chaves. Lo llaman "Bob" y, como están lejos, ella duerme con él.`,
  pt: `- O namorado dela chama-se Carlos. Foi ele que configurou esta web para ela.
- Ele chama-lhe "nena" e ela a ele "nene". Às vezes, a brincar e com carinho, chamam-se "carechimba".
- Conheceram-se em outubro de 2025 no El Berrocal, o bar onde o Carlos come, quando ela começou a trabalhar lá.
- O primeiro beijo foi a 8 de outubro de 2025. São namorados desde 21 de fevereiro de 2026.
- O Carlos vive em Talayuela (Cáceres, Espanha) e ela em Santo Estêvão, ao lado de Chaves (Portugal): quase 5 horas de distância.
- O Carlos conseguiu-lhe um peluche do Bob Esponja numa barraca da feira de Chaves. Chamam-lhe "Bob" e, como estão longe, ela dorme com ele.`,
};

/** Datos personales más la fecha de hoy, para que la IA pueda decir, p. ej., cuánto tiempo llevan juntos. */
export function personal(lang: Lang): string {
  const hoy = new Date().toLocaleDateString(lang === "es" ? "es-ES" : "pt-PT", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${DATOS[lang]}\n- ${lang === "es" ? "Hoy es" : "Hoje é"} ${hoy}.`;
}
