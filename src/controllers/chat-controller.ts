// src/controllers/chat-controller.ts
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { Nvidia } from "../providers/nvidia";

export class ChatController {
  async createChatCompletion(c: Context): Promise<Response> {
    try {
      const chatReq = await c.req.json();

      // Handle streaming
      if (chatReq.stream) {
        return this.createChatCompletionStream(c, chatReq);
      }

      // Non-streaming response
      const nvidiaResp = await Nvidia.chat(chatReq);
      const data = await nvidiaResp.json();
      return c.json(data);
    } catch (error: any) {
      console.error("ChatController error:", error);
      return c.json(
        { error: { message: error.message, type: error.constructor.name } },
        502
      );
    }
  }

  private async createChatCompletionStream(
    c: Context,
    chatReq: any
  ): Promise<Response> {
    return stream(c, async (streamWriter) => {
      try {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");

        const nvidiaResp = await Nvidia.chatStream(chatReq);
        if (!nvidiaResp.body) throw new Error("No stream body");

        const reader = nvidiaResp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          await streamWriter.write(text);
        }
      } catch (error: any) {
        await streamWriter.write(
          `data: ${JSON.stringify({ error: { message: error.message, type: error.constructor.name } })}\n\n`
        );
      }
    });
  }
}
