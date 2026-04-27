import { Hono } from "hono";
import { chatController } from "../controller/chat.controller";

export const chatRoute = new Hono();

chatRoute.post("/chat", chatController);
