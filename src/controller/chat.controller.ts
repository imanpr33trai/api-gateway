import type { Context } from "hono";
import { chatService } from "../services/chat.service";

export const chatController = async (c: Context) => {
   const body = await c.req.json();

   const result = await chatService(body.prompt);
   return c.json({ result });
};
