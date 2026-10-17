import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { AiError } from "./ai";
import { langOf, t, type MessageKey } from "./i18n";

export class HttpError extends Error {
  constructor(
    public status: number,
    public key: MessageKey,
  ) {
    super(key);
  }
}

export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const lang = langOf(req);
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: t(lang, err.key) });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: t(lang, "invalidData"), details: err.issues });
    return;
  }
  if (err instanceof AiError) {
    res.status(502).json({ error: t(lang, err.key) });
    return;
  }
  const code = (err as { code?: string })?.code;
  if (code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: t(lang, "fileTooLarge") });
    return;
  }
  console.error(err);
  // Los errores de la base de datos llevan un código y un mensaje: se muestran para poder diagnosticarlos.
  // (Solo los ven usuarios que ya han entrado en la web.)
  const detail = code && (err as { message?: string })?.message;
  res.status(500).json({ error: detail ? `${t(lang, "unexpected")} [${code}: ${detail}]` : t(lang, "unexpected") });
}
