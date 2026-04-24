import { describe, expect, spyOn, test } from "bun:test";
import app from "../index";
import { Nvidia } from "../providers/nvidia";
import { Role } from "../providers/types";

describe("Chat API", () => {
   test("POST / should return a chat response", async () => {
      // 1. Mock the Nvidia provider
      const mockMessages = [
         { role: Role.ASSISTANT, content: "Hello! I am an AI." },
      ];
      const spy = spyOn(Nvidia, "generateText").mockResolvedValue(mockMessages);

      // 2. Simulate a request
      const res = await app.request("/", {
         method: "POST",
         body: JSON.stringify({ prompt: "Hi" }),
         headers: { "Content-Type": "application/json" },
      });

      // 3. Assertions
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result).toEqual(mockMessages);
      expect(spy).toHaveBeenCalledWith("Hi");
   });
});
