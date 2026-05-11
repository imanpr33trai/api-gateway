// tests/responses-new.test.ts
import { describe, expect, test, beforeAll, mock, spyOn } from "bun:test";
import { Hono } from "hono";
import { ResponsesController } from "../src/controllers/responses-controller";
import { ProviderService } from "../src/services/provider-service";
import { ResponsesToOpenAIConverter } from "../src/converters/responses-to-openai";

// Test configuration
const TEST_MODEL = "openai/gpt-oss-120b";

describe("Responses Controller - Hono", () => {
  let app: Hono;
  let providerService: ProviderService;
  let converter: ResponsesToOpenAIConverter;
  let responsesController: ResponsesController;

  beforeAll(() => {
    // Initialize services
    providerService = new ProviderService();
    converter = new ResponsesToOpenAIConverter({
      defaultModel: TEST_MODEL,
      modelMap: {},
    });
    responsesController = new ResponsesController(providerService, converter);

    // Mock the provider service to avoid real API calls
    const mockResponse = {
      id: "chatcmpl-mock-123",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: TEST_MODEL,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! I'm doing well, thank you for asking.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    };

    // Mock the chatCompletion method
    providerService.chatCompletion = mock(() => Promise.resolve(mockResponse));

    // Create Hono app with controller
    app = new Hono();
    app.post("/v1/responses", responsesController.createResponse.bind(responsesController));
  });

  test("should create response with valid input", async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Hello, how are you?",
            },
          ],
        },
      ],
    };

    const res = await app.request("/v1/responses", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("object", "response");
    expect(body).toHaveProperty("output");
    expect(body.status).toBe("completed");
  });

  test("should handle error gracefully", async () => {
    // Create a controller that will throw an error
    const errorProviderService = new ProviderService();
    errorProviderService.chatCompletion = mock(() => 
      Promise.reject(new Error("Provider unavailable"))
    );
    
    const errorController = new ResponsesController(errorProviderService, converter);
    const errorApp = new Hono();
    errorApp.post("/v1/responses", errorController.createResponse.bind(errorController));

    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Test" }],
        },
      ],
    };

    const res = await errorApp.request("/v1/responses", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error.code).toBe("provider_error");
  });

  test("should have correct Hono response format", async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Test" }],
        },
      ],
    };

    const res = await app.request("/v1/responses", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    // Should return proper Response object
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("should call provider service with converted request", async () => {
    const payload = {
      model: TEST_MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "What is 2+2?" }],
        },
      ],
      temperature: 0.7,
      max_output_tokens: 100,
    };

    await app.request("/v1/responses", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    // Verify the provider service was called
    expect(providerService.chatCompletion).toHaveBeenCalled();
  });
});
