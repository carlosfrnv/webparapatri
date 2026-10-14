// ✏️ Carlos: cambia estos textos como quieras. Aparecen en la página de inicio.
// Hay una versión en español y otra en portugués (se muestra la del idioma elegido).
// Deja una línea en blanco dentro del mensaje para empezar un párrafo nuevo.

import { useLang } from "@/lib/i18n";

// Fechas especiales (AAAA-MM-DD). El día de cada mes en que empezasteis a ser novios sale un mensaje al entrar.
export const fechas = {
  novios: "2026-02-21",
  primerBeso: "2025-10-08",
};

const mesesEs = (n: number) => (n === 1 ? "1 mes" : `${n} meses`);
const mesesPt = (n: number) => (n === 1 ? "1 mês" : `${n} meses`);
const anosEs = (n: number) => (n === 1 ? "1 año" : `${n} años`);
const anosPt = (n: number) => (n === 1 ? "1 ano" : `${n} anos`);

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
    // Mensajes del calendario el día del examen y el día antes.
    examenHoy: "Hoy es el examen, nena. Lo vas a hacer genial: confía en todo lo que has estudiado 🖤 — Carlos",
    examenManana: "Mañana es el examen. Repasa con calma, duerme bien abrazada a Bob y confía en ti 🖤 — Carlos",
    // Mensajes de los días especiales. Cada 21 sale uno distinto de la lista (van rotando).
    especial: {
      tituloMes: (n: number) => `¡Feliz 21, nena! ${mesesEs(n)} 🖤`,
      mes: [
        (n: number) =>
          `Hoy hacemos ${mesesEs(n)} juntos, nena 🖤. Desde aquel día en El Berrocal no he dejado de pensar en ti. Te quiero muchísimo.`,
        (n: number) =>
          `Ya son ${mesesEs(n)}, nena. Casi 5 horas de distancia no son nada al lado de lo que te quiero 🖤.`,
        (n: number) =>
          `${mesesEs(n)} contigo, nena. Esta noche dale un abrazo a Bob de mi parte y piensa que muy pronto te lo doy yo 🖤.`,
        (n: number) =>
          `Hoy es 21 y eso significa una cosa: ${mesesEs(n)} siendo el novio más afortunado del mundo 🖤. Te amo, nena.`,
        (n: number) =>
          `Otro 21 a tu lado, y ya van ${mesesEs(n)} 🖤. Estoy muy orgulloso de ti y de todo lo que estás estudiando. Te quiero, carechimba 😘.`,
        (n: number) =>
          `${mesesEs(n)}, nena. Gracias por cada llamada, cada mensaje y cada visita. Eres lo mejor que me ha pasado 🖤.`,
      ],
      tituloAniversario: "¡Feliz aniversario, nena! 🖤",
      aniversario: (n: number) =>
        `Hoy hace ${anosEs(n)} que somos novios. Gracias por cada día, por tu paciencia con la distancia y por hacerme tan feliz. Te amo muchísimo 🖤.`,
      tituloBeso: "8 de octubre 💋",
      beso: (n: number) =>
        `Hoy hace ${anosEs(n)} de nuestro primer beso. Lo volvería a vivir mil veces. Te quiero, nena 🖤.`,
      firma: "— Tu nene",
      cerrar: "Te quiero 🖤",
    },
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
    examenHoy: "Hoje é o exame, nena. Vais correr muito bem: confia em tudo o que estudaste 🖤 — Carlos",
    examenManana: "Amanhã é o exame. Revê com calma, dorme bem abraçada ao Bob e confia em ti 🖤 — Carlos",
    especial: {
      tituloMes: (n: number) => `Feliz dia 21, nena! ${mesesPt(n)} 🖤`,
      mes: [
        (n: number) =>
          `Hoje fazemos ${mesesPt(n)} juntos, nena 🖤. Desde aquele dia no El Berrocal que não paro de pensar em ti. Amo-te muitíssimo.`,
        (n: number) => `Já são ${mesesPt(n)}, nena. Quase 5 horas de distância não são nada ao lado do que te amo 🖤.`,
        (n: number) =>
          `${mesesPt(n)} contigo, nena. Esta noite dá um abraço ao Bob da minha parte e pensa que muito em breve sou eu a dar-to 🖤.`,
        (n: number) =>
          `Hoje é dia 21 e isso significa uma coisa: ${mesesPt(n)} a ser o namorado mais sortudo do mundo 🖤. Amo-te, nena.`,
        (n: number) =>
          `Mais um dia 21 ao teu lado, e já vão ${mesesPt(n)} 🖤. Tenho muito orgulho em ti e em tudo o que estás a estudar. Amo-te, carechimba 😘.`,
        (n: number) =>
          `${mesesPt(n)}, nena. Obrigado por cada chamada, cada mensagem e cada visita. És o melhor que me aconteceu 🖤.`,
      ],
      tituloAniversario: "Feliz aniversário, nena! 🖤",
      aniversario: (n: number) =>
        `Hoje faz ${anosPt(n)} que somos namorados. Obrigado por cada dia, pela tua paciência com a distância e por me fazeres tão feliz. Amo-te muitíssimo 🖤.`,
      tituloBeso: "8 de outubro 💋",
      beso: (n: number) =>
        `Hoje faz ${anosPt(n)} do nosso primeiro beijo. Voltava a vivê-lo mil vezes. Amo-te, nena 🖤.`,
      firma: "— O teu nene",
      cerrar: "Amo-te 🖤",
    },
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
