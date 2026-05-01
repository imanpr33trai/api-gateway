// tests/conversation-history.test.ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../src/db";
import { conversations, messages } from "../src/db/schema";
import { Nvidia } from "../src/providers/nvidia";
import { chatRoute } from "../src/routes/chat";

// Use test database to avoid polluting production
process.env.DB_FILE_NAME = "./test-conversations.db";

// Create test app
const app = new Hono();
app.route("/", chatRoute);

const testConversationId = "chatcmpl-TESTHIST123456";
const testModel = "openai/gpt-oss-120b";

describe("Conversation History Integration Test", () => {
     // Clean up test data before and after
     beforeAll(async () => {
          await db
               .delete(messages)
               .where(eq(messages.conversationId, testConversationId));
          await db
               .delete(conversations)
               .where(eq(conversations.conversationId, testConversationId));
     });

     afterAll(async () => {
          await db
               .delete(messages)
               .where(eq(messages.conversationId, testConversationId));
          await db
               .delete(conversations)
               .where(eq(conversations.conversationId, testConversationId));
     });

     it("should save conversation history and retrieve it correctly", async () => {
          console.log("\n🧪 Testing Conversation History Flow\n");

          // Step 1: Mock the Nvidia provider to avoid external API calls
          const originalGenerateText = Nvidia.generateText;
          Nvidia.generateText = async (prompt: string) => {
               return [
                    {
                         role: "assistant",
                         content: `Assistant response to: ${prompt}`,
                    },
               ];
          };

          try {
               // Step 2: Send a chat request with conversationId
               console.log("📤 Step 1: Sending chat request...");
               const chatPayload = {
                    model: testModel,
                    messages: [
                         { role: "user", content: "Test message for history" },
                    ],
                    conversationId: testConversationId,
               };

               const chatResponse = await app.request("/chat/completions", {
                    method: "POST",
                    body: JSON.stringify(chatPayload),
                    headers: { "Content-Type": "application/json" },
               });

               expect(chatResponse.status).toBe(200);
               const chatResult = await chatResponse.json();
               console.log("✅ Chat response received");

               // Step 3: Fetch conversation history
               console.log("\n📥 Step 2: Fetching conversation history...");
               const historyResponse = await app.request(
                    `/chat/conversations/${testConversationId}`,
                    { method: "GET" },
               );

               expect(historyResponse.status).toBe(200);
               const history = await historyResponse.json();
               console.log("✅ History retrieved");

               // Step 4: Verify history structure and content
               expect(history).toHaveProperty("history");
               expect(Array.isArray(history.history)).toBe(true);
               expect(history.history.length).toBe(2); // User + Assistant message

               const userMessage = history.history[0];
               const assistantMessage = history.history[1];

               expect(userMessage.role).toBe("user");
               expect(userMessage.content).toBe("Test message for history");
               expect(userMessage.conversationId).toBe(testConversationId);

               expect(assistantMessage.role).toBe("assistant");
               expect(assistantMessage.content).toContain(
                    "Assistant response to:",
               );
               expect(assistantMessage.conversationId).toBe(testConversationId);

               // Step 5: Direct database verification
               console.log("\n🗄️ Step 3: Verifying database...");
               const dbCheck = await db
                    .select()
                    .from(messages)
                    .where(eq(messages.conversationId, testConversationId));
               expect(dbCheck.length).toBe(2);
               console.log("✅ Database verification passed");
          } finally {
               // Restore original function
               Nvidia.generateText = originalGenerateText;
          }
     });

     it("should create conversation if it does not exist", async () => {
          const newConversationId = "chatcmpl-NEWCONV789";

          console.log("\n=== Testing New Conversation Creation ===\n");

          // Mock provider
          const originalGenerateText = Nvidia.generateText;
          Nvidia.generateText = async () => [
               { role: "assistant", content: "Hi" },
          ];

          try {
               const payload = {
                    model: testModel,
                    messages: [
                         { role: "user", content: "Creating new conversation" },
                    ],
                    conversationId: newConversationId,
               };

               const response = await app.request("/chat/completions", {
                    method: "POST",
                    body: JSON.stringify(payload),
                    headers: { "Content-Type": "application/json" },
               });

               expect(response.status).toBe(200);

               // Check conversation was created
               const conv = await db
                    .select()
                    .from(conversations)
                    .where(eq(conversations.conversationId, newConversationId));
               expect(conv.length).toBe(1);
               expect(conv[0].title).toBe("Creating new conversation");

               // Cleanup
               await db
                    .delete(messages)
                    .where(eq(messages.conversationId, newConversationId));
               await db
                    .delete(conversations)
                    .where(eq(conversations.conversationId, newConversationId));
          } finally {
               Nvidia.generateText = originalGenerateText;
          }
     });

     it("should reject invalid conversationId format", async () => {
          const invalidPayload = {
               model: testModel,
               messages: [{ role: "user", content: "Test" }],
               conversationId: "invalid-format",
          };

          const response = await app.request("/chat/completions", {
               method: "POST",
               body: JSON.stringify(invalidPayload),
               headers: { "Content-Type": "application/json" },
          });

          expect(response.status).toBe(400); // Should fail validation
     });
});
