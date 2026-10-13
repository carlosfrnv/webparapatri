import { z } from "zod";
import { completeJson } from "./ai";
import type { Lang } from "./i18n";
import { keywordsPrompt } from "./prompts";
import { supabase } from "./supabase";

export interface Source {
  n: number;
  chunk_id: number;
  document_id: string;
  document_title: string;
  page: number | null;
  excerpt: string;
  content: string;
}

interface ChunkHit {
  id: number;
  document_id: string;
  content: string;
  page: number | null;
  rank: number;
}

async function runSearch(userId: string, query: string, limit: number, documentId?: string): Promise<ChunkHit[]> {
  const { data, error } = await supabase.rpc("search_chunks", {
    p_user: userId,
    p_query: query,
    p_limit: limit,
    p_document: documentId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ChunkHit[];
}

const keywordsSchema = z.object({ keywords: z.array(z.string()).min(1).max(8) });

/**
 * Procura os fragmentos mais relevantes. Se a pergunta usar palavras diferentes das dos
 * apontamentos (por exemplo, se for feita em espanhol e os apontamentos estiverem em português)
 * e houver poucos resultados, pede à IA palavras-chave em português e tenta com "or".
 */
export async function findSources(
  userId: string,
  question: string,
  opts: { limit?: number; documentId?: string; expand?: boolean; lang?: Lang } = {},
): Promise<Source[]> {
  const limit = opts.limit ?? 8;
  let hits = await runSearch(userId, question, limit, opts.documentId);
  const minHits = opts.lang === "es" ? 3 : 1;

  if (hits.length < minHits && opts.expand !== false) {
    try {
      const { keywords } = await completeJson(keywordsPrompt(question), keywordsSchema, {
        lang: "pt",
        effort: "low",
        maxTokens: 1000,
      });
      const orQuery = keywords
        .map((k) => k.replace(/["()]/g, "").trim())
        .filter(Boolean)
        .join(" or ");
      if (orQuery) {
        const extra = await runSearch(userId, orQuery, limit, opts.documentId);
        const seen = new Set(hits.map((h) => h.id));
        hits = [...hits, ...extra.filter((h) => !seen.has(h.id))].slice(0, limit);
      }
    } catch (err) {
      console.error("Falha na pesquisa por palavras-chave:", err);
    }
  }
  if (hits.length === 0) return [];

  const docIds = [...new Set(hits.map((h) => h.document_id))];
  const { data: docs } = await supabase.from("documents").select("id, title").in("id", docIds).eq("user_id", userId);
  const titles = new Map((docs ?? []).map((d) => [d.id, d.title as string]));

  return hits.map((h, i) => ({
    n: i + 1,
    chunk_id: h.id,
    document_id: h.document_id,
    document_title: titles.get(h.document_id) ?? "Documento",
    page: h.page,
    content: h.content,
    excerpt: h.content.slice(0, 220).replace(/\s+/g, " ") + (h.content.length > 220 ? "…" : ""),
  }));
}

export function formatSources(sources: Source[]): string {
  return sources
    .map((s) => `[${s.n}] ${s.document_title}${s.page ? `, página ${s.page}` : ""}\n${s.content}`)
    .join("\n\n---\n\n");
}
