import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import Groq from "groq-sdk";
import { config } from "./config";
import { ExtractionError, type ExtractedPage } from "./extract";
import { PROCESSING_ERRORS } from "./i18n";

/**
 * Clases grabadas: el audio se comprime (voz, mono, 32 kbps: ~14 MB por hora) para guardarlo
 * y se transcribe gratis con Whisper en Groq, en trozos de 20 minutos (límite de tamaño de Groq).
 * La transcripción se trata después como cualquier apunte: resumen, flashcards, test, chat…
 */

const run = promisify(execFile);
const SEGMENT_SECONDS = 20 * 60;
const MODEL = "whisper-large-v3-turbo";

export const AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "oga",
  "opus",
  "webm",
  "mp4",
  "flac",
  "amr",
  "3gp",
  "caf",
];

export function isAudio(mime: string, filename: string) {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return mime.startsWith("audio/") || AUDIO_EXTENSIONS.includes(ext);
}

function ffmpeg(args: string[]) {
  if (!ffmpegPath) throw new Error("ffmpeg no disponible");
  return run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 10 * 1024 * 1024 });
}

/** Convierte cualquier audio (archivo en disco) a M4A de voz, que se reproduce en el iPad y pesa poco. */
export async function compressAudio(inputPath: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "audio-"));
  try {
    const out = join(dir, "clase.m4a");
    await ffmpeg(["-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "32k", out]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Transcribe el audio (M4A) por trozos. Cada trozo es una "página" (parte 1, 2…) para poder citarlo. */
export async function transcribeAudio(m4a: Buffer): Promise<ExtractedPage[]> {
  if (!config.GROQ_API_KEY) throw new ExtractionError(PROCESSING_ERRORS.audioUnavailable);
  const groq = new Groq({ apiKey: config.GROQ_API_KEY });
  const dir = await mkdtemp(join(tmpdir(), "transcribe-"));
  try {
    const input = join(dir, "clase.m4a");
    await writeFile(input, m4a);
    await ffmpeg([
      "-i",
      input,
      "-f",
      "segment",
      "-segment_time",
      String(SEGMENT_SECONDS),
      "-c",
      "copy",
      join(dir, "parte-%03d.m4a"),
    ]);
    const parts = (await readdir(dir)).filter((f) => f.startsWith("parte-")).sort();
    const pages: ExtractedPage[] = [];
    let previous = "";
    for (const [i, part] of parts.entries()) {
      try {
        const result = await groq.audio.transcriptions.create({
          file: createReadStream(join(dir, part)),
          model: MODEL,
          language: "pt",
          // El final del trozo anterior ayuda a que el siguiente empiece bien (nombres, términos).
          prompt: previous.slice(-200) || "Aula de Imagem Médica e Radioterapia.",
          response_format: "json",
        });
        const text = (result as { text?: string }).text?.trim() ?? "";
        previous = text;
        if (text) pages.push({ page: i + 1, text });
      } catch (err) {
        const status = (err as { status?: number }).status;
        console.error(`Error al transcribir la parte ${i + 1}:`, status, (err as Error).message);
        // Límite gratuito de Groq (segundos de audio por hora o por día).
        if (status === 429) throw new ExtractionError(PROCESSING_ERRORS.audioLimit);
        throw err;
      }
    }
    if (pages.length === 0) throw new ExtractionError(PROCESSING_ERRORS.noText);
    return pages;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
