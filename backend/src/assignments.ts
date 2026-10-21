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
Evita blogs, foros y webs comerciales. Wikipedia solo como pista para llegar a la fuente original, nunca como fuente.`
    : `Ahora no puedes buscar en internet: usa solo lo que sepas con seguridad y sus apuntes, y en "Dónde buscar" indica
fuentes fiables concretas para confirmarlo. No inventes referencias.`
}
Usa también sus apuntes si tratan el tema (cítalos como "apuntes de clase").
APUNTES RELACIONADOS:
${notes || "(nada en sus apuntes)"}

Escribe en ${langName(m.lang)}, en Markdown, con EXACTAMENTE estas secciones:
### ${m.lang === "pt" ? "Ideias-chave" : "Ideas clave"}
Entre 5 y 10 viñetas con los datos importantes para este apartado (fechas, nombres, cifras, conceptos), cada una con su cita
en el texto (${m.citation === "APA" ? "Autor o Institución, año" : "número de referencia [1]"}). Explícalo con tus palabras, sin copiar.
### ${m.lang === "pt" ? "Fontes" : "Fuentes"}
Una línea por fuente realmente consultada, ya en formato ${m.citation === "APA" ? "APA 7" : "Vancouver"}, con su enlace.
### ${m.lang === "pt" ? "Por confirmar" : "Pendiente de confirmar"}
Datos que no has podido verificar en ninguna fuente fiable y dónde buscarlos (si no hay, escribe "—").
No añadas nada más (ni saludo ni pregunta final).`;

/** Borrador de un apartado a partir de la investigación (sin internet). */
export const draftPrompt = (title: string, m: AssignmentMeta, section: { title: string; goal: string; words: number }, all: string[], research: string, prev: string) =>
  `Eres un tutor universitario que ayuda a una estudiante a redactar un trabajo académico.
${context(title, m)}
ÍNDICE: ${all.join(" · ")}
APARTADO A REDACTAR: «${section.title}» — ${section.goal} (unas ${section.words} palabras).
${prev ? `FINAL DEL APARTADO ANTERIOR (para enlazar sin repetir):\n${prev.slice(-800)}\n` : ""}
INVESTIGACIÓN DE ESTE APARTADO (usa solo estos datos y sus citas; no inventes datos ni referencias):
${research || "(no hay investigación: escribe solo lo general y seguro, sin cifras ni fechas, y sin citas inventadas)"}

Escribe el texto del apartado en ${langName(m.lang)}, registro académico pero claro, propio de una estudiante de primer curso
(nada pomposo), en párrafos (sin viñetas salvo que el contenido lo pida), con las citas en el texto en formato
${m.citation === "APA" ? "APA 7 (Autor, año)" : "Vancouver [n]"}. No pongas el título del apartado ni la lista de referencias.
Es un borrador para que ella lo revise y lo adapte con sus palabras.`;

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
