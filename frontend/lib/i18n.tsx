"use client";

import { useSyncExternalStore } from "react";

export type Lang = "es" | "pt";
export const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: "es", label: "Español", flag: "🇪🇸" },
  { id: "pt", label: "Português", flag: "🇵🇹" },
];

const STORAGE_KEY = "lang";
const DEFAULT_LANG: Lang = "es";

// ---------- Estado global do idioma (guardado no navegador) ----------

const listeners = new Set<() => void>();

export function getLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    return localStorage.getItem(STORAGE_KEY) === "pt" ? "pt" : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* sem armazenamento: só muda nesta sessão */
  }
  document.documentElement.lang = lang === "pt" ? "pt-PT" : "es";
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Idioma atual. No servidor é sempre o espanhol (o idioma por defeito). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => DEFAULT_LANG);
}

/** Textos da interface no idioma atual. */
export function useT() {
  return dictionaries[useLang()];
}

export function dateLocale(lang: Lang) {
  return lang === "pt" ? "pt-PT" : "es-ES";
}

// ---------- Textos ----------

const es = {
  appName: "Estudio IMR",
  common: {
    loading: "Cargando…",
    retry: "Reintentar",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "Guardando…",
    create: "Crear",
    edit: "Editar",
    delete: "Eliminar",
    close: "Cerrar",
    back: "Volver",
    genericError: "Ha ocurrido un error. Inténtalo de nuevo.",
    networkError: "No se ha podido conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.",
    uploadNetworkError: "Se ha cortado la conexión durante la subida. Inténtalo de nuevo.",
    uploadError: "No se ha podido subir este archivo. Inténtalo de nuevo.",
  },
  nav: {
    home: "Inicio",
    library: "Biblioteca",
    study: "Estudiar",
    chat: "Chat",
    logout: "Salir",
    darkMode: "Modo oscuro",
    lightMode: "Modo claro",
    toDark: "Cambiar a modo oscuro",
    toLight: "Cambiar a modo claro",
    language: "Idioma",
    mainNav: "Navegación principal",
    waking: "Despertando el servidor… (puede tardar hasta un minuto)",
  },
  auth: {
    missingConfigTitle: "Falta configurar Supabase",
    missingConfigText:
      "Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en el archivo .env.local (o en las variables de Vercel).",
    subtitle: (name: string) => `Tu espacio de estudio, ${name}`,
    email: "Email",
    emailPlaceholder: "tu@email.com",
    send: "Recibir enlace de acceso",
    sending: "Enviando…",
    noPassword: "Sin contraseña: solo tienes que pulsar el enlace que vas a recibir.",
    checkEmail: "Revisa tu email 📬",
    sentTo: "Te hemos enviado un enlace a",
    openOnDevice: "Ábrelo en este dispositivo para entrar.",
    otherEmail: "Usar otro email",
    rateLimited: "Has pedido demasiados enlaces seguidos. Espera un minuto y vuelve a intentarlo.",
    sendFailed: "No se ha podido enviar el enlace. Comprueba que es el email con acceso a la web.",
  },
  home: {
    greetingNight: "Buenas noches",
    greetingMorning: "Buenos días",
    greetingAfternoon: "Buenas tardes",
    loadingProgress: "Cargando tu progreso…",
    start: "Empezar a estudiar",
    dueCards: "Flashcards por repasar",
    reviewNow: "Repasar ahora →",
    allDone: "Todo al día. ¡Muy bien! 🎉",
    noCardsYet: "Abre un archivo para crear flashcards.",
    reviewedToday: "Repasadas hoy",
    studyDays: "Días de estudio (últimos 7)",
    noFilesTitle: "Todavía no tienes archivos.",
    noFilesText: "Arrastra a la Biblioteca los apuntes que te han llegado por email.",
    goLibrary: "Ir a la Biblioteca",
    recentFiles: "Últimos archivos",
    seeAll: "Ver todos",
    recentQuizzes: "Últimos tests",
    noQuizzes: "Todavía no has hecho ningún test. Abre un archivo y prueba la pestaña «Test».",
    askTitle: "¿Tienes una duda?",
    askText: "Pregunta al tutor. Responde basándose en tus apuntes.",
    libraryText: "Tus archivos organizados por curso y asignatura.",
  },
  status: {
    ready: "Listo",
    error: "Error",
    processing: "Procesando…",
  },
  docErrors: {
    "error:scanned_pdf":
      "Este PDF es una imagen escaneada y no tiene texto que se pueda leer. Prueba con otra versión del archivo.",
    "error:no_text": "No se ha encontrado texto en este archivo.",
    "error:unsupported": "Tipo de archivo no admitido.",
    "error:processing": "No se ha podido procesar este archivo. Inténtalo de nuevo.",
  } as Record<string, string>,
  areas: {
    base: "Ciencias básicas",
    radiologia: "Radiología",
    medicina_nuclear: "Medicina Nuclear",
    radioterapia: "Radioterapia",
    transversal: "Transversal",
  },
  library: {
    title: "Biblioteca",
    subtitle: "Tus apuntes, por curso y asignatura.",
    searchPlaceholder: "Buscar en los apuntes (ej.: dosis absorbida)",
    searchLabel: "Buscar en los apuntes",
    search: "🔍 Buscar",
    noResults:
      "No se ha encontrado nada. Prueba con otras palabras (tus apuntes están en portugués) o pregunta en el Chat.",
    page: "pág.",
    upload: "Subir archivos",
    uploadTip:
      "Consejo: si subes dentro de una asignatura, el archivo se queda allí. Desde aquí, la IA sugiere dónde guardarlo.",
    unassigned: "Archivos sin asignatura",
    loadingSubjects: "Cargando las asignaturas…",
    year: "Curso",
    yearN: (n: number) => `${n}.º curso`,
    other: "Otras",
    newSubject: "+ Nueva asignatura",
    noSubjectsYear: "Todavía no hay asignaturas en este curso.",
    files: (n: number) => `${n} ${n === 1 ? "archivo" : "archivos"}`,
  },
  subjectForm: {
    name: "Nombre de la asignatura",
    year: "Curso",
    noYear: "Sin curso",
    area: "Área",
  },
  subject: {
    gone: "Esta asignatura ya no existe.",
    backToLibrary: "Volver a la Biblioteca",
    confirmDelete: (name: string) =>
      `¿Eliminar la asignatura «${name}»? Los archivos no se borran: quedan «sin asignatura».`,
    files: "Archivos",
    empty: "Todavía no tienes archivos en esta asignatura. Arrastra arriba los apuntes que te han llegado por email.",
  },
  upload: {
    label: "Subir archivos",
    title: "Arrastra aquí tus apuntes",
    hint: "o pulsa para elegir · PDF, Word, PowerPoint o texto · hasta 25 MB",
    badType: "Tipo no admitido. Usa PDF, Word (.docx), PowerPoint (.pptx) o texto.",
    tooBig: "Demasiado grande (máximo 25 MB).",
    saving: "Guardando…",
  },
  docList: {
    empty: "Todavía no hay archivos aquí.",
    confirmDelete: (title: string) => `¿Eliminar «${title}»? También se borran sus resúmenes, flashcards y tests.`,
    deleteLabel: (title: string) => `Eliminar ${title}`,
    suggestion: "✨ Parece que es de",
    confirm: "Confirmar",
    subject: "Asignatura:",
    choose: "Elegir…",
    yearShort: (n: number) => `${n}.º`,
  },
  document: {
    tabs: {
      resumo: "Resumen",
      conceitos: "Conceptos",
      glossario: "Glosario",
      flashcards: "Flashcards",
      teste: "Test",
      ficheiro: "Archivo original",
    },
    tabsLabel: "Material de estudio",
    ask: "💬 Preguntar sobre este archivo",
    notReady: "El archivo todavía se está procesando. Vuelve dentro de un rato.",
    preparingTitle: "Preparando tu material de estudio…",
    preparingText:
      "La IA está leyendo los apuntes y creando el resumen, los conceptos, las flashcards y el test. La primera vez puede tardar uno o dos minutos. Después queda guardado.",
    whyItMatters: "Por qué importa:",
    disclaimer: "Generado por la IA a partir de tus apuntes. Confirma siempre valores y protocolos con el profesorado.",
    regenerate: "🔄 Generar de nuevo",
    regenerating: "Generando…",
    confirmRegenerate:
      "¿Generar de nuevo el resumen, las flashcards y el test? El progreso de las flashcards de este archivo vuelve a empezar.",
    otherLang: (lang: string) => `Este material está en ${lang}.`,
    generateIn: (lang: string) => `Generar en ${lang}`,
    langName: { es: "español", pt: "portugués" },
    openingFile: "Abriendo el archivo…",
    openNewWindow: "Abrir en una ventana nueva",
    download: "Descargar el archivo",
    cardsDue: (due: number | string, total: number) => `${due} de ${total} tarjetas por repasar ahora.`,
    reviewCards: "🧠 Repasar tarjetas",
  },
  flashcards: {
    grades: ["No lo sabía", "Difícil", "Bien", "Fácil"],
    key: (n: number) => `tecla ${n}`,
    done: "¡Repaso terminado!",
    doneText: (n: number) => `Has repasado ${n} tarjetas. Las siguientes aparecerán cuando llegue el momento.`,
    continue: "Continuar",
    of: (a: number, b: number) => `${a} de ${b}`,
    new: "nueva",
    question: "Pregunta",
    answer: "Respuesta",
    tapToSee: "Pulsa para ver la respuesta",
    showQuestion: "Mostrar pregunta",
    showAnswer: "Mostrar respuesta",
  },
  quiz: {
    result: (pct: number): string =>
      pct >= 80
        ? "¡Excelente! Estás preparada para el examen."
        : pct >= 50
          ? "¡Buen trabajo! Repasa las que has fallado."
          : "No te desanimes: repasa el resumen y vuelve a intentarlo.",
    restart: "Repetir el test",
    questionOf: (a: number, b: number) => `Pregunta ${a} de ${b}`,
    correctCount: (n: number) => `${n} ${n === 1 ? "acierto" : "aciertos"}`,
    right: "✅ ¡Correcto!",
    wrong: (letter: string) => `❌ La respuesta correcta es la ${letter}.`,
    explaining: "Preparando una explicación…",
    explainMore: "Explícamelo mejor",
    next: "Siguiente pregunta →",
    seeResult: "Ver resultado",
  },
  studyPage: {
    title: "Estudiar",
    subtitle: "Flashcards con repaso espaciado y tests de autoevaluación.",
    exit: "← Salir del repaso",
    reviewTitle: "🧠 Repaso de flashcards",
    noCards: "Todavía no hay flashcards. Abre un archivo en la Biblioteca y se crean automáticamente.",
    nothingDue: "No tienes nada que repasar ahora. ¡Vuelve más tarde! 🎉",
    due: (total: number, shown: number) =>
      `Tienes ${total} ${total === 1 ? "tarjeta" : "tarjetas"} por repasar${total > shown ? ` (empezamos por ${shown})` : ""}.`,
    start: "Empezar repaso",
    quizzesTitle: "📝 Tests",
    quizzesText: "Elige un archivo para hacer el test de 10 preguntas.",
    noReady: "Todavía no tienes archivos listos.",
  },
  sources: {
    notes: "Tus apuntes",
    reference: "Biblioteca de referencia",
    web: "Consulta online",
    general: "Fuera de tus apuntes",
    openOriginal: (site: string) => `Abrir el original en ${site} (nueva pestaña)`,
    consulted: "Fuentes consultadas",
    searching: { web_search: "Buscando en Radiopaedia, IAEA y EFRS…", web_fetch: "Leyendo la fuente…" },
    tierInfoWeb: "No estaba en tus apuntes ni en la biblioteca de referencia: he consultado fuentes online.",
  },
  reference: {
    title: "Biblioteca de referencia",
    subtitle:
      "Publicaciones de la IAEA y la EFRS. No se mezclan con tus apuntes, pero la IA las consulta cuando tus apuntes no bastan.",
    cardText: "Documentos de la IAEA y la EFRS que la IA consulta como segunda fuente.",
    upload: "Añadir documento de referencia",
    dropTitle: (org: string) => `Arrastra aquí un documento de la ${org}`,
    org: "Organización",
    empty: "Todavía no hay documentos de referencia.",
    onlySearch:
      "Este documento es de la biblioteca de referencia: solo se usa para buscar, por eso no tiene resumen ni test.",
    badge: (org: string) => `Referencia ${org}`,
  },
  chat: {
    title: "Chat",
    suggestions: [
      "Explícame la diferencia entre dosis absorbida y dosis equivalente",
      "¿Cuáles son las contraindicaciones de la resonancia magnética?",
      "Hazme 3 preguntas sobre protección radiológica",
    ],
    newConversation: "+ Nueva conversación",
    newConversationLabel: "Nueva conversación",
    conversations: "🕘 Conversaciones",
    noConversations: "Todavía no hay conversaciones.",
    deleteConversation: "Eliminar conversación",
    confirmDelete: "¿Eliminar esta conversación?",
    onlyWith: "Respondiendo solo con:",
    useAll: "Usar todos",
    emptyTitle: "¿En qué te puedo ayudar?",
    emptyText: "Respondo basándome en tus apuntes y te digo de dónde sale cada dato.",
    typing: "Escribiendo",
    placeholder: "Escribe tu duda…",
    inputLabel: "Tu pregunta",
    send: "Enviar",
    pageShort: "p.",
    failed: "No se ha podido responder ahora. Inténtalo de nuevo.",
  },
};

export type Dictionary = typeof es;

const pt: Dictionary = {
  appName: "Estudo IMR",
  common: {
    loading: "A carregar…",
    retry: "Tentar novamente",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "A guardar…",
    create: "Criar",
    edit: "Editar",
    delete: "Apagar",
    close: "Fechar",
    back: "Voltar",
    genericError: "Ocorreu um erro. Tenta novamente.",
    networkError: "Não foi possível ligar ao servidor. Verifica a internet e tenta novamente.",
    uploadNetworkError: "Falhou a ligação durante o envio. Tenta novamente.",
    uploadError: "Não foi possível carregar este ficheiro. Tenta novamente.",
  },
  nav: {
    home: "Início",
    library: "Biblioteca",
    study: "Estudar",
    chat: "Chat",
    logout: "Sair",
    darkMode: "Modo escuro",
    lightMode: "Modo claro",
    toDark: "Mudar para modo escuro",
    toLight: "Mudar para modo claro",
    language: "Idioma",
    mainNav: "Navegação principal",
    waking: "A acordar o servidor… (pode demorar até um minuto)",
  },
  auth: {
    missingConfigTitle: "Falta configurar o Supabase",
    missingConfigText:
      "Define NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no ficheiro .env.local (ou nas variáveis da Vercel).",
    subtitle: (name: string) => `O teu espaço de estudo, ${name}`,
    email: "Email",
    emailPlaceholder: "o.teu@email.com",
    send: "Receber link de entrada",
    sending: "A enviar…",
    noPassword: "Sem palavra-passe: basta clicares no link que vais receber.",
    checkEmail: "Verifica o teu email 📬",
    sentTo: "Enviámos um link para",
    openOnDevice: "Abre-o neste dispositivo para entrares.",
    otherEmail: "Usar outro email",
    rateLimited: "Pediste muitos links seguidos. Espera um minuto e tenta outra vez.",
    sendFailed: "Não foi possível enviar o link. Confirma que este é o email com acesso à web.",
  },
  home: {
    greetingNight: "Boa noite",
    greetingMorning: "Bom dia",
    greetingAfternoon: "Boa tarde",
    loadingProgress: "A carregar o teu progresso…",
    start: "Começar a estudar",
    dueCards: "Flashcards para rever",
    reviewNow: "Rever agora →",
    allDone: "Está tudo em dia. Muito bem! 🎉",
    noCardsYet: "Abre um ficheiro para criar flashcards.",
    reviewedToday: "Revistos hoje",
    studyDays: "Dias de estudo (últimos 7)",
    noFilesTitle: "Ainda não tens ficheiros.",
    noFilesText: "Arrasta para a Biblioteca os apontamentos que recebeste por email.",
    goLibrary: "Ir para a Biblioteca",
    recentFiles: "Últimos ficheiros",
    seeAll: "Ver todos",
    recentQuizzes: "Últimos testes",
    noQuizzes: "Ainda não fizeste nenhum teste. Abre um ficheiro e experimenta o separador “Teste”.",
    askTitle: "Tens uma dúvida?",
    askText: "Pergunta ao tutor. Responde com base nos teus apontamentos.",
    libraryText: "Os teus ficheiros organizados por ano e disciplina.",
  },
  status: {
    ready: "Pronto",
    error: "Erro",
    processing: "A processar…",
  },
  docErrors: {
    "error:scanned_pdf":
      "Este PDF é uma imagem digitalizada e não tem texto que se possa ler. Experimenta outra versão do ficheiro.",
    "error:no_text": "Não foi encontrado texto neste ficheiro.",
    "error:unsupported": "Tipo de ficheiro não suportado.",
    "error:processing": "Não foi possível processar este ficheiro. Tenta novamente.",
  },
  areas: {
    base: "Ciências básicas",
    radiologia: "Radiologia",
    medicina_nuclear: "Medicina Nuclear",
    radioterapia: "Radioterapia",
    transversal: "Transversal",
  },
  library: {
    title: "Biblioteca",
    subtitle: "Os teus apontamentos, por ano e disciplina.",
    searchPlaceholder: "Procurar nos apontamentos (ex.: dose absorvida)",
    searchLabel: "Procurar nos apontamentos",
    search: "🔍 Procurar",
    noResults: "Nada encontrado. Experimenta outras palavras, ou pergunta no Chat.",
    page: "pág.",
    upload: "Carregar ficheiros",
    uploadTip:
      "Dica: se carregares dentro de uma disciplina, o ficheiro fica logo lá. Daqui, a IA sugere onde o guardar.",
    unassigned: "Ficheiros sem disciplina",
    loadingSubjects: "A carregar as disciplinas…",
    year: "Ano",
    yearN: (n: number) => `${n}.º ano`,
    other: "Outras",
    newSubject: "+ Nova disciplina",
    noSubjectsYear: "Ainda não há disciplinas neste ano.",
    files: (n: number) => `${n} ${n === 1 ? "ficheiro" : "ficheiros"}`,
  },
  subjectForm: {
    name: "Nome da disciplina",
    year: "Ano",
    noYear: "Sem ano",
    area: "Área",
  },
  subject: {
    gone: "Esta disciplina já não existe.",
    backToLibrary: "Voltar à Biblioteca",
    confirmDelete: (name: string) =>
      `Apagar a disciplina "${name}"? Os ficheiros não são apagados: ficam “sem disciplina”.`,
    files: "Ficheiros",
    empty: "Ainda não tens ficheiros nesta disciplina. Arrasta para cima os apontamentos que recebeste por email.",
  },
  upload: {
    label: "Carregar ficheiros",
    title: "Arrasta para aqui os teus apontamentos",
    hint: "ou toca para escolher · PDF, Word, PowerPoint ou texto · até 25 MB",
    badType: "Tipo não suportado. Usa PDF, Word (.docx), PowerPoint (.pptx) ou texto.",
    tooBig: "Demasiado grande (máximo 25 MB).",
    saving: "A guardar…",
  },
  docList: {
    empty: "Ainda não há ficheiros aqui.",
    confirmDelete: (title: string) =>
      `Apagar "${title}"? Os resumos, flashcards e testes deste ficheiro também são apagados.`,
    deleteLabel: (title: string) => `Apagar ${title}`,
    suggestion: "✨ Parece ser de",
    confirm: "Confirmar",
    subject: "Disciplina:",
    choose: "Escolher…",
    yearShort: (n: number) => `${n}.º`,
  },
  document: {
    tabs: {
      resumo: "Resumo",
      conceitos: "Conceitos",
      glossario: "Glossário",
      flashcards: "Flashcards",
      teste: "Teste",
      ficheiro: "Ficheiro original",
    },
    tabsLabel: "Materiais de estudo",
    ask: "💬 Perguntar sobre este ficheiro",
    notReady: "O ficheiro ainda está a ser processado. Volta daqui a pouco.",
    preparingTitle: "A preparar o teu material de estudo…",
    preparingText:
      "A IA está a ler os apontamentos e a criar o resumo, os conceitos, as flashcards e o teste. Na primeira vez pode demorar um ou dois minutos. Depois fica guardado.",
    whyItMatters: "Porque importa:",
    disclaimer:
      "Gerado pela IA a partir dos teus apontamentos. Confirma sempre valores e protocolos com os professores.",
    regenerate: "🔄 Gerar de novo",
    regenerating: "A gerar…",
    confirmRegenerate:
      "Gerar de novo o resumo, as flashcards e o teste? O progresso das flashcards deste ficheiro recomeça.",
    otherLang: (lang: string) => `Este material está em ${lang}.`,
    generateIn: (lang: string) => `Gerar em ${lang}`,
    langName: { es: "espanhol", pt: "português" },
    openingFile: "A abrir o ficheiro…",
    openNewWindow: "Abrir numa nova janela",
    download: "Descarregar o ficheiro",
    cardsDue: (due: number | string, total: number) => `${due} de ${total} cartões para rever agora.`,
    reviewCards: "🧠 Rever cartões",
  },
  flashcards: {
    grades: ["Não sabia", "Difícil", "Bem", "Fácil"],
    key: (n: number) => `tecla ${n}`,
    done: "Revisão concluída!",
    doneText: (n: number) => `Reviste ${n} cartões. Os próximos aparecem quando chegar a altura certa.`,
    continue: "Continuar",
    of: (a: number, b: number) => `${a} de ${b}`,
    new: "novo",
    question: "Pergunta",
    answer: "Resposta",
    tapToSee: "Toca para ver a resposta",
    showQuestion: "Mostrar pergunta",
    showAnswer: "Mostrar resposta",
  },
  quiz: {
    result: (pct: number) =>
      pct >= 80
        ? "Excelente! Estás pronta para o exame."
        : pct >= 50
          ? "Bom trabalho! Revê as que falhaste."
          : "Não desanimes: revê o resumo e tenta outra vez.",
    restart: "Repetir o teste",
    questionOf: (a: number, b: number) => `Pergunta ${a} de ${b}`,
    correctCount: (n: number) => `${n} ${n === 1 ? "certa" : "certas"}`,
    right: "✅ Certo!",
    wrong: (letter: string) => `❌ A resposta certa é a ${letter}.`,
    explaining: "A preparar uma explicação…",
    explainMore: "Explica-me melhor",
    next: "Próxima pergunta →",
    seeResult: "Ver resultado",
  },
  studyPage: {
    title: "Estudar",
    subtitle: "Flashcards com repetição espaçada e testes de autoavaliação.",
    exit: "← Sair da revisão",
    reviewTitle: "🧠 Revisão de flashcards",
    noCards: "Ainda não há flashcards. Abre um ficheiro na Biblioteca e elas são criadas automaticamente.",
    nothingDue: "Não tens nada para rever agora. Volta mais tarde! 🎉",
    due: (total: number, shown: number) =>
      `Tens ${total} ${total === 1 ? "cartão" : "cartões"} para rever${total > shown ? ` (começamos por ${shown})` : ""}.`,
    start: "Começar revisão",
    quizzesTitle: "📝 Testes",
    quizzesText: "Escolhe um ficheiro para fazeres o teste de 10 perguntas.",
    noReady: "Ainda não tens ficheiros prontos.",
  },
  sources: {
    notes: "Os teus apontamentos",
    reference: "Biblioteca de referência",
    web: "Consulta online",
    general: "Fora dos teus apontamentos",
    openOriginal: (site: string) => `Abrir o original em ${site} (novo separador)`,
    consulted: "Fontes consultadas",
    searching: { web_search: "A pesquisar na Radiopaedia, IAEA e EFRS…", web_fetch: "A ler a fonte…" },
    tierInfoWeb: "Não estava nos teus apontamentos nem na biblioteca de referência: consultei fontes online.",
  },
  reference: {
    title: "Biblioteca de referência",
    subtitle:
      "Publicações da IAEA e da EFRS. Não se misturam com os teus apontamentos, mas a IA consulta-as quando os apontamentos não chegam.",
    cardText: "Documentos da IAEA e da EFRS que a IA consulta como segunda fonte.",
    upload: "Adicionar documento de referência",
    dropTitle: (org: string) => `Arrasta para aqui um documento da ${org}`,
    org: "Organização",
    empty: "Ainda não há documentos de referência.",
    onlySearch:
      "Este documento é da biblioteca de referência: só serve para pesquisa, por isso não tem resumo nem teste.",
    badge: (org: string) => `Referência ${org}`,
  },
  chat: {
    title: "Chat",
    suggestions: [
      "Explica-me a diferença entre dose absorvida e dose equivalente",
      "Quais são as contraindicações da ressonância magnética?",
      "Faz-me 3 perguntas sobre proteção radiológica",
    ],
    newConversation: "+ Nova conversa",
    newConversationLabel: "Nova conversa",
    conversations: "🕘 Conversas",
    noConversations: "Ainda não há conversas.",
    deleteConversation: "Apagar conversa",
    confirmDelete: "Apagar esta conversa?",
    onlyWith: "A responder só com:",
    useAll: "Usar todos",
    emptyTitle: "Em que te posso ajudar?",
    emptyText: "Respondo com base nos teus apontamentos e digo-te de onde vem cada informação.",
    typing: "A escrever",
    placeholder: "Escreve a tua dúvida…",
    inputLabel: "A tua pergunta",
    send: "Enviar",
    pageShort: "p.",
    failed: "Não foi possível responder agora. Tenta novamente.",
  },
};

const dictionaries: Record<Lang, Dictionary> = { es, pt };

/** Para código fora de componentes (ex.: mensagens de erro do cliente da API). */
export function dict(): Dictionary {
  return dictionaries[getLang()];
}
