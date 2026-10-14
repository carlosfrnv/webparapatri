// ✏️ Carlos: cambia estos textos como quieras. Aparecen en la página de inicio.
// Hay una versión en español y otra en portugués (se muestra la del idioma elegido).
// Deja una línea en blanco dentro del mensaje para empezar un párrafo nuevo.

import { useLang } from "@/lib/i18n";

export const dedicatoria = {
  es: {
    // Nombre del saludo ("¡Buenos días, Patri!")
    nombre: "Patri",
    // Mensaje de bienvenida: aparece la primera vez que entra.
    titulo: "Una sorpresa para ti 💙",
    mensaje: `Te he hecho este rincón para que estudies con más calma. Aquí puedes guardar todos los apuntes que te mandan por email, y la IA te ayuda con resúmenes, flashcards, tests y dudas.

Estoy muy orgulloso de ti. ¡Vas a ser una técnica increíble!`,
    firma: "— Carlos",
    // Frase corta que aparece siempre debajo del saludo.
    frase: "Paso a paso. Hoy también cuenta. 💪",
    // Respuesta del chat cuando pregunta algo que no tiene que ver con sus estudios.
    fueraDeTema:
      "Tu novio me ha configurado únicamente para que hablemos de tus estudios. Dice que te centres en estudiar y que te ama mucho 🖤. Eso pregúntaselo a ChatGPT 😉",
  },
  pt: {
    nombre: "Patri",
    titulo: "Uma surpresa para ti 💙",
    mensaje: `Fiz-te este cantinho para estudares com mais calma. Aqui podes guardar todos os apontamentos que te enviam por email, e a IA ajuda-te com resumos, flashcards, testes e dúvidas.

Tenho muito orgulho em ti. Vais ser uma técnica incrível!`,
    firma: "— Carlos",
    frase: "Um passo de cada vez. Hoje também conta. 💪",
    fueraDeTema:
      "O teu namorado configurou-me só para falarmos dos teus estudos. Diz que te concentres a estudar e que te ama muito 🖤. Isso pergunta ao ChatGPT 😉",
  },
};

export function useDedicatoria() {
  return dedicatoria[useLang()];
}
