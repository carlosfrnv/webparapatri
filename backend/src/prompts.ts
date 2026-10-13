// Prompts em português europeu. {texto} é substituído pelo conteúdo dos apontamentos.

export const summaryPrompt = (texto: string) => `A partir do texto abaixo, escreve um resumo estruturado em Markdown:
- Título do tema
- Ideia principal (2-3 frases)
- Secções com os pontos essenciais
- "O que não podes esquecer para o exame" (5-8 pontos)
Mantém a terminologia técnica e explica-a quando aparece pela primeira vez.
TEXTO:
${texto}`;

export const partialSummaryPrompt = (texto: string, parte: number, total: number) =>
  `Este é o excerto ${parte} de ${total} de uns apontamentos longos.
Resume-o em Markdown, com todos os pontos essenciais, definições e valores que aparecem
(copiados tal como estão, sem inventar nada). Este resumo vai ser juntado aos das outras partes.
TEXTO:
${texto}`;

export const conceptsPrompt = (texto: string) => `Devolve APENAS JSON válido, sem texto adicional:
{"key_concepts":[{"concept":"","explanation":"","why_it_matters":""}],
 "glossary":[{"term":"","definition":""}]}
Entre 8 e 20 conceitos. Glossário com todos os termos técnicos relevantes.
TEXTO:
${texto}`;

export const flashcardsPrompt = (texto: string) => `Devolve APENAS JSON: {"flashcards":[{"front":"","back":""}]}
Entre 15 e 30 cartões. Uma ideia por cartão. Perguntas concretas
(definições, princípios físicos, indicações, contraindicações,
posicionamentos, proteção radiológica). Respostas curtas.
TEXTO:
${texto}`;

export const quizPrompt = (texto: string) => `Devolve APENAS JSON:
{"quiz":[{"question":"","options":["","","",""],"correct_index":0,"explanation":""}]}
10 perguntas de escolha múltipla, dificuldade de exame, uma só resposta certa,
distratores plausíveis. A explicação indica porque a certa é certa e as outras não.
TEXTO:
${texto}`;

export const chatPrompt = (excertos: string, ultimasMensagens: string, pergunta: string) =>
  `Responde à dúvida usando os excertos dos apontamentos abaixo.
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

export const keywordsPrompt = (pergunta: string) =>
  `Extrai entre 3 e 5 palavras-chave em português (termos técnicos, sem artigos) desta pergunta,
para pesquisar nos apontamentos. Devolve APENAS JSON: {"keywords":["",""]}
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

export const quizExplainPrompt = (pergunta: string, opcoes: string[], certa: number, escolhida: number, contexto: string) =>
  `Uma estudante respondeu a esta pergunta de teste.
PERGUNTA: ${pergunta}
OPÇÕES:
${opcoes.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("\n")}
RESPOSTA CERTA: ${String.fromCharCode(65 + certa)}
RESPOSTA DELA: ${String.fromCharCode(65 + escolhida)}
Explica de forma curta e didática porque a resposta certa é a certa${certa === escolhida ? "" : " e onde está o erro no raciocínio da resposta dela"}.
Usa os apontamentos se ajudarem.
APONTAMENTOS:
${contexto || "(sem excertos)"}`;
