import type { Lang } from "./i18n";

/**
 * Prompts del asistente de trabajos. El contenido (índice, investigación, borrador) va en el idioma del trabajo;
 * los comentarios de la revisión, en el idioma de la web.
 */

export interface AssignmentMeta {
  kind: string; // trabajo escrito, presentación, póster, informe de prácticas…
  words: number; // extensión aproximada
  lang: Lang; // idioma en que se entrega el trabajo
  citation: "APA" | "Vancouver";
  subject?: string;
  instructions?: string; // lo que ha pedido el profesor
  cover?: Record<string, string | boolean>; // portada del Word (no la usa la IA)
}

const langName = (l: Lang) => (l === "pt" ? "português europeu (norma do Acordo Ortográfico de 1990)" : "español de España");

const context = (title: string, m: AssignmentMeta) =>
  `TRABAJO: «${title}»
Tipo: ${m.kind}. Extensión aproximada: ${m.words} palabras. Idioma del trabajo: ${langName(m.lang)}.
Norma de citas: ${m.citation === "APA" ? "APA 7.ª edición" : "Vancouver"}.${m.subject ? `\nAsignatura: ${m.subject}.` : ""}
Curso: 1.º de la Licenciatura en Imagen Médica y Radioterapia (ESSCVP, Portugal).
${m.instructions ? `INSTRUCCIONES DEL PROFESOR:\n${m.instructions.slice(0, 4000)}` : "(sin instrucciones del profesor)"}`;

/** Propone un índice (JSON). */
export const outlinePrompt = (title: string, m: AssignmentMeta, notes: string) =>
  `Eres un tutor universitario que ayuda a una estudiante a planificar un trabajo académico.
${context(title, m)}

Propón un índice adecuado a la extensión (normalmente entre 4 y 8 apartados, con subapartados numerados solo si hacen falta),
que empiece por una introducción y acabe con una conclusión (las referencias van aparte, no las incluyas).
Si el profesor ha dado una estructura, respétala. Los títulos van en el idioma del trabajo (${langName(m.lang)}).
Para cada apartado, en "goal" escribe en una frase qué hay que contar en él (también en el idioma del trabajo)
y en "words" cuántas palabras aproximadas le corresponden (que sumen la extensión total).
Si sus apuntes tratan el tema, tenlos en cuenta.
APUNTES RELACIONADOS:
${notes || "(nada en sus apuntes)"}

Responde SOLO con JSON: {"sections":[{"title":"1. Introducción","goal":"...","words":150}]}`;

/** Investigación de un apartado con búsqueda en internet (Markdown con fuentes). */
export const researchPrompt = (title: string, m: AssignmentMeta, section: { title: string; goal: string }, all: string[], notes: string, web: boolean) =>
  `Eres un tutor universitario que ayuda a una estudiante a documentarse para un trabajo académico.
${context(title, m)}
ÍNDICE COMPLETO (para no repetir lo de otros apartados): ${all.join(" · ")}
APARTADO A INVESTIGAR: «${section.title}» — ${section.goal}

${
  web
    ? `Busca en internet en FUENTES FIABLES (haz varias búsquedas si hace falta): artículos científicos (PubMed/PMC, SciELO,
revistas con DOI), repositorios universitarios (RCAAP), sociedades científicas (EANM, SNMMI, Sociedade Portuguesa de Medicina
Nuclear…), organismos oficiales (IAEA, OMS, DGS, SNS), hospitales e institutos y libros de texto reconocidos.
Evita blogs, foros y webs comerciales. Wikipedia solo como pista para llegar a la fuente original, nunca como fuente.
PRIORIZA fuentes con autor y año: artículos científicos (mejor revisiones con DOI), libros e informes oficiales con fecha.
Las páginas institucionales sin fecha (p. ej., "What is nuclear medicine?" de una sociedad) solo como complemento,
como mucho 1 o 2: si usas una, busca en ella la fecha de actualización antes de dar la referencia por "sin fecha".`
    : `Ahora no puedes buscar en internet: usa solo lo que sepas con seguridad y sus apuntes. No inventes referencias.`
}
REGLAS (es una estudiante de primer curso; no le pidas comprobaciones de investigadora):
- Incluye SOLO datos que hayas leído en una fuente concreta. Si algo no lo puedes comprobar, NO lo incluyas
  (no le pidas que lo verifique ella ni que busque en bases de datos).
- Nada de citas secundarias ("como se citó en…"): cita solo las fuentes que has leído tú.
Usa también sus apuntes si tratan el tema (cítalos como "apuntes de clase").
APUNTES RELACIONADOS:
${notes || "(nada en sus apuntes)"}

Escribe en ${langName(m.lang)}, en Markdown, con EXACTAMENTE estas secciones:
### ${m.lang === "pt" ? "Ideias-chave" : "Ideas clave"}
Entre 5 y 10 viñetas con los datos importantes para este apartado (fechas, nombres, cifras, conceptos), cada una con su cita
en el texto (${m.citation === "APA" ? "Autor o Institución, año" : "número de referencia [1]"}). Explícalo con tus palabras, sin copiar.
### ${m.lang === "pt" ? "Fontes" : "Fuentes"}
Una línea por fuente realmente consultada, ya en formato ${m.citation === "APA" ? "APA 7" : "Vancouver"}, con su enlace.
Usa "${m.lang === "pt" ? "s.d." : "s. f."}" solo si de verdad no hay ninguna fecha.
No añadas nada más (ni avisos, ni saludo, ni pregunta final).`;

/** Borrador de un apartado a partir de la investigación (sin internet). */
export const draftPrompt = (title: string, m: AssignmentMeta, section: { title: string; goal: string; words: number }, all: string[], research: string, prev: string) =>
  `Eres un tutor universitario que ayuda a una estudiante a redactar un trabajo académico.
${context(title, m)}
ÍNDICE: ${all.join(" · ")}
APARTADO A REDACTAR: «${section.title}» — ${section.goal} (unas ${section.words} palabras).
${prev ? `FINAL DEL APARTADO ANTERIOR (para enlazar sin repetir):\n${prev.slice(-800)}\n` : ""}
INVESTIGACIÓN DE ESTE APARTADO (usa solo estos datos y sus citas; no inventes datos ni referencias; si hay una
sección "Pendiente de confirmar"/"Por confirmar", ignórala y no uses esos datos):
${research || "(no hay investigación: escribe solo lo general y seguro, sin cifras ni fechas, y sin citas inventadas)"}

Escribe el texto del apartado en ${langName(m.lang)}, registro académico pero claro, propio de una estudiante de primer curso
(nada pomposo), en párrafos (sin viñetas salvo que el contenido lo pida), con las citas en el texto en formato
${m.citation === "APA" ? "APA 7 (Autor, año)" : "Vancouver [n]"}. No pongas el título del apartado ni la lista de referencias.
CITAS COMO EN UN TRABAJO REAL (no después de cada frase):
- Normalmente 1 o 2 citas por párrafo, al final de la idea que apoyan.
- Si varias frases seguidas salen de la misma fuente, cítala UNA vez en ese párrafo y no la repitas.
- Alterna con alguna cita narrativa (p. ej., "Según la IAEA (2021), …").
- Las ideas generales y conocidas no necesitan cita; cita los datos concretos, cifras, fechas y definiciones.
Nada de citas secundarias ("como se citó en…").
El texto es SOLO el apartado, listo para pegar en el trabajo: sin notas, avisos, comentarios ni instrucciones dentro.
Si de verdad hay algo que ella deba revisar, escríbelo DESPUÉS del texto, tras una línea que diga exactamente ${NOTES_MARK},
en como mucho 3 frases muy cortas y fáciles de hacer en un minuto (nunca "búscalo en PubMed" ni "confirma el DOI").
Si no hay nada que revisar (lo normal), no pongas esa línea.`;

/**
 * Borradores antiguos: la IA dejaba al final, tras una línea "---", avisos para ella ("confirma…", "verifica…").
 * Si el final tiene esa pinta, se pasa al recuadro de avisos para que no acabe en el Word.
 */
export function splitLegacyDraft(draft: string) {
  const i = draft.lastIndexOf("\n---");
  if (i < 0) return null;
  const tail = draft.slice(i).replace(/^\n-{3,}\s*/, "");
  const advice = /(confirm|verific|comprueb|compro|c[ií]tala|te recomiendo|recomendo|no la concretes|búscala|procura)/i;
  if (tail.length > 3000 || !advice.test(tail)) return null;
  return { body: draft.slice(0, i).trim(), notes: tail.trim() };
}

/** Separa el texto del borrador de los avisos para ella (que van en un recuadro aparte, no en el Word). */
export const NOTES_MARK = "===NOTAS===";
export function splitDraft(text: string) {
  const i = text.indexOf(NOTES_MARK);
  const body = (i >= 0 ? text.slice(0, i) : text).replace(/\n-{3,}\s*$/, "").trim();
  const notes = i >= 0 ? text.slice(i + NOTES_MARK.length).trim() : "";
  return { body, notes };
}

/** Revisión de un texto suyo (comentarios en el idioma de la web). */
export const reviewPrompt = (uiLang: Lang, title: string, m: AssignmentMeta, text: string) =>
  uiLang === "es"
    ? `Eres un profesor universitario que revisa, con cariño pero con rigor, un texto de una estudiante de primer curso.
${context(title, m)}
TEXTO DE LA ESTUDIANTE:
${text.slice(0, 12000)}

Escribe en español, en Markdown, con estas secciones:
### Lo que está bien
### Qué mejorar
(estructura, claridad, registro académico, conectores, repeticiones; con ejemplos concretos de su texto)
### Correcciones
Tabla con "Texto original" | "Propuesta" para errores de ortografía, gramática o expresión en ${langName(m.lang)}.
### Citas y fuentes
Afirmaciones que necesitan cita, citas mal formateadas según ${m.citation === "APA" ? "APA 7" : "Vancouver"} y frases que parecen copiadas
(aconseja parafrasear).
### Siguiente paso
Una o dos acciones concretas.`
    : `És um professor universitário que revê, com carinho mas com rigor, um texto de uma estudante do primeiro ano.
${context(title, m)}
TEXTO DA ESTUDANTE:
${text.slice(0, 12000)}

Escreve em português europeu, em Markdown, com estas secções:
### O que está bem
### O que melhorar
(estrutura, clareza, registo académico, conectores, repetições; com exemplos concretos do texto)
### Correções
Tabela com "Texto original" | "Proposta" para erros de ortografia, gramática ou expressão em ${langName(m.lang)}.
### Citações e fontes
Afirmações que precisam de citação, citações mal formatadas segundo ${m.citation === "APA" ? "APA 7" : "Vancouver"} e frases que parecem copiadas
(aconselha a parafrasear).
### Próximo passo
Uma ou duas ações concretas.`;
