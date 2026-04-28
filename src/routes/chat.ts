import { Hono } from "hono";
import { chatController } from "../controller/chat.controller";
import { chatStreamController } from "../controller/chatStream.controller";

export const chatRoute = new Hono();

chatRoute.post("/chat", chatController);
chatRoute.post("/chat/stream", chatStreamController);
