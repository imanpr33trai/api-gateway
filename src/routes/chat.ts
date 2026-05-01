import { Hono } from "hono";

import { chatController } from "../controller/chat.controller";
import { chatStreamController } from "../controller/chatStream.controller";
import { ConversationService } from "../services/conversation.service";
import { ConversationIdSchema } from "../types/conversation.type";

export const chatRoute = new Hono();

chatRoute.post("/chat/completions", chatController);
chatRoute.post("/chat/completions/stream", chatStreamController);

chatRoute.get("/chat/conversations/:conversationId", async (c) => {
     try {
          const { conversationId } = c.req.param();

          const parsed = ConversationIdSchema.safeParse(conversationId);

          if (!parsed.success) {
               return c.json({ error: "Invalid conversation ID format" }, 400);
          }

          const history =
               await ConversationService.getConversationHistory(conversationId);
          return c.json({ history });
     } catch (e) {
          console.error("Error fetching conversation history", e);
          return c.json({ error: "Failed to fetch conversationhistory" }, 500);
     }
});
