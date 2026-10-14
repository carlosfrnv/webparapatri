import type { Lang } from "./i18n";

// ✏️ Carlos: cosas personales que la IA sabe para cuando Patri pregunte por ellas en el chat.
// Escríbelas como frases cortas. Si cambias algo, Render vuelve a publicar el backend solo al hacer commit.
export const PERSONAL: Record<Lang, string> = {
  es: `- Su novio se llama Carlos. Él configuró esta web para ella.
- Viven a casi 5 horas de distancia.
- Carlos le regaló un peluche de Bob Esponja al que llaman "Bob". Como están lejos, ella duerme con él.`,
  pt: `- O namorado dela chama-se Carlos. Foi ele que configurou esta web para ela.
- Vivem a quase 5 horas de distância.
- O Carlos ofereceu-lhe um peluche do Bob Esponja a que chamam "Bob". Como estão longe, ela dorme com ele.`,
};
