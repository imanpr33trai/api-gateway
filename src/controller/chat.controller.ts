import type { Context } from "hono";
import z from "zod";
import { chatService } from "../services/chat.service";

const ChatRequestSchema = z.object({
   prompt: z.string(),
});

export const chatController = async (c: Context) => {
   const { prompt } = ChatRequestSchema.parse(await c.req.json());

   const result = await chatService(prompt);
   return c.json({ result });
};
