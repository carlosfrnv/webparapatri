/**
 * Faz uma pergunta ao chat a partir da linha de comandos, com o mesmo motor que a web,
 * e mostra que níveis foram usados, a resposta e as fontes.
 *
 * Uso (dentro de backend/, com o .env preenchido):
 *   npm run probar -- "O que é a unidade Hounsfield?"
 *   npm run probar -- --lang es "¿Qué es la unidad Hounsfield?"
 */
import { answerQuestion } from "../chatEngine";
import { allowedUserId } from "./user";

async function main() {
  const args = process.argv.slice(2);
  const langIndex = args.indexOf("--lang");
  const lang = langIndex >= 0 && args[langIndex + 1] === "es" ? "es" : "pt";
  const question = args.filter((_, i) => i !== langIndex && i !== langIndex + 1).join(" ").trim();
  if (!question) {
    console.error('Uso: npm run probar -- "a tua pergunta"');
    process.exit(1);
  }

  const userId = await allowedUserId();
  console.log(`\n❓ ${question}\n`);
  const result = await answerQuestion({
    userId,
    lang,
    question,
    history: "",
    onMeta: ({ sources, tiers }) => {
      console.log("Níveis:");
      console.log(`  1. Apontamentos com relevância suficiente: ${tiers.notes ? "sim" : "não"}`);
      console.log(`  2. Biblioteca de referência suficiente:    ${tiers.reference ? "sim" : "não"}`);
      console.log(`  3. Consulta web permitida:                 ${tiers.web ? "sim" : "não"}`);
      console.log(`  Excertos locais enviados à IA: ${sources.length}\n`);
      console.log("──────── Resposta ────────");
    },
    onText: (t) => process.stdout.write(t),
    onWebTool: (tool) => process.stdout.write(`\n[a consultar a web: ${tool}]\n`),
  });
  console.log("\n──────── Fontes ────────");
  for (const s of result.sources) {
    if ("site" in s) console.log(`  🌐 ${s.site} – ${s.title}  (${s.url})`);
    else console.log(`  📄 [${s.n}] ${s.kind === "referencia" ? `Referência ${s.org}` : "Apontamentos"} – ${s.document_title}`);
  }
  console.log(`\nPesquisas web feitas: ${result.webSearches}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
