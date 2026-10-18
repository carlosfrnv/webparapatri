import { all, create } from "mathjs";

/**
 * Calculadora para comprobar las cuentas de los ejercicios: la IA escribe la operación de cada paso y aquí se
 * calcula de verdad. mathjs sin las funciones que permitirían ejecutar cosas (importar, definir unidades…).
 */
const math = create(all);
const evaluate = math.evaluate.bind(math);
const blocked = () => {
  throw new Error("Función no permitida");
};
math.import(
  {
    import: blocked,
    createUnit: blocked,
    evaluate: blocked,
    parse: blocked,
    simplify: blocked,
    derivative: blocked,
    resolve: blocked,
    reviver: blocked,
  },
  { override: true },
);

/** Resultado numérico de una operación ("sqrt(8/3)", "2*ln(2)/5730"…); null si no se puede calcular. */
export function calc(expression: string | undefined | null): number | null {
  if (!expression?.trim() || expression.length > 300) return null;
  const expr = expression
    .replace(/×|·/g, "*")
    .replace(/÷/g, "/")
    .replace(/√/g, "sqrt")
    .replace(/π/g, "pi")
    .replace(/\bln\(/g, "log(")
    .replace(/(\d),(\d)/g, "$1.$2");
  try {
    const value = evaluate(expr) as unknown;
    const n = typeof value === "number" ? value : Number((value as { valueOf(): unknown })?.valueOf?.());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Número para enseñarlo: con coma y sin decimales de más (1,63; 4; 1234,5). */
export function formatNumber(n: number, lang: "es" | "pt") {
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 5;
  return n
    .toLocaleString(lang === "pt" ? "pt-PT" : "es-ES", { maximumFractionDigits: decimals, useGrouping: false })
    .replace(/^-0$/, "0");
}
