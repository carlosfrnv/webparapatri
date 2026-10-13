// ✏️ Carlos: cambia estos textos como quieras. Aparecen en la página de inicio.
// Hay una versión en español y otra en portugués (se muestra la del idioma elegido).
// Deja una línea en blanco dentro del mensaje para empezar un párrafo nuevo.

import { useLang } from "@/lib/i18n";

export const dedicatoria = {
  es: {
    // Nombre del saludo ("¡Buenos días, Patri!")
    nome: "Patri",
    // Mensaje de bienvenida: aparece la primera vez que entra.
    titulo: "Una sorpresa para ti 💙",
    mensagem: `Te he hecho este rincón para que estudies con más calma. Aquí puedes guardar todos los apuntes que te mandan por email, y la IA te ayuda con resúmenes, flashcards, tests y dudas.

Estoy muy orgulloso de ti. ¡Vas a ser una técnica increíble!`,
    assinatura: "— Carlos",
    // Frase corta que aparece siempre debajo del saludo.
    frase: "Paso a paso. Hoy también cuenta. 💪",
  },
  pt: {
    nome: "Patri",
    titulo: "Uma surpresa para ti 💙",
    mensagem: `Fiz-te este cantinho para estudares com mais calma. Aqui podes guardar todos os apontamentos que te enviam por email, e a IA ajuda-te com resumos, flashcards, testes e dúvidas.

Tenho muito orgulho em ti. Vais ser uma técnica incrível!`,
    assinatura: "— Carlos",
    frase: "Um passo de cada vez. Hoje também conta. 💪",
  },
};

export function useDedicatoria() {
  return dedicatoria[useLang()];
}
