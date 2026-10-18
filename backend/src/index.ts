import cors from "cors";
import express from "express";
import { CHAIN } from "./ai";
import { requireAuth } from "./auth";
import { config } from "./config";
import { errorHandler } from "./http";
import { generalLimiter } from "./limits";
import { atlasRouter } from "./routes/atlas";
import { chatRouter } from "./routes/chat";
import { coupleRouter } from "./routes/couple";
import { documentsRouter } from "./routes/documents";
import { examsRouter } from "./routes/exams";
import { maybeSendDailyReminders } from "./push";
import { exercisesRouter } from "./routes/exercises";
import { findRouter } from "./routes/find";
import { highlightsRouter } from "./routes/highlights";
import { oralRouter } from "./routes/oral";
import { pushRouter } from "./routes/push";
import { quizRouter } from "./routes/quiz";
import { scheduleRouter } from "./routes/schedule";
import { sessionsRouter } from "./routes/sessions";
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
  // cron-job.org llama aquí cada 10 minutos: se aprovecha para mandar los recordatorios del día.
  maybeSendDailyReminders();
  res.json({ ok: true });
});

app.use(generalLimiter, requireAuth);
app.use("/subjects", subjectsRouter);
app.use("/documents", documentsRouter);
app.use("/chat", chatRouter);
app.use("/exams", examsRouter);
app.use("/schedule", scheduleRouter);
app.use("/quiz", quizRouter);
app.use("/sessions", sessionsRouter);
app.use("/couple", coupleRouter);
app.use("/push", pushRouter);
app.use("/oral", oralRouter);
app.use("/exercises", exercisesRouter);
app.use("/find", findRouter);
app.use("/highlights", highlightsRouter);
app.use("/atlas", atlasRouter);
app.use("/", studyRouter);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`API de Estudio IMR funcionando en el puerto ${config.PORT}`);
  if (CHAIN.length === 0)
    console.error("⚠️  Ningún modelo de AI_CHAIN tiene su clave configurada: la IA no funcionará.");
  else console.log(`IA (en este orden): ${CHAIN.map((s) => s.key).join(" → ")}`);
  setInterval(maybeSendDailyReminders, 15 * 60_000);
});
