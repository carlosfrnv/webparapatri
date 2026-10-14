# Estudio IMR 💙

Web privada de estudio para Patri (Licenciatura en Imagem Médica e Radioterapia, ESSCVP Alto Tâmega).

Ella sube los apuntes que le llegan por correo (PDF, Word, PowerPoint o texto) y la IA genera:

- **Resumen** estructurado, con lo que no puede olvidar para el examen
- **Conceptos clave** y **glosario**
- **Flashcards** con repetición espaciada (algoritmo SM-2)
- **Test** de 10 preguntas con corrección y explicación
- **Chat** que responde dudas basándose en sus apuntes y cita de qué archivo y página sale cada dato

### De dónde saca la información la IA (por orden de prioridad)

1. **Sus apuntes**: siempre primero, son la fuente principal.
2. **Biblioteca de referencia** (PDF gratuitos de la IAEA y la EFRS que subes tú): sección aparte, no se mezcla
   con sus apuntes, pero se usa en la búsqueda.
3. **Consulta en vivo** a radiopaedia.org, iaea.org y efrs.eu (con la búsqueda de Google de Gemini): solo si 1 y 2
   no tienen relevancia suficiente. El texto de esas páginas no se guarda nunca; solo la respuesta y el
   nombre/enlace de la fuente. Si el modelo que responde no puede buscar (Groq, o cupo de búsqueda agotado),
   se pasa directamente al punto 4.
4. **Conocimiento general**: último recurso, marcado como "Fuera de tus apuntes:".

Cada parte de la respuesta lleva una etiqueta de origen ([Tus apuntes], [Biblioteca de referencia – IAEA],
[Radiopaedia]…). Si las fuentes se contradicen, mandan sus apuntes. Detalles y umbral de relevancia:
[`docs/prompts-ia.md`](docs/prompts-ia.md).

La web está **en español** y tiene un selector para cambiarla a **portugués de Portugal** (🇪🇸 / 🇵🇹, en el menú y en
la pantalla de acceso). La elección se guarda en el navegador. La IA escribe resúmenes, flashcards, tests y respuestas
del chat en el idioma elegido, aunque los apuntes estén en portugués. Si un archivo ya tenía el material generado en el
otro idioma, la web avisa y ofrece generarlo de nuevo con un clic.

## Cómo está montado

| Pieza | Tecnología | Dónde se aloja (gratis) |
|---|---|---|
| `frontend/` | Next.js + TypeScript + Tailwind | Vercel |
| `backend/` | Node.js + Express + TypeScript | Render |
| Base de datos, ficheros y login | Supabase (Postgres, Storage, Auth) | Supabase |
| IA | Google Gemini y Groq (planes gratuitos) | solo se llama desde el backend |

```
Navegador ──login──▶ Supabase Auth
Navegador ──JWT───▶ Backend (Render) ──service_role──▶ Supabase (BD + ficheros)
                                    └──API keys─────▶ Google Gemini / Groq (IA gratuita)
```

**Seguridad:** las claves de la IA y la `service_role` de Supabase viven **solo** en Render. El navegador solo
tiene la clave pública (`anon`) de Supabase, que sirve para el login. El backend rechaza cualquier email que no sea
`ALLOWED_EMAIL`.

La búsqueda en los apuntes usa la búsqueda de texto completo de Postgres en portugués: es gratis y no necesita ningún
servicio extra.

---

## Puesta en marcha paso a paso

Necesitas cuentas gratuitas en: [Supabase](https://supabase.com), [Google AI Studio](https://aistudio.google.com),
[Groq](https://console.groq.com), [Render](https://render.com) y [Vercel](https://vercel.com). Todo es gratis y
no hace falta tarjeta.

> 🔗 **Render y Vercel tienen que estar conectados a GitHub.** Regístrate en cada una con **"Continue with GitHub"** y,
> cuando te lo pida, dale acceso al repositorio `webparapatri` (puedes elegir "Only select repositories"). A partir de
> ahí, cada cambio que se suba a la rama principal de GitHub se publica solo.
>
> ⚠️ El código está ahora en la rama `claude/crear-sitio-web-6yq9zv`. Antes de desplegar, fusiónala en `main`
> (con una pull request) o elige esa rama al crear los servicios en Render y Vercel.

### 1. Supabase (base de datos, ficheros y login)

1. **New project** → ponle un nombre (por ejemplo `estudio-imr`), una contraseña y la región **Europe (West)**.
2. Ve a **SQL Editor → New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa
   **Run**. Esto crea las tablas, la seguridad y el bucket privado `temario` para los ficheros.
3. **Authentication → Users → Add user → Create new user**: pon el **email de Patri** y marca *Auto Confirm User*.
   (La contraseña da igual: ella entrará con un enlace mágico.)
4. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up**. Así nadie más puede crearse
   una cuenta.
5. **Authentication → URL Configuration**: de momento pon `http://localhost:3000` en *Site URL*. Cuando tengas la
   URL de Vercel (paso 4), cámbiala y añádela también en *Redirect URLs*.
6. **Project Settings → API Keys** (o *Data API*), copia:
   - **Project URL** → `SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ esta es secreta: solo en Render)

### 2. La IA (gratis: Google Gemini + Groq)

La web usa **IA gratuita**. El servidor prueba los modelos en este orden y, si uno agota su cupo gratuito,
pasa automáticamente al siguiente (y no lo vuelve a intentar hasta un rato después):

1. **Gemini Flash** (Google): el de más calidad. Puede buscar en internet.
2. **Gemini Flash-Lite** (Google): algo más sencillo, con más peticiones gratis al día. Puede buscar en internet.
3. **GPT-OSS 120B en Groq**: modelo abierto, muy rápido. **No busca en internet.**

Si todos llegan a su límite, la web muestra "La IA gratuita ha llegado a su límite por ahora. Inténtalo de nuevo
dentro de un rato". Los cupos diarios se reinician cada día.

**Claves (gratis, sin tarjeta):**

1. **Gemini**: entra en [aistudio.google.com](https://aistudio.google.com) con una cuenta de Google →
   **Get API key → Create API key** → copia la clave (`GEMINI_API_KEY`). No actives la facturación: así es
   imposible que te cobren nada (si se acaba el cupo, simplemente responde el siguiente de la cadena).
2. **Groq**: entra en [console.groq.com](https://console.groq.com) → **API Keys → Create API Key** → copia la
   clave (`GROQ_API_KEY`).

Basta con una de las dos, pero con las dos la web aguanta mucho más uso al día.

**Límites del plan gratuito** (cambian a menudo; los de tu cuenta se ven en AI Studio y en la consola de Groq):
según varias fuentes, Gemini Flash da pocas peticiones al día (del orden de decenas), Flash-Lite unos cientos y
Groq bastantes más, pero con un límite de tokens por minuto bajo (un archivo muy largo puede no caber; entonces
lo hace Gemini). Para gastar poco cupo, cada archivo nuevo usa **solo 2 peticiones** (resumen + el resto) y queda
guardado; repasar flashcards, hacer tests o buscar en la Biblioteca **no usa la IA**.

> ⚠️ **Privacidad.** En el plan gratuito de Gemini, Google puede usar lo que se le envía (fragmentos de sus apuntes
> y sus preguntas) para mejorar sus productos, y puede revisarlo personal humano. No subas datos personales de
> pacientes. Groq indica que no entrena con los datos de la API, pero revisa sus condiciones.
>
> 🌐 **Consulta online.** Con Gemini se usa la "búsqueda con Google" y se le pide que busque solo en
> radiopaedia.org, iaea.org y efrs.eu; la web solo muestra como fuentes páginas de esos tres sitios, pero Google
> no permite bloquear otros sitios al 100 %. Las condiciones de Google obligan a mostrar sus "sugerencias de
> búsqueda" debajo de esas respuestas (un recuadro pequeño con enlaces a Google). Según varias fuentes, la búsqueda
> con Google puede no estar incluida gratis en los modelos más nuevos: en ese caso la IA responde sin buscar y lo
> marca como "Fuera de tus apuntes". Para desactivarla del todo: `WEB_MAX_SEARCHES=0`.
>
> 🗺️ Si Gemini responde que el plan gratuito no está disponible en tu región, cambia la región del servicio de
> Render a Oregón (EE. UU.).

**Opcional (de pago, muy barato):** si algún día quieres usar Claude de Anthropic, crea una clave en
[console.anthropic.com](https://console.anthropic.com), ponla en `ANTHROPIC_API_KEY` y añade
`anthropic:claude-haiku-5-5` a `AI_CHAIN` (por ejemplo, al final, como último recurso). Con Claude la consulta
online sí queda limitada de verdad a los tres sitios. Coste aproximado: 1–2 € al mes con uso intenso.

### 3. Render (backend)

1. **New → Blueprint** → conecta este repositorio. Render leerá [`render.yaml`](render.yaml) y creará el servicio
   `estudio-imr-api`. (Alternativa manual: **New → Web Service**, *Root Directory* `backend`, *Build*
   `npm install --include=dev && npm run build`, *Start* `npm start`, *Health check* `/health`.)
2. Rellena las variables de entorno que te pida:
   `GEMINI_API_KEY`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAIL` (el email de Patri) y
   `FRONTEND_ORIGIN` (de momento `http://localhost:3000`; luego la URL de Vercel).
3. Cuando termine, copia la URL del servicio (algo como `https://estudio-imr-api.onrender.com`).

> ⏰ En el plan gratuito, Render "duerme" el servidor tras 15 minutos sin uso. La primera petición tarda hasta un
> minuto en despertarlo; la web muestra "A acordar o servidor…" mientras tanto, no es un error.

### 4. Vercel (frontend)

1. **Add New → Project** → importa este repositorio.
2. En **Root Directory** elige `frontend`.
3. En **Environment Variables** añade `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `NEXT_PUBLIC_API_URL` (la URL de Render, sin barra al final).
4. **Deploy**. Copia la URL que te da (por ejemplo `https://estudio-imr.vercel.app`).
5. Pon esa URL en:
   - Render → variable `FRONTEND_ORIGIN`
   - Supabase → Authentication → URL Configuration → *Site URL* y *Redirect URLs*

### Dominio propio (opcional)

No hace falta comprar nada: Vercel da gratis una dirección `https://<nombre>.vercel.app` con HTTPS. Si más adelante
quieres una dirección personal (por ejemplo `estudiopatri.com`, unos 10–15 €/año), puedes comprarla en Vercel
(**Domains → Buy**) o en cualquier registrador (Namecheap, Cloudflare…) y añadirla en Vercel → tu proyecto →
**Settings → Domains**. Después, pon el dominio nuevo también en `FRONTEND_ORIGIN` (Render) y en Supabase → URL
Configuration.

### Biblioteca de referencia (IAEA / EFRS)

Descarga los PDF gratuitos que quieras (por ejemplo, de la colección de publicaciones de la IAEA o de la web de
la EFRS) y súbelos de una de estas dos formas:

- **Desde la web**: Biblioteca → «Biblioteca de referencia» → elige IAEA o EFRS → arrastra el PDF (máx. 25 MB).
- **Desde tu ordenador** (para PDF grandes o muchos a la vez, hasta 50 MB cada uno), dentro de `backend/` con el
  `.env` relleno:

  ```bash
  npm run referencia -- --org IAEA ~/Descargas/IAEA/        # una carpeta entera
  npm run referencia -- --org EFRS ~/Descargas/efrs-guia.pdf
  ```

Para probar el chat desde la terminal con el mismo motor que la web:

```bash
npm run probar -- "¿Qué es la unidad Hounsfield?"
npm run probar -- --lang pt "O que é a unidade Hounsfield?"   # para probar la versión en portugués
```

Muestra qué niveles se activaron (apuntes, referencia, web), la respuesta y las fuentes.

> 🌐 La consulta online solo se usa cuando sus apuntes y la referencia no bastan. `WEB_MAX_SEARCHES=0` la desactiva.

### 5. Personaliza la dedicatoria ✏️

Edita [`frontend/config/dedicatoria.ts`](frontend/config/dedicatoria.ts): el nombre, el mensaje de bienvenida que verá
la primera vez que entre, la frase de la página de inicio y `fueraDeTema`, las respuestas del chat (sale una u otra) cuando pregunta algo que no tiene
que ver con sus estudios (la IA lo detecta y la web muestra uno de esos textos tal cual; puedes añadir o quitar).
En [`backend/src/personal.ts`](backend/src/personal.ts) están los datos personales (Bob, la distancia...) que la IA usa
cuando ella pregunta por Bob, por ti o dice que te echa de menos. Hay una versión en español y otra en portugués. Al hacer commit, Vercel la vuelve a publicar sola.

### 6. Comprobación final

- [ ] Entrar con el email de Patri funciona (le llega un enlace por correo).
- [ ] Con otro email no se puede entrar.
- [ ] Subir un PDF de prueba → pasa de "A processar…" a "Pronto".
- [ ] Al abrirlo se generan resumen, conceptos, glosario, flashcards y test (la primera vez tarda 1–2 minutos).
- [ ] El chat responde citando el documento ([1], [2]…).
- [ ] Probarla en el móvil. En el iPhone: Safari → Compartir → **Añadir a pantalla de inicio** para tenerla como una
      app.

---

## Desarrollo en local

Requisitos: Node.js 20 o superior.

```bash
# Backend
cd backend
cp .env.example .env      # y rellena los valores
npm install
npm run dev               # http://localhost:10000

# Frontend (en otra terminal)
cd frontend
cp .env.example .env.local   # y rellena los valores
npm install
npm run dev                  # http://localhost:3000
```

Si ya habías ejecutado `supabase/schema.sql` antes, vuelve a ejecutarlo tras cada actualización: añade las
columnas nuevas (idioma, biblioteca de referencia…) sin borrar nada.

Antes de publicar cambios: `npm run build` en `backend/` y en `frontend/` (y `npm run lint` en `frontend/`).

## Estructura

```
backend/src/
  index.ts          servidor Express, CORS y rutas
  auth.ts           verifica la sesión de Supabase y ALLOWED_EMAIL
  extract.ts        extrae el texto de PDF (con página), DOCX, PPTX y TXT
  chunk.ts          trocea en fragmentos de ~1.500 caracteres con solapamiento
  processing.ts     procesado en segundo plano + sugerencia de asignatura con IA
  study.ts          genera resumen, conceptos, flashcards y test (con caché)
  search.ts         búsqueda por niveles (apuntes → referencia) y umbral de relevancia
  web.ts            consulta en vivo a radiopaedia.org, iaea.org y efrs.eu
  chatEngine.ts     motor del chat (lo usan la web y `npm run probar`)
  ingest.ts         subida + extracción + troceado (apuntes y referencia)
  scripts/          `npm run referencia` y `npm run probar`
  prompts.ts        todos los prompts de la IA (español y portugués europeo)
  i18n.ts           mensajes de error en los dos idiomas (cabecera X-Lang)
  sm2.ts            repetición espaciada
  routes/           subjects, documents, chat, flashcards, quiz, stats
frontend/
  app/              páginas: Início, Biblioteca, Disciplina, Documento, Estudar, Chat
  components/       piezas reutilizables (subida, flashcards, test…)
  lib/i18n.tsx      todos los textos de la web en español y portugués
  config/dedicatoria.ts   ✏️ el mensaje personal
supabase/schema.sql  tablas, seguridad (RLS), búsqueda y bucket
```

## Ideas para más adelante

- OCR para PDF escaneados (ahora se marcan con un aviso claro).
- Búsqueda semántica con `pgvector` si la búsqueda por palabras se queda corta.
- Importar el plan de estudios oficial de la escuela (las asignaturas iniciales son una propuesta editable).
