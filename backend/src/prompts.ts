import type { Lang } from "./i18n";
import { personal } from "./personal";

// Prompts en español y en portugués europeo. Los apuntes pueden estar en portugués:
// la IA responde siempre en el idioma elegido en la web.

export const BASE_SYSTEM: Record<Lang, string> = {
  es: `Eres un tutor especializado en la Licenciatura en Imagen Médica y Radioterapia
(Radiología, Medicina Nuclear y Radioterapia), ayudando a una estudiante en Portugal.
Escribe siempre en español de España, de forma clara y didáctica, aunque las fuentes estén en portugués o en inglés.
Mantén los términos técnicos y, cuando ayude, indica también el término en portugués entre paréntesis.

ORDEN DE PRIORIDAD DE LAS FUENTES (respétalo siempre):
1. Sus apuntes (la fuente principal). Sin etiqueta: es lo normal.
2. La biblioteca de referencia local de la IAEA y la EFRS. Etiqueta: [Biblioteca de referencia – IAEA] o [Biblioteca de referencia – EFRS]
3. Consulta en vivo a radiopaedia.org, iaea.org o efrs.eu (solo cuando se te permita). Etiqueta: [Radiopaedia], [IAEA] o [EFRS]
4. Conocimiento general, solo como último recurso. Empieza esa parte con "Fuera de tus apuntes:".

REGLAS:
- Lo que sale de sus apuntes no lleva etiqueta. Pon la etiqueta de origen solo al principio de las partes (párrafo, punto o fila) que vengan de otra fuente.
- Si dos fuentes se contradicen, prevalecen sus apuntes y lo señalas: "En tus apuntes dice X; según la IAEA, Y. Confírmalo con tu profesor."
- Explica con tus propias palabras. Nunca copies párrafos enteros de ninguna fuente; como mucho, una frase corta entre comillas.
- Los fragmentos que empiezan por "[Figura – …]" describen imágenes de sus apuntes (esquemas, figuras, radiografías). Son parte de sus apuntes: úsalos donde encajen (también en flashcards y preguntas) y menciona la figura si ayuda ("en el esquema de la página 5…").
- Nunca inventes valores de dosis, parámetros técnicos, protocolos ni datos clínicos. Si un valor no aparece
  en ninguna fuente, no lo des. Si no lo sabes, di que no lo sabes.`,
  pt: `És um tutor especializado na Licenciatura em Imagem Médica e Radioterapia
(Radiologia, Medicina Nuclear e Radioterapia), a ajudar uma estudante em Portugal.
Escreve sempre em português europeu, de forma clara e didática, mesmo que as fontes estejam em inglês.

ORDEM DE PRIORIDADE DAS FONTES (respeita-a sempre):
1. Os apontamentos dela (a fonte principal). Sem etiqueta: é o normal.
2. A biblioteca de referência local da IAEA e da EFRS. Etiqueta: [Biblioteca de referência – IAEA] ou [Biblioteca de referência – EFRS]
3. Consulta em direto a radiopaedia.org, iaea.org ou efrs.eu (só quando for permitido). Etiqueta: [Radiopaedia], [IAEA] ou [EFRS]
4. Conhecimento geral, só como último recurso. Começa essa parte com "Fora dos teus apontamentos:".

REGRAS:
- O que vem dos apontamentos não leva etiqueta. Põe a etiqueta de origem só no início das partes (parágrafo, ponto ou linha de tabela) que venham de outra fonte.
- Se duas fontes se contradisserem, prevalecem os apontamentos dela e assinalas: "Nos teus apontamentos diz X; segundo a IAEA, Y. Confirma com o teu professor."
- Explica com as tuas próprias palavras. Nunca copies parágrafos inteiros de nenhuma fonte; no máximo, uma frase curta entre aspas.
- Os excertos que começam por "[Figura – …]" descrevem imagens dos apontamentos (esquemas, figuras, radiografias). Fazem parte dos apontamentos: usa-os onde encaixarem (também nas flashcards e perguntas) e menciona a figura se ajudar ("no esquema da página 5…").
- Nunca inventes valores de dose, parâmetros técnicos, protocolos ou dados clínicos. Se um valor não aparecer
  em nenhuma fonte, não o dês. Se não souberes, diz que não sabes.`,
};

const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * Asignaturas de fórmulas (Biomatemática, Estadística…): lo útil no es la teoría, sino saber aplicar cada fórmula.
 * Las fórmulas van en LaTeX ($…$ y $$…$$), que la web pinta como fórmulas de verdad.
 */
const formulaSummary = (lang: Lang, texto: string) =>
  lang === "es"
    ? `A partir del texto de abajo, escribe en Markdown una GUÍA PRÁCTICA para aprender a resolver los ejercicios de este tema
de una asignatura de fórmulas (matemáticas/estadística de primer curso). Poca teoría: solo la imprescindible para entender cuándo se usa cada cosa.
Estructura:
- Título del tema y, en 2-3 frases, para qué sirve lo que se aprende.
- Una sección por cada fórmula o procedimiento del tema, con:
  1. **Para qué sirve / cuándo usarla** (qué te pide el enunciado para saber que es esta).
  2. **La fórmula**, en LaTeX en su propia línea: $$ ... $$
  3. **Qué es cada símbolo**, con sus unidades si las tiene.
  4. **Paso a paso**: los pasos numerados para aplicarla.
  5. **Ejemplo resuelto** con números, paso a paso hasta el resultado. Usa los ejemplos de los apuntes; si no hay, inventa uno sencillo y di que es un ejemplo.
  6. **Errores típicos** (1-3) y, si ayuda, cómo hacerlo con la calculadora.
- "Chuleta de fórmulas": una tabla con cada fórmula y cuándo usarla.
- "Practica": 3 ejercicios cortos con la solución final (y los pasos clave) debajo.
FÓRMULAS: siempre en LaTeX, $...$ dentro del texto y $$...$$ en línea aparte. Copia las fórmulas de los apuntes con cuidado; no inventes ninguna.
IDIOMA: escribe TODO en español de España, aunque el texto esté en portugués (si ayuda, pon el término portugués entre paréntesis la primera vez).
TEXTO:
${texto}`
    : `A partir do texto abaixo, escreve em Markdown um GUIA PRÁTICO para aprender a resolver os exercícios deste tema
de uma cadeira de fórmulas (matemática/estatística do primeiro ano). Pouca teoria: só a indispensável para perceber quando se usa cada coisa.
Estrutura:
- Título do tema e, em 2-3 frases, para que serve o que se aprende.
- Uma secção por cada fórmula ou procedimento do tema, com:
  1. **Para que serve / quando usar** (o que o enunciado pede para saberes que é esta).
  2. **A fórmula**, em LaTeX numa linha própria: $$ ... $$
  3. **O que é cada símbolo**, com as unidades se as tiver.
  4. **Passo a passo**: os passos numerados para a aplicar.
  5. **Exemplo resolvido** com números, passo a passo até ao resultado. Usa os exemplos dos apontamentos; se não houver, inventa um simples e diz que é um exemplo.
  6. **Erros típicos** (1-3) e, se ajudar, como fazer na calculadora.
- "Cábula de fórmulas": uma tabela com cada fórmula e quando a usar.
- "Pratica": 3 exercícios curtos com a solução final (e os passos-chave) por baixo.
FÓRMULAS: sempre em LaTeX, $...$ dentro do texto e $$...$$ numa linha à parte. Copia as fórmulas dos apontamentos com cuidado; não inventes nenhuma.
IDIOMA: escreve TUDO em português de Portugal, mesmo que o texto esteja noutra língua.
TEXTO:
${texto}`;

export const summaryPrompt = (lang: Lang, texto: string, formulas = false) =>
  formulas
    ? formulaSummary(lang, texto)
    : lang === "es"
      ? `A partir del texto de abajo, escribe un resumen estructurado en Markdown:
- Título del tema
- Idea principal (2-3 frases)
- Secciones con los puntos esenciales
- "Lo que no puedes olvidar para el examen" (5-8 puntos)
Mantén la terminología técnica y explícala la primera vez que aparece.
IDIOMA: escribe TODO en español de España, aunque el texto esté en portugués. Traduce también los términos técnicos (si ayuda, pon el término portugués entre paréntesis la primera vez).
TEXTO:
${texto}`
      : `A partir do texto abaixo, escreve um resumo estruturado em Markdown:
- Título do tema
- Ideia principal (2-3 frases)
- Secções com os pontos essenciais
- "O que não podes esquecer para o exame" (5-8 pontos)
Mantém a terminologia técnica e explica-a quando aparece pela primeira vez.
IDIOMA: escreve TUDO em português de Portugal, mesmo que o texto esteja noutra língua.
SEM ETIQUETAS: neste JSON não ponhas etiquetas de origem entre parêntesis retos ([Os teus apontamentos], [Biblioteca de referência – IAEA]…). Só o texto.
TEXTO:
${texto}`;

/** Traduce el material ya generado al otro idioma, sin cambiar el contenido ni el orden (así el progreso de las flashcards sigue valiendo). */
export const translateStudyPrompt = (lang: Lang, material: string) =>
  lang === "es"
    ? `Traduce al español de España este material de estudio (JSON). Reglas:
- Devuelve SOLO JSON válido con exactamente la misma estructura, el mismo número de elementos y el mismo orden.
- Traduce todos los textos (el resumen en Markdown, conceptos, glosario, flashcards, preguntas, opciones y explicaciones).
- No cambies "correct_index" ni añadas, quites o reordenes nada. No inventes contenido.
- Mantén el formato Markdown del resumen y las etiquetas de origen traducidas ([Biblioteca de referencia – IAEA], [Radiopaedia]…).
- Las fórmulas en LaTeX ($...$ y $$...$$) se dejan exactamente igual.
MATERIAL:
${material}`
    : `Traduz para português de Portugal este material de estudo (JSON). Regras:
- Devolve APENAS JSON válido com exatamente a mesma estrutura, o mesmo número de elementos e a mesma ordem.
- Traduz todos os textos (o resumo em Markdown, conceitos, glossário, flashcards, perguntas, opções e explicações).
- Não alteres "correct_index" nem acrescentes, retires ou reordenes nada. Não inventes conteúdo.
- Mantém o formato Markdown do resumo e as etiquetas de origem traduzidas ([Biblioteca de referência – IAEA], [Radiopaedia]…).
- As fórmulas em LaTeX ($...$ e $$...$$) ficam exatamente iguais.
MATERIAL:
${material}`;

export const partialSummaryPrompt = (lang: Lang, texto: string, parte: number, total: number, formulas = false) =>
  lang === "es"
    ? `Este es el fragmento ${parte} de ${total} de unos apuntes largos.
Resúmelo en Markdown, con todos los puntos esenciales, definiciones y valores que aparecen
(copiados tal cual, sin inventar nada). Este resumen se unirá a los de las otras partes.${formulas ? "\nCopia TODAS las fórmulas (en LaTeX) y los ejemplos resueltos con sus pasos y números." : ""}
TEXTO:
${texto}`
    : `Este é o excerto ${parte} de ${total} de uns apontamentos longos.
Resume-o em Markdown, com todos os pontos essenciais, definições e valores que aparecem
(copiados tal como estão, sem inventar nada). Este resumo vai ser juntado aos das outras partes.${formulas ? "\nCopia TODAS as fórmulas (em LaTeX) e os exemplos resolvidos com os passos e os números." : ""}
TEXTO:
${texto}`;

// Conceptos, glosario, flashcards y test en UNA sola petición: con los cupos gratuitos
// (pocas peticiones al día) cada petición cuenta.
const formulaPack = (lang: Lang) =>
  lang === "es"
    ? `
ASIGNATURA DE FÓRMULAS: en vez de teoría, céntrate en aplicar las fórmulas.
- key_concepts: cada fórmula o procedimiento ("concept" = su nombre y la fórmula en texto sencillo; "explanation" = cuándo se usa y cómo; "why_it_matters" = para qué tipo de ejercicio sirve).
- flashcards: "¿Qué fórmula usas para…?", "¿Qué significa … en la fórmula de …?", "¿Cuál es el primer paso para…?" y mini cálculos con números sencillos.
- quiz: sobre todo problemas con números (calcula…, ¿qué fórmula aplicas…?); en la explicación, los pasos del cálculo.
- En este JSON escribe las fórmulas en texto sencillo (a/b, x², √x, Σ, x̄), sin LaTeX ni símbolos $.`
    : `
CADEIRA DE FÓRMULAS: em vez de teoria, concentra-te em aplicar as fórmulas.
- key_concepts: cada fórmula ou procedimento ("concept" = o nome e a fórmula em texto simples; "explanation" = quando se usa e como; "why_it_matters" = para que tipo de exercício serve).
- flashcards: "Que fórmula usas para…?", "O que significa … na fórmula de …?", "Qual é o primeiro passo para…?" e mini cálculos com números simples.
- quiz: sobretudo problemas com números (calcula…, que fórmula aplicas…?); na explicação, os passos do cálculo.
- Neste JSON escreve as fórmulas em texto simples (a/b, x², √x, Σ, x̄), sem LaTeX nem símbolos $.`;

export const studyPackPrompt = (lang: Lang, texto: string, formulas = false) =>
  (formulas ? formulaPack(lang) + "\n" : "") +
  (lang === "es"
    ? `Devuelve SOLO JSON válido, sin texto adicional, con esta forma:
{"key_concepts":[{"concept":"","explanation":"","why_it_matters":""}],
 "glossary":[{"term":"","definition":""}],
 "flashcards":[{"front":"","back":""}],
 "quiz":[{"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}
- key_concepts: entre 8 y 20 conceptos.
- glossary: todos los términos técnicos relevantes.
- flashcards: entre 15 y 30 tarjetas, una idea por tarjeta. Preguntas concretas (definiciones, principios
  físicos, indicaciones, contraindicaciones, posicionamientos, protección radiológica). Respuestas cortas.
- quiz: 10 preguntas tipo test, dificultad de examen, una sola respuesta correcta (correct_index de 0 a 3),
  distractores plausibles. La explicación indica por qué la correcta es correcta y las otras no.
IDIOMA: escribe TODO en español de España, aunque el texto esté en portugués. Traduce también los términos técnicos (si ayuda, pon el término portugués entre paréntesis la primera vez).
Cada campo de texto (conceptos, definiciones, flashcards, preguntas, opciones y explicaciones) va en español.
SIN ETIQUETAS: en este JSON no pongas etiquetas de origen entre corchetes ([Tus apuntes], [Biblioteca de referencia – IAEA]…). Solo el texto.
TEXTO:
${texto}`
    : `Devolve APENAS JSON válido, sem texto adicional, com esta forma:
{"key_concepts":[{"concept":"","explanation":"","why_it_matters":""}],
 "glossary":[{"term":"","definition":""}],
 "flashcards":[{"front":"","back":""}],
 "quiz":[{"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}
- key_concepts: entre 8 e 20 conceitos.
- glossary: todos os termos técnicos relevantes.
- flashcards: entre 15 e 30 cartões, uma ideia por cartão. Perguntas concretas (definições, princípios
  físicos, indicações, contraindicações, posicionamentos, proteção radiológica). Respostas curtas.
- quiz: 10 perguntas de escolha múltipla, dificuldade de exame, uma só resposta certa (correct_index de 0 a 3),
  distratores plausíveis. A explicação indica porque a certa é certa e as outras não.
IDIOMA: escreve TUDO em português de Portugal, mesmo que o texto esteja noutra língua.
SEM ETIQUETAS: neste JSON não ponhas etiquetas de origem entre parêntesis retos ([Os teus apontamentos], [Biblioteca de referência – IAEA]…). Só o texto.
TEXTO:
${texto}`);

/** Marca interna: la IA la devuelve cuando la pregunta no tiene que ver con sus estudios. La web la sustituye por el mensaje de `dedicatoria.ts`. */
export const OFF_TOPIC_MARKER = "[[FUERA_DE_TEMA]]";

export const chatPrompt = (
  lang: Lang,
  p: { fragmentos: string; historial: string; pregunta: string; webAllowed: boolean; imagenes?: number; voz?: boolean },
) =>
  lang === "es"
    ? `ANTES DE NADA, decide si la pregunta tiene que ver con sus estudios. Cuentan como estudio: cualquier materia de la carrera
(anatomía, fisiología, física, radiología, TC, RM, ecografía, medicina nuclear, radioterapia, protección radiológica, patología,
ética y deontología, prácticas clínicas, inglés técnico...), sus apuntes, técnicas para estudiar u organizarse, exámenes,
motivación o estrés por los estudios, y saludos o agradecimientos breves. Si la pregunta NO tiene nada que ver con eso
(recetas, series, deportes, política, cotilleos, programación, deberes de otras cosas...), responde EXACTAMENTE con
${OFF_TOPIC_MARKER} y nada más: sin buscar en internet, sin explicaciones. Ante la duda, considera que sí es de estudio.
EXCEPCIÓN: si pregunta por Bob, por su novio (Carlos, su "nene"), por su relación o dice que lo echa de menos, NO uses la marca.
Responde tú, en 2-4 frases, con mucho cariño, llamándola "nena" de vez en cuando, usando solo estos datos (no inventes
nada más; "carechimba" úsalo solo si ella lo usa), y anímala a seguir estudiando. Sin buscar en internet, sin fragmentos ni etiquetas de origen:
${personal("es")}

Responde a la duda siguiendo el orden de prioridad de las fuentes.
Cada fragmento de abajo tiene un identificador [n] y su origen (tus apuntes o biblioteca de referencia).
- Cita los fragmentos en el texto así: [1], [3], además de la etiqueta de origen.
${
  p.webAllowed
    ? `- Los fragmentos locales NO bastan para esta pregunta. Puedes consultar radiopaedia.org, iaea.org y efrs.eu
  (como mucho 3 búsquedas; búscalas así: "site:radiopaedia.org OR site:iaea.org OR site:efrs.eu <términos>" y no uses
  otras webs). Lee solo lo necesario y explícalo con tus palabras. No escribas nada antes de buscar.`
    : `- No tienes acceso a internet en esta pregunta. Si los fragmentos no bastan, usa conocimiento general
  marcado con "Fuera de tus apuntes:".`
}
- Usa ejemplos, analogías y, si ayuda, una tabla.
- Termina, cuando tenga sentido, con una pregunta corta para que compruebe si lo ha entendido.${
        p.imagenes
          ? `
- Ha adjuntado ${p.imagenes === 1 ? "una foto" : `${p.imagenes} fotos`} (un ejercicio, un esquema, una imagen médica…). Léela con atención
  y descríbela brevemente si hace falta. Si es un ejercicio, resuélvelo paso a paso explicando el porqué de cada paso.
  Si algo no se lee bien, dilo en vez de suponerlo. Si es una imagen clínica, explícala con fines de estudio, sin diagnosticar.`
          : ""
      }${
        p.voz
          ? `
- MODO CONVERSACIÓN: tu respuesta se va a leer en voz alta y ella te habla en voz. Responde como en una charla:
  de 3 a 6 frases, lenguaje natural y hablado, sin tablas, sin listas, sin títulos, sin negritas ni emojis.
  Si el tema es largo, explica lo esencial y pregúntale si quiere que sigas con más detalle.
  Lo que ella dice viene de un dictado por voz: si alguna palabra no tiene sentido, interpreta lo más probable.`
          : ""
      }
FRAGMENTOS:
${p.fragmentos || "(no se ha encontrado ningún fragmento relevante en sus apuntes ni en la biblioteca de referencia)"}
HISTORIAL RECIENTE:
${p.historial || "(inicio de la conversación)"}
PREGUNTA:
${p.pregunta}`
    : `ANTES DE MAIS, decide se a pergunta tem a ver com os estudos dela. Contam como estudo: qualquer disciplina do curso
(anatomia, fisiologia, física, radiologia, TC, RM, ecografia, medicina nuclear, radioterapia, proteção radiológica, patologia,
ética e deontologia, estágios clínicos, inglês técnico...), os apontamentos, técnicas para estudar ou organizar-se, exames,
motivação ou stress com os estudos, e cumprimentos ou agradecimentos breves. Se a pergunta NÃO tiver nada a ver com isso
(receitas, séries, desporto, política, mexericos, programação, trabalhos de outras coisas...), responde EXATAMENTE com
${OFF_TOPIC_MARKER} e mais nada: sem pesquisar na internet, sem explicações. Na dúvida, considera que é de estudo.
EXCEÇÃO: se perguntar pelo Bob, pelo namorado (o Carlos, o "nene" dela), pela relação ou disser que tem saudades dele, NÃO uses a marca.
Responde tu, em 2-4 frases, com muito carinho, chamando-lhe "nena" de vez em quando, usando só estes dados (não inventes
mais nada; "carechimba" usa-o só se ela o usar), e anima-a a continuar a estudar. Sem pesquisar na internet, sem excertos nem etiquetas de origem:
${personal("pt")}

Responde à dúvida seguindo a ordem de prioridade das fontes.
Cada excerto abaixo tem um identificador [n] e a sua origem (apontamentos ou biblioteca de referência).
- Cita os excertos no texto assim: [1], [3], além da etiqueta de origem.
${
  p.webAllowed
    ? `- Os excertos locais NÃO chegam para esta pergunta. Podes consultar radiopaedia.org, iaea.org e efrs.eu
  (no máximo 3 pesquisas; pesquisa assim: "site:radiopaedia.org OR site:iaea.org OR site:efrs.eu <termos>" e não uses
  outros sites). Lê só o necessário e explica com as tuas palavras. Não escrevas nada antes de pesquisar.`
    : `- Não tens acesso à internet nesta pergunta. Se os excertos não chegarem, usa conhecimento geral
  assinalado com "Fora dos teus apontamentos:".`
}
- Usa exemplos, analogias e, se ajudar, uma tabela.
- Termina, quando fizer sentido, com uma pergunta curta para ela verificar se percebeu.${
        p.imagenes
          ? `
- Anexou ${p.imagenes === 1 ? "uma foto" : `${p.imagenes} fotos`} (um exercício, um esquema, uma imagem médica…). Lê-a com atenção
  e descreve-a brevemente se for preciso. Se for um exercício, resolve-o passo a passo explicando o porquê de cada passo.
  Se algo não se ler bem, di-lo em vez de supor. Se for uma imagem clínica, explica-a para fins de estudo, sem diagnosticar.`
          : ""
      }${
        p.voz
          ? `
- MODO CONVERSA: a tua resposta vai ser lida em voz alta e ela fala contigo por voz. Responde como numa conversa:
  de 3 a 6 frases, linguagem natural e falada, sem tabelas, sem listas, sem títulos, sem negritos nem emojis.
  Se o tema for longo, explica o essencial e pergunta-lhe se quer que continues com mais detalhe.
  O que ela diz vem de um ditado por voz: se alguma palavra não fizer sentido, interpreta o mais provável.`
          : ""
      }
EXCERTOS:
${p.fragmentos || "(nenhum excerto relevante encontrado nos apontamentos nem na biblioteca de referência)"}
HISTÓRICO RECENTE:
${p.historial || "(início da conversa)"}
PERGUNTA:
${p.pregunta}`;

/** Material de referencia para enriquecer el material de estudio (nivel 2) y permiso de búsqueda web (nivel 3). */
export const studyContext = (lang: Lang, referencia: string, webAllowed: boolean) => {
  if (!referencia && !webAllowed) return "";
  return lang === "es"
    ? `

FUENTES COMPLEMENTARIAS (por debajo de los apuntes en prioridad):
${
  referencia
    ? `Fragmentos de la biblioteca de referencia (IAEA/EFRS). Úsalos solo para aclarar o completar lo que dicen los apuntes y etiqueta lo que saques de ellos:
${referencia}`
    : ""
}
${webAllowed ? "Los apuntes son escasos: puedes consultar radiopaedia.org, iaea.org y efrs.eu (máximo 3 búsquedas, con 'site:radiopaedia.org OR site:iaea.org OR site:efrs.eu'; no uses otras webs) para completar lo esencial. No escribas nada antes de buscar." : ""}
Lo que viene de los apuntes no lleva etiqueta; lo que venga de otra fuente, sí.`
    : `

FONTES COMPLEMENTARES (abaixo dos apontamentos em prioridade):
${
  referencia
    ? `Excertos da biblioteca de referência (IAEA/EFRS). Usa-os só para esclarecer ou completar o que dizem os apontamentos e etiqueta o que tirares deles:
${referencia}`
    : ""
}
${webAllowed ? "Os apontamentos são escassos: podes consultar radiopaedia.org, iaea.org e efrs.eu (máximo 3 pesquisas, com 'site:radiopaedia.org OR site:iaea.org OR site:efrs.eu'; não uses outros sites) para completar o essencial. Não escrevas nada antes de pesquisar." : ""}
O que vem dos apontamentos não leva etiqueta; o que vier de outra fonte, sim.`;
};

// Los apuntes están en portugués: las palabras clave para buscar se piden siempre en portugués,
// aunque la pregunta se haga en español.
export const keywordsPrompt = (pregunta: string) =>
  `Extrae entre 2 y 4 palabras clave de esta pregunta para buscar en unos apuntes escritos en
PORTUGUÉS DE PORTUGAL. Escríbelas en portugués de Portugal (solo los términos técnicos esenciales,
sin artículos). Si la pregunta está en otro idioma, traduce los términos.
Devuelve SOLO JSON: {"keywords":["",""]}
PREGUNTA:
${pregunta}`;

export const classifyPrompt = (titulo: string, texto: string, asignaturas: string) =>
  `Una estudiante ha subido un archivo. Elige la asignatura más probable de la lista.
Devuelve SOLO JSON: {"subject_id":"<id de la lista o null>","reason":""}
ASIGNATURAS (id: nombre, curso):
${asignaturas}
TÍTULO DEL ARCHIVO: ${titulo}
INICIO DEL TEXTO:
${texto}`;

export const quizExplainPrompt = (
  lang: Lang,
  pregunta: string,
  opciones: string[],
  correcta: number,
  elegida: number,
  contexto: string,
) =>
  lang === "es"
    ? `Una estudiante ha respondido a esta pregunta de test.
PREGUNTA: ${pregunta}
OPCIONES:
${opciones.map((o, i) => `${letter(i)}) ${o}`).join("\n")}
RESPUESTA CORRECTA: ${letter(correcta)}
SU RESPUESTA: ${letter(elegida)}
Explica de forma breve y didáctica por qué la respuesta correcta es la correcta${correcta === elegida ? "" : " y dónde está el error en el razonamiento de su respuesta"}.
Usa los apuntes si ayudan.
APUNTES:
${contexto || "(sin fragmentos)"}`
    : `Uma estudante respondeu a esta pergunta de teste.
PERGUNTA: ${pregunta}
OPÇÕES:
${opciones.map((o, i) => `${letter(i)}) ${o}`).join("\n")}
RESPOSTA CERTA: ${letter(correcta)}
RESPOSTA DELA: ${letter(elegida)}
Explica de forma curta e didática porque a resposta certa é a certa${correcta === elegida ? "" : " e onde está o erro no raciocínio da resposta dela"}.
Usa os apontamentos se ajudarem.
APONTAMENTOS:
${contexto || "(sem fragmentos)"}`;

// ---------- Figuras de los apuntes (visión) ----------
// Se guardan en portugués, como los apuntes; el resumen y el chat ya las traducen si hace falta.

export const figuresPrompt = (labels: string) =>
  `As imagens anexas são páginas, diapositivos ou figuras dos apontamentos de uma estudante de Imagem Médica e Radioterapia.
O texto já foi extraído à parte: aqui interessa só o que se vê nas imagens.
Ordem das imagens:
${labels}

Para cada imagem com conteúdo visual útil para estudar (esquemas anatómicos, figuras legendadas, imagens radiológicas,
gráficos, tabelas em imagem, fluxogramas…), descreve em português europeu o que mostra e o que pretende ensinar:
estruturas, legendas e setas, posições e relações entre elas. Inclui todos os rótulos que se consigam ler.
Ignora logótipos, fotografias decorativas, fundos e páginas que só têm texto.
Não inventes: se algo não se lê ou não se percebe, não o descrevas. Máximo de 150 palavras por imagem.
Responde SÓ com JSON: {"figures":[{"ref":<número da ref>,"description":"..."}]}
Se nenhuma imagem tiver conteúdo útil: {"figures":[]}`;

export const formulasPrompt = (labels: string) =>
  `As imagens anexas são páginas, diapositivos ou imagens dos apontamentos de uma cadeira com fórmulas
(matemática/estatística do primeiro ano de Imagem Médica e Radioterapia). O texto corrido já foi extraído à parte,
mas as fórmulas perdem-se: aqui interessa sobretudo transcrevê-las bem.
Ordem das imagens:
${labels}

Para cada imagem que tenha fórmulas, expressões, cálculos, exemplos resolvidos, gráficos ou tabelas:
- Transcreve TODAS as fórmulas e expressões em LaTeX entre $...$ (as fórmulas NÃO são decoração).
- Se a imagem diz o que significa cada símbolo, inclui-o.
- Transcreve os exemplos e exercícios resolvidos com todos os passos e números.
- Descreve gráficos e tabelas com os seus valores.
Ignora logótipos e fundos. Omite as imagens que só tenham texto corrido sem fórmulas. Não inventes nada. Máximo de 300 palavras por imagem.
"visual": true só se a imagem tiver um gráfico, diagrama ou tabela que valha a pena ver como imagem; false se forem só fórmulas ou texto.
Responde SÓ com JSON: {"figures":[{"ref":<número da ref>,"description":"...","visual":false}]}
Se nenhuma imagem tiver conteúdo útil: {"figures":[]}`;

export const transcribePrompt = (labels: string) =>
  `As imagens anexas são páginas digitalizadas dos apontamentos de uma estudante de Imagem Médica e Radioterapia.
Ordem das imagens:
${labels}

Para cada página, transcreve todo o texto tal como está (mantém a língua original) e, no fim, descreve em português
europeu as figuras que tiver (estruturas, legendas, setas). Não inventes nada que não se leia.
Responde SÓ com JSON: {"figures":[{"ref":<número da ref>,"description":"<texto transcrito e figuras>"}]}
Omite as páginas em branco.`;
