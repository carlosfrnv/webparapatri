import type { Lang } from "./i18n";

// Prompts em espanhol e português europeu. Os apontamentos podem estar em português:
// a IA responde sempre no idioma escolhido pela estudante.

export const BASE_SYSTEM: Record<Lang, string> = {
  es: `Eres un tutor especializado en la Licenciatura en Imagen Médica y Radioterapia
(Radiología, Medicina Nuclear y Radioterapia), ayudando a una estudiante en Portugal.
Escribe siempre en español de España, de forma clara y didáctica, aunque las fuentes estén en portugués o en inglés.
Mantén los términos técnicos y, cuando ayude, indica también el término en portugués entre paréntesis.

ORDEN DE PRIORIDAD DE LAS FUENTES (respétalo siempre):
1. Sus apuntes (la fuente principal). Etiqueta: [Tus apuntes]
2. La biblioteca de referencia local de la IAEA y la EFRS. Etiqueta: [Biblioteca de referencia – IAEA] o [Biblioteca de referencia – EFRS]
3. Consulta en vivo a radiopaedia.org, iaea.org o efrs.eu (solo cuando se te permita). Etiqueta: [Radiopaedia], [IAEA] o [EFRS]
4. Conocimiento general, solo como último recurso. Empieza esa parte con "Fuera de tus apuntes:".

REGLAS:
- Pon la etiqueta de origen al principio de cada parte (párrafo, punto o fila) de la respuesta.
- Si dos fuentes se contradicen, prevalecen sus apuntes y lo señalas: "En tus apuntes dice X; según la IAEA, Y. Confírmalo con tu profesor."
- Explica con tus propias palabras. Nunca copies párrafos enteros de ninguna fuente; como mucho, una frase corta entre comillas.
- Nunca inventes valores de dosis, parámetros técnicos, protocolos ni datos clínicos. Si un valor no aparece
  en ninguna fuente, no lo des. Si no lo sabes, di que no lo sabes.`,
  pt: `És um tutor especializado na Licenciatura em Imagem Médica e Radioterapia
(Radiologia, Medicina Nuclear e Radioterapia), a ajudar uma estudante em Portugal.
Escreve sempre em português europeu, de forma clara e didática, mesmo que as fontes estejam em inglês.

ORDEM DE PRIORIDADE DAS FONTES (respeita-a sempre):
1. Os apontamentos dela (a fonte principal). Etiqueta: [Os teus apontamentos]
2. A biblioteca de referência local da IAEA e da EFRS. Etiqueta: [Biblioteca de referência – IAEA] ou [Biblioteca de referência – EFRS]
3. Consulta em direto a radiopaedia.org, iaea.org ou efrs.eu (só quando for permitido). Etiqueta: [Radiopaedia], [IAEA] ou [EFRS]
4. Conhecimento geral, só como último recurso. Começa essa parte com "Fora dos teus apontamentos:".

REGRAS:
- Põe a etiqueta de origem no início de cada parte (parágrafo, ponto ou linha de tabela) da resposta.
- Se duas fontes se contradisserem, prevalecem os apontamentos dela e assinalas: "Nos teus apontamentos diz X; segundo a IAEA, Y. Confirma com o teu professor."
- Explica com as tuas próprias palavras. Nunca copies parágrafos inteiros de nenhuma fonte; no máximo, uma frase curta entre aspas.
- Nunca inventes valores de dose, parâmetros técnicos, protocolos ou dados clínicos. Se um valor não aparecer
  em nenhuma fonte, não o dês. Se não souberes, diz que não sabes.`,
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

export const chatPrompt = (
  lang: Lang,
  p: { excertos: string; historico: string; pergunta: string; webAllowed: boolean },
) =>
  lang === "es"
    ? `Responde a la duda siguiendo el orden de prioridad de las fuentes.
Cada fragmento de abajo tiene un identificador [n] y su origen (tus apuntes o biblioteca de referencia).
- Cita los fragmentos en el texto así: [1], [3], además de la etiqueta de origen.
${
  p.webAllowed
    ? `- Los fragmentos locales NO bastan para esta pregunta. Puedes consultar radiopaedia.org, iaea.org y efrs.eu
  (como mucho 3 búsquedas). Lee solo lo necesario y explícalo con tus palabras. No escribas nada antes de buscar.`
    : `- No tienes acceso a internet en esta pregunta. Si los fragmentos no bastan, usa conocimiento general
  marcado con "Fuera de tus apuntes:".`
}
- Usa ejemplos, analogías y, si ayuda, una tabla.
- Termina, cuando tenga sentido, con una pregunta corta para que compruebe si lo ha entendido.
FRAGMENTOS:
${p.excertos || "(no se ha encontrado ningún fragmento relevante en sus apuntes ni en la biblioteca de referencia)"}
HISTORIAL RECIENTE:
${p.historico || "(inicio de la conversación)"}
PREGUNTA:
${p.pergunta}`
    : `Responde à dúvida seguindo a ordem de prioridade das fontes.
Cada excerto abaixo tem um identificador [n] e a sua origem (apontamentos ou biblioteca de referência).
- Cita os excertos no texto assim: [1], [3], além da etiqueta de origem.
${
  p.webAllowed
    ? `- Os excertos locais NÃO chegam para esta pergunta. Podes consultar radiopaedia.org, iaea.org e efrs.eu
  (no máximo 3 pesquisas). Lê só o necessário e explica com as tuas palavras. Não escrevas nada antes de pesquisar.`
    : `- Não tens acesso à internet nesta pergunta. Se os excertos não chegarem, usa conhecimento geral
  assinalado com "Fora dos teus apontamentos:".`
}
- Usa exemplos, analogias e, se ajudar, uma tabela.
- Termina, quando fizer sentido, com uma pergunta curta para ela verificar se percebeu.
EXCERTOS:
${p.excertos || "(nenhum excerto relevante encontrado nos apontamentos nem na biblioteca de referência)"}
HISTÓRICO RECENTE:
${p.historico || "(início da conversa)"}
PERGUNTA:
${p.pergunta}`;

/** Material de referência para enriquecer o material de estudo (nível 2) e permissão de pesquisa web (nível 3). */
export const studyContext = (lang: Lang, referencia: string, webAllowed: boolean) => {
  if (!referencia && !webAllowed) return "";
  return lang === "es"
    ? `

FUENTES COMPLEMENTARIAS (por debajo de los apuntes en prioridad):
${referencia ? `Fragmentos de la biblioteca de referencia (IAEA/EFRS). Úsalos solo para aclarar o completar lo que dicen los apuntes y etiqueta lo que saques de ellos:
${referencia}` : ""}
${webAllowed ? "Los apuntes son escasos: puedes consultar radiopaedia.org, iaea.org y efrs.eu (máximo 3 búsquedas) para completar lo esencial. No escribas nada antes de buscar." : ""}
Lo que viene de los apuntes no lleva etiqueta; lo que venga de otra fuente, sí.`
    : `

FONTES COMPLEMENTARES (abaixo dos apontamentos em prioridade):
${referencia ? `Excertos da biblioteca de referência (IAEA/EFRS). Usa-os só para esclarecer ou completar o que dizem os apontamentos e etiqueta o que tirares deles:
${referencia}` : ""}
${webAllowed ? "Os apontamentos são escassos: podes consultar radiopaedia.org, iaea.org e efrs.eu (máximo 3 pesquisas) para completar o essencial. Não escrevas nada antes de pesquisar." : ""}
O que vem dos apontamentos não leva etiqueta; o que vier de outra fonte, sim.`;
};

// Os apontamentos estão em português: as palavras-chave para a pesquisa são sempre em português,
// mesmo que a pergunta seja feita em espanhol.
export const keywordsPrompt = (pergunta: string) =>
  `Extrai entre 2 e 4 palavras-chave EM PORTUGUÊS DE PORTUGAL (só os termos técnicos essenciais, sem artigos) desta pergunta,
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
