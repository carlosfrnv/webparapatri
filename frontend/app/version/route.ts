/** Versión publicada ahora mismo (la web abierta en el móvil la compara con la suya para actualizarse). */
export function GET() {
  return Response.json({ id: process.env.BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}
