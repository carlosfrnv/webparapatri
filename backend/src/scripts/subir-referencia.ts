/**
 * Carrega PDFs para a "Biblioteca de referência" (IAEA / EFRS).
 *
 * Uso (dentro de backend/, com o .env preenchido):
 *   npm run referencia -- --org IAEA caminho/para/ficheiro1.pdf caminho/para/ficheiro2.pdf
 *   npm run referencia -- --org EFRS pasta-com-pdfs/
 *
 * Usa o mesmo fluxo de extração e divisão em fragmentos que os apontamentos, mas marca os
 * documentos como source_type = 'referencia': não aparecem na Biblioteca dela, só na pesquisa.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { ingestDocument, type ReferenceOrg } from "../ingest";
import { supabase } from "../supabase";
import { allowedUserId } from "./user";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
};
// Limite do plano gratuito do Supabase Storage por ficheiro.
const MAX_BYTES = 50 * 1024 * 1024;

async function main() {
  const args = process.argv.slice(2);
  const orgIndex = args.indexOf("--org");
  const org = (orgIndex >= 0 ? args[orgIndex + 1] : "").toUpperCase();
  if (org !== "IAEA" && org !== "EFRS") {
    console.error("Indica a organização: --org IAEA ou --org EFRS");
    process.exit(1);
  }
  const paths = args.filter((_, i) => i !== orgIndex && i !== orgIndex + 1);
  const files = paths.flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => MIME[extname(f).toLowerCase()])
          .map((f) => join(p, f))
      : [p],
  );
  if (files.length === 0) {
    console.error("Não indicaste nenhum ficheiro (.pdf, .docx, .pptx ou .txt).");
    process.exit(1);
  }

  const userId = await allowedUserId();
  for (const file of files) {
    const name = basename(file);
    const mime = MIME[extname(file).toLowerCase()];
    if (!mime) {
      console.log(`⏭️  ${name}: tipo não suportado`);
      continue;
    }
    if (statSync(file).size > MAX_BYTES) {
      console.log(`⏭️  ${name}: maior do que 50 MB (limite do Supabase gratuito). Divide o PDF em partes.`);
      continue;
    }
    process.stdout.write(`📄 ${name} (${org})… `);
    const doc = await ingestDocument({
      userId,
      buffer: readFileSync(file),
      originalName: name,
      mimetype: mime,
      subjectId: null,
      sourceType: "referencia",
      referenceOrg: org as ReferenceOrg,
      wait: true,
    });
    const { data } = await supabase.from("documents").select("status, error_message").eq("id", doc.id).single();
    const { count } = await supabase.from("chunks").select("id", { count: "exact", head: true }).eq("document_id", doc.id);
    console.log(data?.status === "ready" ? `✅ ${count} fragmentos` : `❌ ${data?.error_message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
