/**
 * Hace una pregunta al chat desde la terminal, con el mismo motor que la web,
 * y muestra qué niveles se han usado, la respuesta y las fuentes.
 *
 * Uso (dentro de backend/, con el .env relleno):
 *   npm run probar -- "¿Qué es la unidad Hounsfield?"
 *   npm run probar -- --lang pt "O que é a unidade Hounsfield?"
 */
import { answerQuestion } from "../chatEngine";
import { allowedUserId } from "./user";

async function main() {
  const args = process.argv.slice(2);
  const langIndex = args.indexOf("--lang");
  const lang = langIndex >= 0 && args[langIndex + 1] === "pt" ? "pt" : "es";
  const question = args.filter((_, i) => i !== langIndex && i !== langIndex + 1).join(" ").trim();
  if (!question) {
    console.error('Uso: npm run probar -- "tu pregunta"');
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
      console.log("Niveles:");
      console.log(`  1. Apuntes con relevancia suficiente:      ${tiers.notes ? "sí" : "no"}`);
      console.log(`  2. Biblioteca de referencia suficiente:   ${tiers.reference ? "sí" : "no"}`);
      console.log(`  3. Consulta web permitida:               ${tiers.web ? "sí" : "no"}`);
      console.log(`  Fragmentos locales enviados a la IA: ${sources.length}\n`);
      console.log("──────── Respuesta ────────");
    },
    onText: (t) => process.stdout.write(t),
    onWebTool: (tool) => process.stdout.write(`\n[consultando la web: ${tool}]\n`),
  });
  console.log("\n──────── Fuentes ────────");
  for (const s of result.sources) {
    if (s.kind === "search_suggestions") continue;
    if ("site" in s) console.log(`  🌐 ${s.site} – ${s.title}  (${s.url})`);
    else console.log(`  📄 [${s.n}] ${s.kind === "referencia" ? `Referencia ${s.org}` : "Apuntes"} – ${s.document_title}`);
  }
  console.log(`\nModelo que ha respondido: ${result.model}`);
  console.log(`Búsquedas web realizadas: ${result.webSearches}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
