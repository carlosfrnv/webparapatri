import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { AiError } from "./ai";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Dados inválidos.", details: err.issues });
    return;
  }
  if (err instanceof AiError) {
    res.status(502).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string })?.code;
  if (code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "O ficheiro é demasiado grande (máximo 25 MB)." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Ocorreu um erro inesperado. Tenta novamente." });
}
