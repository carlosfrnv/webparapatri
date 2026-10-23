import type { Request } from "express";

export type Lang = "es" | "pt";

/** Idioma pedido por el frontend (cabecera X-Lang). Por defecto, español. */
export function langOf(req: Request): Lang {
  return req.header("x-lang")?.toLowerCase().startsWith("pt") ? "pt" : "es";
}

// Palabras y grafías que solo (o casi solo) se usan en uno de los dos idiomas.
const ES_HINTS =
  /ñ|¿|¡|\b(el|los|las|del|y|pero|muy|tengo|estoy|hacer|puedes|necesito|quiero|cómo|qué|también|ayúdame|ayuda|buscar|dónde|información|gracias|hola|efecto|es)\b|ción\b/gi;
const PT_HINTS =
  /[ãõç]|\b(não|você|eu|os|as|do|da|dos|das|e|mas|muito|tenho|estou|fazer|podes|preciso|quero|como|também|ajuda-me|ajudas|procurar|pesquisar|onde|informação|obrigad[ao]|olá|efeito|o que)\b|ção\b|ções\b|(^|\s)é(\s|$)/gi;

/** Idioma en el que está escrito un texto (null si no está claro): la IA contesta en el idioma en que le escriben. */
export function detectLang(text: string): Lang | null {
  const es = text.match(ES_HINTS)?.length ?? 0;
  const pt = text.match(PT_HINTS)?.length ?? 0;
  if (es >= pt + 2 || (es > 0 && pt === 0)) return "es";
  if (pt >= es + 2 || (pt > 0 && es === 0)) return "pt";
  return null;
}

const messages = {
  missingSession: { es: "Falta la sesión. Vuelve a entrar.", pt: "Sessão em falta. Entra novamente." },
  expiredSession: { es: "La sesión ha caducado. Vuelve a entrar.", pt: "Sessão expirada. Entra novamente." },
  forbiddenEmail: { es: "Este email no tiene acceso a esta web.", pt: "Este email não tem acesso a esta web." },
  invalidData: { es: "Datos no válidos.", pt: "Dados inválidos." },
  fileTooLarge: {
    es: "El archivo es demasiado grande (máximo 50 MB).",
    pt: "O ficheiro é demasiado grande (máximo 50 MB).",
  },
  unexpected: {
    es: "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
    pt: "Ocorreu um erro inesperado. Tenta novamente.",
  },
  tooManyAi: {
    es: "Demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.",
    pt: "Muitos pedidos seguidos. Espera um minuto e tenta outra vez.",
  },
  tooMany: { es: "Demasiadas peticiones seguidas. Espera un poco.", pt: "Muitos pedidos seguidos. Espera um pouco." },
  noFile: { es: "No se ha recibido ningún archivo.", pt: "Nenhum ficheiro recebido." },
  unsupportedType: {
    es: "Tipo de archivo no admitido. Usa PDF, Word (.docx), PowerPoint (.pptx) o texto.",
    pt: "Tipo de ficheiro não suportado. Usa PDF, Word (.docx), PowerPoint (.pptx) ou texto.",
  },
  invalidSubject: { es: "Asignatura no válida.", pt: "Disciplina inválida." },
  subjectNotFound: { es: "Asignatura no encontrada.", pt: "Disciplina não encontrada." },
  noMaterial: {
    es: "Esta asignatura aún no tiene temas con resumen. Abre algún archivo para que se prepare y vuelve aquí.",
    pt: "Esta disciplina ainda não tem temas com resumo. Abre algum ficheiro para se preparar e volta aqui.",
  },
  needsUpdate: {
    es: "Falta actualizar la base de datos: ejecuta el último SQL en Supabase.",
    pt: "Falta atualizar a base de dados: executa o último SQL no Supabase.",
  },
  examNotFound: { es: "Examen no encontrado.", pt: "Exame não encontrado." },
  deckNotFound: { es: "Mazo o tarjeta no encontrados.", pt: "Baralho ou cartão não encontrados." },
  assignmentNotFound: { es: "Trabajo no encontrado.", pt: "Trabalho não encontrado." },
  assignmentBusy: {
    es: "La IA ya está trabajando en este trabajo: espera a que termine.",
    pt: "A IA já está a trabalhar neste trabalho: espera que termine.",
  },
  documentNotFound: { es: "Documento no encontrado.", pt: "Documento não encontrado." },
  questionNotFound: { es: "Pregunta no encontrada.", pt: "Pergunta não encontrada." },
  saveFailed: {
    es: "No se ha podido guardar el archivo. Inténtalo de nuevo.",
    pt: "Não foi possível guardar o ficheiro. Tenta novamente.",
  },
  openFailed: { es: "No se ha podido abrir el archivo original.", pt: "Não foi possível abrir o ficheiro original." },
  stillProcessing: { es: "El archivo todavía se está procesando.", pt: "O ficheiro ainda está a ser processado." },
  referenceNoStudy: {
    es: "Los documentos de la biblioteca de referencia solo se usan para buscar; no generan resúmenes ni tests.",
    pt: "Os documentos da biblioteca de referência só servem para pesquisa; não geram resumos nem testes.",
  },
  documentHasError: { es: "Este archivo tiene un error.", pt: "Este ficheiro tem um erro." },
  aiRefused: { es: "La IA no ha podido responder a esta petición.", pt: "A IA não conseguiu responder a este pedido." },
  aiBadFormat: {
    es: "La IA ha devuelto una respuesta con un formato inesperado. Prueba a generarlo de nuevo.",
    pt: "A IA devolveu uma resposta num formato inesperado. Tenta gerar de novo.",
  },
  aiUnavailable: {
    es: "La IA no está disponible ahora mismo. Inténtalo de nuevo dentro de un rato.",
    pt: "A IA não está disponível neste momento. Tenta novamente daqui a pouco.",
  },
  polishUnavailable: {
    es: "La revisión con Haiku no está disponible ahora mismo.",
    pt: "A revisão com o Haiku não está disponível neste momento.",
  },
  polishLimit: {
    es: "Por hoy ya se han hecho bastantes revisiones con Haiku. Mañana podrás seguir.",
    pt: "Por hoje já se fizeram bastantes revisões com o Haiku. Amanhã podes continuar.",
  },
  chatFailed: {
    es: "No se ha podido responder ahora. Inténtalo de nuevo.",
    pt: "Não foi possível responder agora. Tenta novamente.",
  },
} satisfies Record<string, Record<Lang, string>>;

export type MessageKey = keyof typeof messages;

export function t(lang: Lang, key: MessageKey): string {
  return messages[key][lang];
}

/**
 * Errores del procesado en segundo plano: guardamos un código en la base de datos
 * (documents.error_message) y el frontend lo traduce al idioma elegido.
 */
export const PROCESSING_ERRORS = {
  scanned: "error:scanned_pdf",
  noText: "error:no_text",
  unsupported: "error:unsupported",
  generic: "error:processing",
  audioLimit: "error:audio_limit",
  audioUnavailable: "error:audio_unavailable",
} as const;
