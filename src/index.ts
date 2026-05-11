// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { tagsController } from "./controller/tags.controller";
import { ChatController } from "./controllers/chat-controller";
import { ModelsController } from "./controllers/models-controller";
import { ResponsesController } from "./controllers/responses-controller";
import { ResponsesToOpenAIConverter } from "./converters/responses-to-openai";

const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", logger());

// Initialize converter and controllers
const converter = new ResponsesToOpenAIConverter({
  defaultModel: process.env.DEFAULT_MODEL || "meta/llama-3.3-70b-instruct",
});

const responsesController = new ResponsesController(converter);
const chatController = new ChatController();
const modelsController = new ModelsController();

// ============ Routes ============

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "1.0.0",
    providers: ["nvidia"],
    default_model: converter["defaultModel"] || process.env.DEFAULT_MODEL || "meta/llama-3.3-70b-instruct",
  });
});

// Models endpoint
app.get("/v1/models", modelsController.listModels.bind(modelsController));

// Chat Completions API (OpenAI-compatible pass-through)
app.post("/v1/chat/completions", chatController.createChatCompletion.bind(chatController));

// Responses API (Codex-compatible conversion layer)
app.post("/v1/responses", responsesController.createResponse.bind(responsesController));

// Ollama-compatible endpoints
app.get("/api/tags", tagsController);
app.get("/api/version", (c) => c.json({ version: "1.0.0" }));

// ============ Error Handling ============
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      id: "resp_error",
      object: "response",
      status: "failed",
      error: { code: "internal_error", message: err.message },
    },
    500,
  );
});

export default {
  port: parseInt(process.env.PORT || "11434", 10),
  fetch: app.fetch,
};
