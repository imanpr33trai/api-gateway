import type { Context } from "hono";
import { stream } from "hono/streaming";

import { chatStreamService } from "../services/chatStream.service";
import { ConversationService } from "../services/conversation.service";
import { ChatRequestSchema } from "../types/types";
import { parseSSEStream } from "../utils/parseChunk";

export const chatStreamController = async (c: Context) => {
     const payload = await c.req.json();
     const parsed = ChatRequestSchema.parse(payload);

     if (parsed.conversationId) {
          const title =
               parsed.messages[0]?.content?.substring(0, 50) ??
               "New Conversation";
          await ConversationService.getOrCreateConversation(
               parsed.conversationId,
               title,
          );

          await ConversationService.saveMessage(
               parsed.conversationId,
               "user",
               parsed.messages.at(-1)!.content ?? "",
               `msg-${Date.now()}`,
               parsed.model,
          );
     }

     const fullPrompt = parsed.messages.map((m) => m.content).join("\n");

     const ac = new AbortController();
     c.req.raw.signal.addEventListener("abort", () => ac.abort());

     const sseResponse = await chatStreamService(fullPrompt, {
          signal: ac.signal,
     });

     return stream(c, async (stream) => {
          try {
               const assistantChunks: string[] = [];

               for await (const chunk of parseSSEStream(sseResponse)) {
                    if (chunk.isDone) break;
                    await stream.write(chunk.content);

                    assistantChunks.push(chunk.content);
               }
               if (parsed.conversationId) {
                    await ConversationService.saveMessage(
                         parsed.conversationId,
                         "assistant",
                         assistantChunks.join(""),
                         `resp-${Date.now()}`,
                         parsed.model,
                    );
               }
          } catch (error) {
               console.error("Streaming error:", error);
               await stream.write(
                    `data: ${JSON.stringify({ error: String(error) })}\n\n`,
               );
          }
     });
};
