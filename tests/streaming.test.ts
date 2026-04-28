// tests/streaming.test.ts
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { chatRoute } from "../src/routes/chat";

const app = new Hono();
app.route("/", chatRoute);

describe("Chat Stream Endpoint Test", () => {
     test("should stream and log content chunks", async () => {
          const res = await app.request("/chat/stream", {
               method: "POST",
               body: JSON.stringify({
                    prompt: "Hello, how are you?",
               }),
               headers: { "Content-Type": "application/json" },
          });

          console.log("Response Status :", res.status);
          expect(res.status).toBe(200);
          expect(res.body).not.toBeNull();

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          const chunks: string[] = [];

          console.log("\n── Stream output ──────────────────────────");

          while (true) {
               const { done, value } = await reader.read();
               if (done) break;
               const text = decoder.decode(value, { stream: true });
               if (text) {
                    chunks.push(text);
                    process.stdout.write(text);
               }
          }

          console.log("\n── End of stream ──────────────────────────");
          console.log("Total chunks  :", chunks.length);
          console.log("Full response :", chunks.join(""));

          expect(chunks.length).toBeGreaterThan(0);
          expect(chunks.join("").length).toBeGreaterThan(0);
     });
});
