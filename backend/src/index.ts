import cors from "cors";
import express from "express";
import { CHAIN } from "./ai";
import { requireAuth } from "./auth";
import { config } from "./config";
import { errorHandler } from "./http";
import { generalLimiter } from "./limits";
import { chatRouter } from "./routes/chat";
import { documentsRouter } from "./routes/documents";
import { examsRouter } from "./routes/exams";
import { scheduleRouter } from "./routes/schedule";
import { studyRouter } from "./routes/study";
import { subjectsRouter } from "./routes/subjects";

const app = express();
app.set("trust proxy", 1); // Render está detrás de un proxy.

app.use(
  cors({
    origin: (origin, callback) => {
      // Se permiten las peticiones sin origen (p. ej., el health check de Render).
      if (!origin || config.FRONTEND_ORIGINS.includes(origin.replace(/\/$/, ""))) callback(null, true);
      else callback(null, false);
    },
  }),
);
// El chat admite fotos (hasta 3, ya reducidas en el navegador): necesita un límite mayor.
app.use("/chat", express.json({ limit: "12mb" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(generalLimiter, requireAuth);
app.use("/subjects", subjectsRouter);
app.use("/documents", documentsRouter);
app.use("/chat", chatRouter);
app.use("/exams", examsRouter);
app.use("/schedule", scheduleRouter);
app.use("/", studyRouter);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`API de Estudio IMR funcionando en el puerto ${config.PORT}`);
  if (CHAIN.length === 0) console.error("⚠️  Ningún modelo de AI_CHAIN tiene su clave configurada: la IA no funcionará.");
  else console.log(`IA (en este orden): ${CHAIN.map((s) => s.key).join(" → ")}`);
});
