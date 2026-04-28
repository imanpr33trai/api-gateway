// src/tests/chat.test.ts
import { describe, test } from "bun:test";
import { Hono } from "hono";
import { chatRoute } from "../src/routes/chat";

// Mock the main app to include the chatRoute
const app = new Hono();
app.route("/", chatRoute);

describe("Chat Endpoint Test", () => {
     test("should log the response from the /chat endpoint", async () => {
          // Simulate a request to the /chat endpoint
          const res = await app.request("/chat", {
               method: "POST",
               body: JSON.stringify({ prompt: "Hlo,How are you?," }),
               headers: { "Content-Type": "application/json" },
          });

          // Log the response
          console.log("Response Status:", res.status);
          const text = await res.text();
          console.log("Response Body:", text);
     });
});
