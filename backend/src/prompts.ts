import type { Lang } from "./i18n";

// Prompts em espanhol e português europeu. Os apontamentos podem estar em português:
// a IA responde sempre no idioma escolhido pela estudante.

export const BASE_SYSTEM: Record<Lang, string> = {
  es: `Eres un tutor especializado en la Licenciatura en Imagen Médica y Radioterapia
(Radiología, Medicina Nuclear y Radioterapia), ayudando a una estudiante en Portugal.
Escribe siempre en español de España, de forma clara y didáctica, aunque los apuntes estén en portugués.
Mantén los términos técnicos y, cuando ayude, indica también el término en portugués entre paréntesis.
Básate en los apuntes proporcionados. Nunca inventes valores de dosis,
parámetros técnicos, protocolos ni datos clínicos. Si algo no está en los
apuntes y tienes que usar conocimiento general, indícalo con
"Fuera de tus apuntes:". Si no lo sabes, di que no lo sabes.`,
  pt: `És um tutor especializado na Licenciatura em Imagem Médica e Radioterapia
(Radiologia, Medicina Nuclear e Radioterapia), a ajudar uma estudante em Portugal.
Escreve sempre em português europeu, de forma clara e didática.
Baseia-te nos apontamentos fornecidos. Nunca inventes valores de dose,
parâmetros técnicos, protocolos ou dados clínicos. Se algo não estiver nos
apontamentos e tiveres de usar conhecimento geral, assinala-o com
"Fora dos teus apontamentos:". Se não souberes, diz que não sabes.`,
};

const letter = (i: number) => String.fromCharCode(65 + i);

export const summaryPrompt = (lang: Lang, texto: string) =>
  lang === "es"
    ? `A partir del texto de abajo, escribe un resumen estructurado en Markdown:
- Título del tema
- Idea principal (2-3 frases)
- Secciones con los puntos esenciales
- "Lo que no puedes olvidar para el examen" (5-8 puntos)
Mantén la terminología técnica y explícala la primera vez que aparece.
TEXTO:
${texto}`
    : `A partir do texto abaixo, escreve um resumo estruturado em Markdown:
- Título do tema
- Ideia principal (2-3 frases)
- Secções com os pontos essenciais
- "O que não podes esquecer para o exame" (5-8 pontos)
Mantém a terminologia técnica e explica-a quando aparece pela primeira vez.
TEXTO:
${texto}`;

export const partialSummaryPrompt = (lang: Lang, texto: string, parte: number, total: number) =>
  lang === "es"
    ? `Este es el fragmento ${parte} de ${total} de unos apuntes largos.
Resúmelo en Markdown, con todos los puntos esenciales, definiciones y valores que aparecen
(copiados tal cual, sin inventar nada). Este resumen se unirá a los de las otras partes.
TEXTO:
${texto}`
    : `Este é o excerto ${parte} de ${total} de uns apontamentos longos.
Resume-o em Markdown, com todos os pontos essenciais, definições e valores que aparecem
(copiados tal como estão, sem inventar nada). Este resumo vai ser juntado aos das outras partes.
TEXTO:
${texto}`;

export const conceptsPrompt = (lang: Lang, texto: string) =>
  lang === "es"
    ? `Devuelve SOLO JSON válido, sin texto adicional:
{"key_concepts":[{"concept":"","explanation":"","why_it_matters":""}],
 "glossary":[{"term":"","definition":""}]}
Entre 8 y 20 conceptos. Glosario con todos los términos técnicos relevantes. Todo en español.
TEXTO:
${texto}`
    : `Devolve APENAS JSON válido, sem texto adicional:
{"key_concepts":[{"concept":"","explanation":"","why_it_matters":""}],
 "glossary":[{"term":"","definition":""}]}
Entre 8 e 20 conceitos. Glossário com todos os termos técnicos relevantes.
TEXTO:
${texto}`;

export const flashcardsPrompt = (lang: Lang, texto: string) =>
  lang === "es"
    ? `Devuelve SOLO JSON: {"flashcards":[{"front":"","back":""}]}
Entre 15 y 30 tarjetas. Una idea por tarjeta. Preguntas concretas
(definiciones, principios físicos, indicaciones, contraindicaciones,
posicionamientos, protección radiológica). Respuestas cortas. Todo en español.
TEXTO:
${texto}`
    : `Devolve APENAS JSON: {"flashcards":[{"front":"","back":""}]}
Entre 15 e 30 cartões. Uma ideia por cartão. Perguntas concretas
(definições, princípios físicos, indicações, contraindicações,
posicionamentos, proteção radiológica). Respostas curtas.
TEXTO:
${texto}`;

export const quizPrompt = (lang: Lang, texto: string) =>
  lang === "es"
    ? `Devuelve SOLO JSON:
{"quiz":[{"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}
10 preguntas tipo test, dificultad de examen, una sola respuesta correcta,
distractores plausibles. La explicación indica por qué la correcta es correcta y las otras no. Todo en español.
TEXTO:
${texto}`
    : `Devolve APENAS JSON:
{"quiz":[{"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}
10 perguntas de escolha múltipla, dificuldade de exame, uma só resposta certa,
distratores plausíveis. A explicação indica porque a certa é certa e as outras não.
TEXTO:
${texto}`;

export const chatPrompt = (lang: Lang, excertos: string, ultimasMensagens: string, pergunta: string) =>
  lang === "es"
    ? `Responde a la duda usando los fragmentos de los apuntes de abajo (pueden estar en portugués).
Cada fragmento tiene un identificador [n] con documento y página.
- Cita las fuentes en el texto así: [1], [3].
- Si los fragmentos no bastan, responde con conocimiento general pero
  indícalo con "Fuera de tus apuntes:".
- Usa ejemplos, analogías y, si ayuda, una tabla.
- Termina, cuando tenga sentido, con una pregunta corta para que compruebe si lo ha entendido.
FRAGMENTOS:
${excertos || "(no se ha encontrado ningún fragmento relevante en los apuntes)"}
HISTORIAL RECIENTE:
${ultimasMensagens || "(inicio de la conversación)"}
PREGUNTA:
${pergunta}`
    : `Responde à dúvida usando os excertos dos apontamentos abaixo.
Cada excerto tem um identificador [n] com documento e página.
- Cita as fontes no texto assim: [1], [3].
- Se os excertos não chegarem, responde com conhecimento geral mas
  assinala com "Fora dos teus apontamentos:".
- Usa exemplos, analogias e, se ajudar, uma tabela.
- Termina, quando fizer sentido, com uma pergunta curta para ela verificar se percebeu.
EXCERTOS:
${excertos || "(nenhum excerto relevante encontrado nos apontamentos)"}
HISTÓRICO RECENTE:
${ultimasMensagens || "(início da conversa)"}
PERGUNTA:
${pergunta}`;

// Os apontamentos estão em português: as palavras-chave para a pesquisa são sempre em português,
// mesmo que a pergunta seja feita em espanhol.
export const keywordsPrompt = (pergunta: string) =>
  `Extrai entre 3 e 6 palavras-chave EM PORTUGUÊS DE PORTUGAL (termos técnicos, sem artigos) desta pergunta,
para pesquisar em apontamentos escritos em português. Se a pergunta estiver noutra língua, traduz os termos.
Devolve APENAS JSON: {"keywords":["",""]}
PERGUNTA:
${pergunta}`;

export const classifyPrompt = (titulo: string, texto: string, disciplinas: string) =>
  `Uma estudante carregou um ficheiro. Escolhe a unidade curricular mais provável da lista.
Devolve APENAS JSON: {"subject_id":"<id da lista ou null>","reason":""}
UNIDADES CURRICULARES (id: nome, ano):
${disciplinas}
TÍTULO DO FICHEIRO: ${titulo}
INÍCIO DO TEXTO:
${texto}`;

export const quizExplainPrompt = (
  lang: Lang,
  pergunta: string,
  opcoes: string[],
  certa: number,
  escolhida: number,
  contexto: string,
) =>
  lang === "es"
    ? `Una estudiante ha respondido a esta pregunta de test.
PREGUNTA: ${pergunta}
OPCIONES:
${opcoes.map((o, i) => `${letter(i)}) ${o}`).join("\n")}
RESPUESTA CORRECTA: ${letter(certa)}
SU RESPUESTA: ${letter(escolhida)}
Explica de forma breve y didáctica por qué la respuesta correcta es la correcta${certa === escolhida ? "" : " y dónde está el error en el razonamiento de su respuesta"}.
Usa los apuntes si ayudan.
APUNTES:
${contexto || "(sin fragmentos)"}`
    : `Uma estudante respondeu a esta pergunta de teste.
PERGUNTA: ${pergunta}
OPÇÕES:
${opcoes.map((o, i) => `${letter(i)}) ${o}`).join("\n")}
RESPOSTA CERTA: ${letter(certa)}
RESPOSTA DELA: ${letter(escolhida)}
Explica de forma curta e didática porque a resposta certa é a certa${certa === escolhida ? "" : " e onde está o erro no raciocínio da resposta dela"}.
Usa os apontamentos se ajudarem.
APONTAMENTOS:
${contexto || "(sem excertos)"}`;
