// ✏️ Carlos: cambia estos textos como quieras. Aparecen en la página de inicio.
// Hay una versión en español y otra en portugués (se muestra la del idioma elegido).
// Deja una línea en blanco dentro del mensaje para empezar un párrafo nuevo.

import { useLang } from "@/lib/i18n";

export const dedicatoria = {
  es: {
    // Nombre del saludo ("¡Buenos días, Patri!")
    nombre: "Patri",
    // Mensaje de bienvenida: aparece la primera vez que entra.
    titulo: "Una sorpresa para ti 🖤",
    mensaje: `Te he hecho este rincón para que estudies con más calma. Aquí puedes guardar todos los apuntes que te mandan por email, y la IA te ayuda con resúmenes, flashcards, tests y dudas.

Estoy muy orgulloso de ti. ¡Vas a ser una técnica increíble!`,
    firma: "— Carlos",
    // Frase corta que aparece siempre debajo del saludo.
    frase: "Paso a paso. Hoy también cuenta. 💪",
    // Respuestas del chat cuando pregunta algo que no tiene que ver con sus estudios (sale una u otra).
    fueraDeTema: [
      "Tu novio me ha configurado únicamente para que hablemos de tus estudios. Dice que te centres en estudiar y que te ama mucho 🖤. Eso pregúntaselo a ChatGPT 😉",
      "Uy, eso no entra en el temario 😅. Tu novio me ha programado solo para ayudarte a estudiar. Me pide que te diga que te quiere muchísimo 🖤 y que eso se lo preguntes a ChatGPT.",
      "Lo siento, solo hablo de tus estudios: órdenes de tu novio 👮‍♂️. Dice que vuelvas a los apuntes, que eres la mejor y que te ama 🖤. Para lo demás, ChatGPT (o pregúntale a Bob 🧽).",
      "Eso no me lo sé… ni me dejan saberlo 🙊. Tu novio me configuró solo para tus estudios. Dice que te concentres, que te ama mucho 🖤, y que eso lo hables con ChatGPT.",
      "Pregunta fuera de temario detectada 🚨. Tu novio dice que te centres en estudiar, que está muy orgulloso de ti y que te ama 🖤. Esa pregúntasela a ChatGPT 😉",
      "Mi misión es que apruebes, nada más 📚. Eso es cosa de ChatGPT. Por cierto, tu novio me ha pedido que te recuerde que te ama mucho 🖤 y que esta noche abraces fuerte a Bob de su parte 🧽.",
      "Eso no es de estudio, así que no puedo ayudarte 🙈. Si necesitas compañía, Bob está ahí 🧽, y tu novio, aunque esté a 5 horas, te ama muchísimo 🖤. ¡Venga, a los apuntes!",
    ],
  },
  pt: {
    nombre: "Patri",
    titulo: "Uma surpresa para ti 🖤",
    mensaje: `Fiz-te este cantinho para estudares com mais calma. Aqui podes guardar todos os apontamentos que te enviam por email, e a IA ajuda-te com resumos, flashcards, testes e dúvidas.

Tenho muito orgulho em ti. Vais ser uma técnica incrível!`,
    firma: "— Carlos",
    frase: "Um passo de cada vez. Hoje também conta. 💪",
    fueraDeTema: [
      "O teu namorado configurou-me só para falarmos dos teus estudos. Diz que te concentres a estudar e que te ama muito 🖤. Isso pergunta ao ChatGPT 😉",
      "Ui, isso não sai no exame 😅. O teu namorado programou-me só para te ajudar a estudar. Pede-me para te dizer que te ama muitíssimo 🖤 e que isso perguntes ao ChatGPT.",
      "Desculpa, só falo dos teus estudos: ordens do teu namorado 👮‍♂️. Diz que voltes aos apontamentos, que és a melhor e que te ama 🖤. Para o resto, ChatGPT (ou pergunta ao Bob 🧽).",
      "Isso não sei… nem me deixam saber 🙊. O teu namorado configurou-me só para os teus estudos. Diz que te concentres, que te ama muito 🖤, e que isso fales com o ChatGPT.",
      "Pergunta fora da matéria detetada 🚨. O teu namorado diz que te concentres a estudar, que tem muito orgulho em ti e que te ama 🖤. Essa pergunta ao ChatGPT 😉",
      "A minha missão é que passes, mais nada 📚. Isso é com o ChatGPT. Já agora, o teu namorado pediu-me para te lembrar que te ama muito 🖤 e que esta noite abraces com força o Bob da parte dele 🧽.",
      "Isso não é de estudo, por isso não te posso ajudar 🙈. Se precisares de companhia, o Bob está aí 🧽, e o teu namorado, mesmo a 5 horas, ama-te muitíssimo 🖤. Vá, aos apontamentos!",
    ],
  },
};

export function useDedicatoria() {
  return dedicatoria[useLang()];
}
