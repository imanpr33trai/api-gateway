import { Hono } from "hono";
import { ollamaChatController } from "../controller/ollama.controller";

export const ollamaRoute = new Hono();

ollamaRoute.post("/chat/completions", ollamaChatController);