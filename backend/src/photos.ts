import { PDFDocument } from "pdf-lib";

/**
 * Fotos de apuntes a mano (o de la pizarra): se juntan en un PDF, una foto por página. Como el PDF no tiene
 * texto, al procesarlo la IA lee cada página (como con los PDF escaneados) y lo pasa a texto.
 */
export const MAX_PHOTOS = 30;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** Un PDF con una foto por página (JPEG o PNG; la web ya las manda reducidas). Null si ninguna se puede leer. */
export async function photosToPdf(photos: Buffer[]): Promise<Buffer | null> {
  const pdf = await PDFDocument.create();
  for (const photo of photos) {
    try {
      const image = isJpeg(photo) ? await pdf.embedJpg(photo) : isPng(photo) ? await pdf.embedPng(photo) : null;
      if (!image) continue;
      // Páginas de como mucho ~A4 a lo ancho, manteniendo la proporción de la foto.
      const scale = Math.min(1, 842 / Math.max(image.width, image.height));
      const page = pdf.addPage([image.width * scale, image.height * scale]);
      page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
    } catch (err) {
      console.error("Foto no válida:", (err as Error).message);
    }
  }
  if (pdf.getPageCount() === 0) return null;
  return Buffer.from(await pdf.save());
}
