import type { Request } from "express";

export type Lang = "es" | "pt";

/** Idioma pedido por el frontend (cabecera X-Lang). Por defecto, español. */
export function langOf(req: Request): Lang {
  return req.header("x-lang")?.toLowerCase().startsWith("pt") ? "pt" : "es";
}

const messages = {
  missingSession: { es: "Falta la sesión. Vuelve a entrar.", pt: "Sessão em falta. Entra novamente." },
  expiredSession: { es: "La sesión ha caducado. Vuelve a entrar.", pt: "Sessão expirada. Entra novamente." },
  forbiddenEmail: { es: "Este email no tiene acceso a esta web.", pt: "Este email não tem acesso a esta web." },
  invalidData: { es: "Datos no válidos.", pt: "Dados inválidos." },
  fileTooLarge: { es: "El archivo es demasiado grande (máximo 25 MB).", pt: "O ficheiro é demasiado grande (máximo 25 MB)." },
  unexpected: { es: "Ha ocurrido un error inesperado. Inténtalo de nuevo.", pt: "Ocorreu um erro inesperado. Tenta novamente." },
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
    es: "La IA gratuita ha llegado a su límite por ahora. Inténtalo de nuevo dentro de un rato.",
    pt: "A IA gratuita chegou ao limite por agora. Tenta novamente daqui a pouco.",
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
} as const;
