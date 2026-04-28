import type { Context } from "hono";
import { stream } from "hono/streaming";
import { chatStreamService } from "../services/chatStream.service";
import { parseSSEStream } from "../utils/parseChunk";

export const chatStreamController = async (c: Context) => {
     const { prompt } = await c.req.json();
     const ac = new AbortController();
     c.req.raw.signal.addEventListener("abort", () => ac.abort());

     const response = await chatStreamService(prompt, { signal: ac.signal });

     return stream(c, async (stream) => {
          try {
               for await (const chunk of parseSSEStream(response)) {
                    if (chunk.isDone) break;
                    await stream.write(chunk.content);
               }
          } catch (error) {
               console.error("Streaming error:", error);
               await stream.write(
                    `data: ${JSON.stringify({ error: String(error) })}\n\n`,
               );
          }
     });
};
