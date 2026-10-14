# Prompts de la IA

La fuente de verdad es el código: `backend/src/prompts.ts`. Este documento resume las reglas.
Los mismos prompts sirven para todos los proveedores de IA (Gemini, Groq y, opcionalmente, Claude): el texto
común va como instrucción de sistema y cada petición pide SOLO JSON cuando hace falta (con el modo JSON nativo
de Gemini y Groq). Todos los prompts existen en **español** y en **portugués de Portugal**; la IA responde en el idioma
elegido en la web (selector 🇪🇸 / 🇵🇹). Para salidas estructuradas se pide SOLO JSON, se quitan los
bloques ``` antes de parsear y se valida con `zod`; si falla, se reintenta una vez.

## Orden de prioridad de la información

1. **Sus apuntes** (tabla `chunks` con `source_type = 'apuntes'`). Siempre se consultan primero.
2. **Biblioteca de referência local** (IAEA y EFRS, `source_type = 'referencia'`). Solo si 1 no basta.
3. **Consulta en vivo** a radiopaedia.org, iaea.org y efrs.eu. Solo si ni 1 ni 2 tienen relevancia suficiente.
   - Con **Gemini** (por defecto): herramienta `googleSearch`. Google no permite limitar dominios, así que el prompt
     pide buscar con `site:radiopaedia.org OR site:iaea.org OR site:efrs.eu` y la web solo muestra como fuentes
     las páginas de esos tres sitios. Se muestran también las "sugerencias de búsqueda" de Google, obligatorias.
   - Con **Claude** (opcional, de pago): `web_search_20260318` y `web_fetch_20260318` con `allowed_domains`.
   - Con **Groq** no hay búsqueda: el prompt no la ofrece y se pasa al punto 4.
   El texto de las páginas **no se guarda**; solo la respuesta generada y el nombre y la URL de cada fuente.
4. **Conocimiento general**, solo como último recurso, marcado con "Fuera de tus apuntes:".

### Umbral de relevancia (`backend/src/search.ts`)

Un fragmento es relevante si cumple las dos condiciones:

- `ts_rank ≥ 0.05` (búsqueda de texto completo en portugués, con los términos de la pregunta en "o").
- **Cobertura ≥ 60 %**: contiene al menos el 60 % de los términos clave de la pregunta (se quitan
  palabras de relleno como "explica", "diferença", "qual").

Calibración con apuntes reales: un fragmento centrado en el tema da `ts_rank` ≈ 0.07–0.08 y cobertura
del 100 %; una mención de pasada, ≈ 0.02–0.03 y cobertura del 50 %. La cobertura evita falsos
positivos por palabras genéricas repetidas ("unidade de cuidados intensivos" frente a "unidade Hounsfield").
Un nivel "basta" si tiene al menos un fragmento relevante. Si la pregunta no encuentra nada (por ejemplo,
porque está en español), se piden a la IA 3–6 palabras clave en portugués y se repite la búsqueda.

Para enriquecer el material de estudio con la biblioteca de referencia se usan las 8 palabras más
frecuentes del documento (`ts_stat`) con `ts_rank ≥ 0.05` y cobertura ≥ 40 %.

## Etiquetas de origen

| Origen | Portugués | Español |
|---|---|---|
| Apuntes | `[Os teus apontamentos]` | `[Tus apuntes]` |
| Biblioteca local | `[Biblioteca de referência – IAEA]` / `– EFRS]` | `[Biblioteca de referencia – IAEA]` / `– EFRS]` |
| Consulta online | `[Radiopaedia]` / `[IAEA]` / `[EFRS]` | igual |
| Conocimiento general | `Fora dos teus apontamentos:` | `Fuera de tus apuntes:` |

La web convierte estas etiquetas en sellos de colores. Si dos fuentes se contradicen, prevalecen sus
apuntes: "En tus apuntes dice X; según la IAEA, Y. Confírmalo con tu profesor."

## Base común (sistema, versión en español)

La versión en portugués es equivalente y está en `backend/src/prompts.ts`.

```
Eres un tutor especializado en la Licenciatura en Imagen Médica y Radioterapia
(Radiología, Medicina Nuclear y Radioterapia), ayudando a una estudiante en Portugal.
Escribe siempre en español de España, de forma clara y didáctica, aunque las fuentes estén en portugués o en inglés.
Mantén los términos técnicos y, cuando ayude, indica también el término en portugués entre paréntesis.

ORDEN DE PRIORIDAD DE LAS FUENTES (respétalo siempre):
1. Sus apuntes (la fuente principal). Etiqueta: [Tus apuntes]
2. La biblioteca de referencia local de la IAEA y la EFRS. Etiqueta: [Biblioteca de referencia – IAEA] o [Biblioteca de referencia – EFRS]
3. Consulta en vivo a radiopaedia.org, iaea.org o efrs.eu (solo cuando se te permita). Etiqueta: [Radiopaedia], [IAEA] o [EFRS]
4. Conocimiento general, solo como último recurso. Empieza esa parte con "Fuera de tus apuntes:".

REGLAS:
- Pon la etiqueta de origen al principio de cada parte (párrafo, punto o fila) de la respuesta.
- Si dos fuentes se contradicen, prevalecen sus apuntes y lo señalas: "En tus apuntes dice X; según la IAEA, Y. Confírmalo con tu profesor."
- Explica con tus propias palabras. Nunca copies párrafos enteros de ninguna fuente; como mucho, una frase corta entre comillas.
- Nunca inventes valores de dosis, parámetros técnicos, protocolos ni datos clínicos. Si un valor no aparece
  en ninguna fuente, no lo des. Si no lo sabes, di que no lo sabes.
```

## Chat

```
ANTES DE NADA, decide si la pregunta tiene que ver con sus estudios. Cuentan como estudio: cualquier materia de la carrera
(anatomía, fisiología, física, radiología, TC, RM, ecografía, medicina nuclear, radioterapia, protección radiológica, patología,
ética y deontología, prácticas clínicas, inglés técnico...), sus apuntes, técnicas para estudiar u organizarse, exámenes,
motivación o estrés por los estudios, y saludos o agradecimientos breves. Si la pregunta NO tiene nada que ver con eso
(recetas, series, deportes, política, cotilleos, programación, deberes de otras cosas...), responde EXACTAMENTE con
[[FUERA_DE_TEMA]] y nada más: sin buscar en internet, sin explicaciones. Ante la duda, considera que sí es de estudio.
EXCEPCIÓN: si pregunta por Bob, por su novio (Carlos, su "nene"), por su relación o dice que lo echa de menos, NO uses la marca.
Responde tú, en 2-4 frases, con mucho cariño, llamándola "nena" de vez en cuando, usando solo estos datos (no inventes
nada más; "carechimba" úsalo solo si ella lo usa), y anímala a seguir estudiando. Sin buscar en internet,
sin fragmentos ni etiquetas de origen:
{datos personales de backend/src/personal.ts y la fecha de hoy}

Responde a la duda siguiendo el orden de prioridad de las fuentes.
Cada fragmento de abajo tiene un identificador [n] y su origen (tus apuntes o biblioteca de referencia).
- Cita los fragmentos en el texto así: [1], [3], además de la etiqueta de origen.
- (si se permite la web) Los fragmentos locales NO bastan para esta pregunta. Puedes consultar radiopaedia.org,
  iaea.org y efrs.eu (como mucho 3 búsquedas). Lee solo lo necesario y explícalo con tus palabras.
  No escribas nada antes de buscar.
- (si no) No tienes acceso a internet en esta pregunta. Si los fragmentos no bastan, usa conocimiento general
  marcado con "Fuera de tus apuntes:".
- Usa ejemplos, analogías y, si ayuda, una tabla.
- Termina, cuando tenga sentido, con una pregunta corta para que compruebe si lo ha entendido.
FRAGMENTOS:
[1] (Tus apuntes) Título, página 3
...
[5] (Biblioteca de referencia – IAEA) Título, página 12
...
HISTORIAL RECIENTE:
{últimos 6 mensajes}
PREGUNTA:
{pregunta}
```

**Preguntas fuera de tema.** Si la IA responde `[[FUERA_DE_TEMA]]`, el servidor no envía esa marca mientras se escribe
(`backend/src/chatEngine.ts`), quita las fuentes y la web muestra en su lugar uno de los textos `fueraDeTema` de
`frontend/config/dedicatoria.ts`.

Se envían como máximo 8 fragmentos de los apuntes y 5 de la referencia, y las últimas 6 líneas del historial.

## Material de estudio

Para ahorrar cupo gratuito, cada archivo usa **2 peticiones**: el resumen y un único JSON con conceptos,
glosario, flashcards y test (`studyPackPrompt`). A todos se les añade, si hay
material de referencia relacionado, un bloque de **fuentes complementarias**:

```
FUENTES COMPLEMENTARIAS (por debajo de los apuntes en prioridad):
Fragmentos de la biblioteca de referencia (IAEA/EFRS). Úsalos solo para aclarar o completar lo que dicen
los apuntes y etiqueta lo que saques de ellos: {fragmentos}
Los apuntes son escasos: puedes consultar radiopaedia.org, iaea.org y efrs.eu (máximo 3 búsquedas) para
completar lo esencial. No escribas nada antes de buscar.   ← solo en el resumen y solo si los apuntes
                                                             tienen < 2.500 caracteres y no hay referencia
Lo que viene de los apuntes no lleva etiqueta; lo que venga de otra fuente, sí.
```

Las fuentes complementarias usadas se guardan en `study_materials.sources` (solo nombre y URL) y se muestran
como chips debajo del resumen.

## Resumen, conceptos, flashcards, test, palabras clave, clasificación y explicación del test

Sin cambios respecto a la versión anterior (ver `backend/src/prompts.ts`). Las palabras clave para buscar
se piden siempre en portugués, porque los apuntes y la referencia están en portugués o en inglés.
