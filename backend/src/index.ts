import cors from "cors";
import express from "express";
import { requireAuth } from "./auth";
import { config } from "./config";
import { errorHandler } from "./http";
import { generalLimiter } from "./limits";
import { chatRouter } from "./routes/chat";
import { documentsRouter } from "./routes/documents";
import { studyRouter } from "./routes/study";
import { subjectsRouter } from "./routes/subjects";

const app = express();
app.set("trust proxy", 1); // O Render está atrás de um proxy.

app.use(
  cors({
    origin: (origin, callback) => {
      // Pedidos sem origem (ex.: health check do Render) são permitidos.
      if (!origin || config.FRONTEND_ORIGINS.includes(origin.replace(/\/$/, ""))) callback(null, true);
      else callback(null, false);
    },
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(generalLimiter, requireAuth);
app.use("/subjects", subjectsRouter);
app.use("/documents", documentsRouter);
app.use("/chat", chatRouter);
app.use("/", studyRouter);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`Estudo IMR API a correr na porta ${config.PORT} (modelo: ${config.ANTHROPIC_MODEL})`);
});
