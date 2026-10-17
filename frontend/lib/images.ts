"use client";

export interface ImageAttachment {
  media_type: "image/jpeg";
  /** JPEG en base64, sin el prefijo "data:". */
  data: string;
  /** Vista previa para mostrarla en la web. */
  preview: string;
}

const MAX_SIDE = 1600;

/**
 * Reduce la foto en el navegador (lado mayor de 1600 px, JPEG): las fotos del móvil pesan
 * varios MB y la IA no necesita tanta resolución para leer un ejercicio.
 */
export async function prepareImage(file: File): Promise<ImageAttachment> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff"; // las imágenes con transparencia quedan sobre fondo blanco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const preview = canvas.toDataURL("image/jpeg", 0.85);
  return { media_type: "image/jpeg", data: preview.slice(preview.indexOf(",") + 1), preview };
}
