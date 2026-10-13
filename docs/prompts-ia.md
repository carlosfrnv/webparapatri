# Prompts de la IA

La fuente de verdad es el código: `backend/src/prompts.ts`. Este documento resume las reglas.
Todos los prompts existen en **español** y en **portugués de Portugal**; la IA responde en el idioma
elegido en la web (selector 🇪🇸 / 🇵🇹). Para salidas estructuradas se pide SOLO JSON, se quitan los
bloques ``` antes de parsear y se valida con `zod`; si falla, se reintenta una vez.

## Orden de prioridad de la información

1. **Sus apuntes** (tabla `chunks` con `source_type = 'apontamentos'`). Siempre se consultan primero.
2. **Biblioteca de referência local** (IAEA y EFRS, `source_type = 'referencia'`). Solo si 1 no basta.
3. **Consulta en vivo** a radiopaedia.org, iaea.org y efrs.eu (herramientas `web_search_20260318` y
   `web_fetch_20260318` de la API de Anthropic, con `allowed_domains` y `max_uses: 3`). Solo si ni 1 ni 2
   tienen relevancia suficiente. El texto de las páginas **no se guarda**; solo la respuesta generada y el
   nombre y la URL de cada fuente (para los chips).
4. **Conocimiento general**, solo como último recurso, marcado con "Fora dos teus apontamentos:".

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
apuntes: "Nos teus apontamentos diz X; segundo a IAEA, Y. Confirma com o teu professor."

## Base común (sistema, versión en portugués)

```
És um tutor especializado na Licenciatura em Imagem Médica e Radioterapia
(Radiologia, Medicina Nuclear e Radioterapia), a ajudar uma estudante em Portugal.
Escreve sempre em português europeu, de forma clara e didática, mesmo que as fontes estejam em inglês.

ORDEM DE PRIORIDADE DAS FONTES (respeita-a sempre):
1. Os apontamentos dela (a fonte principal). Etiqueta: [Os teus apontamentos]
2. A biblioteca de referência local da IAEA e da EFRS. Etiqueta: [Biblioteca de referência – IAEA] ou [Biblioteca de referência – EFRS]
3. Consulta em direto a radiopaedia.org, iaea.org ou efrs.eu (só quando for permitido). Etiqueta: [Radiopaedia], [IAEA] ou [EFRS]
4. Conhecimento geral, só como último recurso. Começa essa parte com "Fora dos teus apontamentos:".

REGRAS:
- Põe a etiqueta de origem no início de cada parte (parágrafo, ponto ou linha de tabela) da resposta.
- Se duas fontes se contradisserem, prevalecem os apontamentos dela e assinalas: "Nos teus apontamentos diz X; segundo a IAEA, Y. Confirma com o teu professor."
- Explica com as tuas próprias palavras. Nunca copies parágrafos inteiros de nenhuma fonte; no máximo, uma frase curta entre aspas.
- Nunca inventes valores de dose, parâmetros técnicos, protocolos ou dados clínicos. Se um valor não aparecer
  em nenhuma fonte, não o dês. Se não souberes, diz que não sabes.
```

## Chat

```
Responde à dúvida seguindo a ordem de prioridade das fontes.
Cada excerto abaixo tem um identificador [n] e a sua origem (apontamentos ou biblioteca de referência).
- Cita os excertos no texto assim: [1], [3], além da etiqueta de origem.
- (si se permite la web) Os excertos locais NÃO chegam para esta pergunta. Podes consultar radiopaedia.org,
  iaea.org e efrs.eu (no máximo 3 pesquisas). Lê só o necessário e explica com as tuas palavras.
  Não escrevas nada antes de pesquisar.
- (si no) Não tens acesso à internet nesta pergunta. Se os excertos não chegarem, usa conhecimento geral
  assinalado com "Fora dos teus apontamentos:".
- Usa exemplos, analogias e, se ajudar, uma tabela.
- Termina, quando fizer sentido, com uma pergunta curta para ela verificar se percebeu.
EXCERTOS:
[1] (Os teus apontamentos) Título, página 3
...
[5] (Biblioteca de referência – IAEA) Título, página 12
...
HISTÓRICO RECENTE:
{últimas 6 mensagens}
PERGUNTA:
{pergunta}
```

Se envían como máximo 8 fragmentos de los apuntes y 5 de la referencia, y las últimas 6 líneas del historial.

## Material de estudio

Los prompts de resumen, conceptos y glosario, flashcards y test no cambian. A todos se les añade, si hay
material de referencia relacionado, un bloque de **fuentes complementarias**:

```
FONTES COMPLEMENTARES (abaixo dos apontamentos em prioridade):
Excertos da biblioteca de referência (IAEA/EFRS). Usa-os só para esclarecer ou completar o que dizem os
apontamentos e etiqueta o que tirares deles: {excertos}
Os apontamentos são escassos: podes consultar radiopaedia.org, iaea.org e efrs.eu (máximo 3 pesquisas)
para completar o essencial. Não escrevas nada antes de pesquisar.   ← solo en el resumen y solo si los
                                                                      apuntes tienen < 2.500 caracteres y
                                                                      no hay referencia
O que vem dos apontamentos não leva etiqueta; o que vier de outra fonte, sim.
```

Las fuentes complementarias usadas se guardan en `study_materials.sources` (solo nombre y URL) y se muestran
como chips debajo del resumen.

## Resumen, conceptos, flashcards, test, palabras clave, clasificación y explicación del test

Sin cambios respecto a la versión anterior (ver `backend/src/prompts.ts`). Las palabras clave para buscar
se piden siempre en portugués, porque los apuntes y la referencia están en portugués o en inglés.
