# API Gateway - Scaling Guide

> How to organize, extend, and scale this multi-provider AI gateway project.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Directory Structure](#directory-structure)
3. [Adding New Providers](#adding-new-providers)
4. [Adding Tools/Function Calling](#adding-toolsfunction-calling)
5. [Adding New API Endpoints](#adding-new-api-endpoints)
6. [Scaling Patterns](#scaling-patterns)
7. [Configuration Management](#configuration-management)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Considerations](#deployment-considerations)

---

## Current Architecture

```
Client Request
      ↓
[Route] Hono Router
      ↓
[Controller] Request validation, response formatting
      ↓
[Service] Business logic, provider selection, format conversion
      ↓
[Provider] API client (Ollama, Nvidia, etc.)
      ↓
Upstream AI Provider
```

### Technology Stack

- **Runtime**: Bun
- **Framework**: Hono (HTTP)
- **Validation**: Zod
- **Providers**: Ollama, Nvidia (extensible)

---

## Directory Structure

```
src/
├── index.ts                 # Entry point, server setup
├── constants.ts             # Global constants
│
├── routes/                  # API route definitions
│   ├── chat.ts             # /v1/chat/completions
│   ├── responses.ts        # /v1/responses
│   ├── models.ts           # /v1/models
│   └── ollama.ts           # Ollama native endpoints
│
├── controller/             # Request handlers (thin layer)
│   ├── chat.controller.ts
│   ├── responses.controller.ts
│   └── ...
│
├── services/               # Business logic (thick layer)
│   ├── chat.service.ts
│   ├── response.service.ts
│   ├── model.service.ts
│   └── ...
│
├── providers/              # Provider implementations
│   ├── types.ts           # Shared provider types/schemas
│   ├── ollama.ts          # Ollama provider
│   ├── nvidia.ts          # Nvidia provider
│   └── [new-provider].ts  # Template for new providers
│
├── types/                  # Domain types & Zod schemas
│   ├── responses.types.ts
│   ├── ollama.type.ts
│   └── ...
│
├── middleware/             # Express middleware
│   └── error.middleware.ts
│
└── utils/                  # Utility functions
    ├── errorHandler.ts
    ├── parseChunk.ts
    └── ...
```

### Scaling the Structure

As the project grows, organize by **feature** rather than **layer**:

```
src/
├── features/
│   ├── chat/
│   │   ├── routes.ts
│   │   ├── controller.ts
│   │   ├── service.ts
│   │   └── types.ts
│   │
│   ├── responses/
│   │   ├── routes.ts
│   │   ├── controller.ts
│   │   ├── service.ts
│   │   └── types.ts
│   │
│   └── [new-feature]/
│       ├── ...
│
├── shared/                 # Shared across features
│   ├── providers/
│   ├── middleware/
│   ├── utils/
│   └── types/
│
└── index.ts
```

---

## Adding New Providers

### Step 1: Create Provider File

Create `src/providers/[provider-name].ts`:

```typescript
import { type ChatCompletionRequest } from "./types";

const BASE_URL = process.env.[PROVIDER]_BASE_URL || "https://api.[provider].com/v1";

export const [ProviderName] = {
    /**
     * Chat completion - calls /chat/completions endpoint
     */
    async chat(req: ChatCompletionRequest): Promise<Response> {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: "POST",
            body: JSON.stringify(req),
            headers: {
                Authorization: `Bearer ${process.env.[PROVIDER]_API_KEY}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return response;
    },

    /**
     * List available models
     */
    async getAllModels(): Promise<Response> {
        const response = await fetch(`${BASE_URL}/models`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return response;
    },
};
```

### Step 2: Add Provider to Service

In your service file (e.g., `src/services/response.service.ts`):

```typescript
import { [ProviderName] } from "../providers/[provider-name]";

// Add provider type
export type ResponsesProvider = "nvidia" | "ollama" | "[provider-name]";

// Add provider selection logic
function getResponsesProvider(): ResponsesProvider {
    const provider = process.env.RESPONSES_PROVIDER?.toLowerCase();
    if (provider === "[provider-name]") return "[provider-name]";
    if (provider === "ollama") return "ollama";
    return "nvidia"; // default
}

// Add conversion functions for the new provider
function responsesTo[ProviderName]Request(req: ResponsesRequest) {
    // Convert Responses API format to provider format
}

function [ProviderName]ToResponses(response: any, request: ResponsesRequest) {
    // Convert provider response to Responses API format
}
```

### Step 3: Update Environment Variables

Add to `.env.example`:

```bash
# [Provider Name]
[PROVIDER]_API_KEY=your_api_key_here
[PROVIDER]_BASE_URL=https://api.[provider].com/v1
```

### Step 4: Register Provider in Main Entry

If using dependency injection:

```typescript
// src/providers/index.ts
export * from "./ollama";
export * from "./nvidia";
export * from "./[provider-name]";
```

---

## Adding Tools/Function Calling

### Step 1: Define Tool Schema

In `src/types/tools.types.ts`:

```typescript
import { z } from "zod";

export const ToolSchema = z.object({
    type: z.literal("function"),
    name: z.string(),
    description: z.string(),
    strict: z.boolean().optional(),
    parameters: z.record(z.string, z.unknown()),
});

export type Tool = z.infer<typeof ToolSchema>;
```

### Step 2: Create Tool Executor

In `src/services/tool-executor.service.ts`:

```typescript
import { z } from "zod";

type ToolExecutor = (args: any) => Promise<any>;

const toolRegistry: Record<string, ToolExecutor> = {
    // Register your tools here
    "get_weather": async ({ location }) => {
        // Call weather API
        return { temperature: 72, condition: "sunny" };
    },
    
    "shell": async ({ command }) => {
        // Execute shell command (use with caution!)
        const { stdout } = await new Deno.Command("sh", { args: ["-c", command] }).output();
        return { output: new TextDecoder().decode(stdout) };
    },
};

export async function executeTool(name: string, args: any): Promise<any> {
    const executor = toolRegistry[name];
    if (!executor) {
        throw new Error(`Unknown tool: ${name}`);
    }
    return executor(args);
}

export function registerTool(name: string, executor: ToolExecutor) {
    toolRegistry[name] = executor;
}
```

### Step 3: Add Tool Support to Provider

Update your provider to pass tools:

```typescript
// In provider's chat function
async chat(req: ChatCompletionRequest): Promise<Response> {
    const body = {
        ...req,
        // Provider-specific tool format
        tools: req.tools?.map(t => ({
            type: "function",
            function: {
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
            },
        })),
    };
    
    // ... make request
}
```

### Step 4: Handle Tool Calls in Service

```typescript
// In response.service.ts
async function handleToolCalls(toolCalls: any[], req: ResponsesRequest) {
    const outputs: ResponsesOutputItem[] = [];
    
    for (const toolCall of toolCalls) {
        const result = await executeTool(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments)
        );
        
        outputs.push({
            type: "function_call_output",
            call_id: toolCall.id,
            output: JSON.stringify(result),
        } as any);
    }
    
    return outputs;
}
```

---

## Adding New API Endpoints

### Example: Adding /v1/embeddings

#### 1. Create Types

`src/types/embeddings.types.ts`:

```typescript
import { z } from "zod";

export const EmbeddingsRequestSchema = z.object({
    model: z.string(),
    input: z.union([z.string(), z.array(z.string())]),
    encoding_format: z.enum(["float", "base64"]).default("float"),
    dimensions: z.number().optional(),
    user: z.string().optional(),
});

export type EmbeddingsRequest = z.infer<typeof EmbeddingsRequestSchema>;

export const EmbeddingsResponseSchema = z.object({
    object: z.literal("list"),
    data: z.array(z.object({
        object: z.literal("embedding"),
        embedding: z.array(z.number()),
        index: z.number(),
    })),
    model: z.string(),
    usage: z.object({
        prompt_tokens: z.number(),
        total_tokens: z.number(),
    }),
});

export type EmbeddingsResponse = z.infer<typeof EmbeddingsResponseSchema>;
```

#### 2. Create Service

`src/services/embeddings.service.ts`:

```typescript
import { Ollama } from "../providers/ollama";
import { Nvidia } from "../providers/nvidia";
import type { EmbeddingsRequest, EmbeddingsResponse } from "../types/embeddings.types";

export async function createEmbeddings(req: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    const provider = process.env.EMBEDDINGS_PROVIDER || "ollama";
    
    if (provider === "ollama") {
        // Call Ollama embeddings API
        const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/embeddings`, {
            method: "POST",
            body: JSON.stringify({ model: req.model, prompt: req.input }),
            headers: { "Content-Type": "application/json" },
        });
        
        const data = await response.json();
        return {
            object: "list",
            data: [{
                object: "embedding",
                embedding: data.embedding,
                index: 0,
            }],
            model: req.model,
            usage: { prompt_tokens: 0, total_tokens: 0 },
        };
    }
    
    // ... other providers
    throw new Error(`Unsupported provider: ${provider}`);
}
```

#### 3. Create Controller

`src/controller/embeddings.controller.ts`:

```typescript
import type { Context } from "hono";
import { EmbeddingsRequestSchema } from "../types/embeddings.types";
import { createEmbeddings } from "../services/embeddings.service";
import { ValidationError } from "../types/error.type";

export const embeddingsController = async (c: Context) => {
    const body = await c.req.json();
    const parsed = EmbeddingsRequestSchema.safeParse(body);
    
    if (!parsed.success) {
        throw new ValidationError("Invalid request", { issues: parsed.error.issues });
    }
    
    const result = await createEmbeddings(parsed.data);
    return c.json(result);
};
```

#### 4. Create Route

`src/routes/embeddings.ts`:

```typescript
import { Hono } from "hono";
import { embeddingsController } from "../controller/embeddings.controller";

export const embeddingsRoute = new Hono();

embeddingsRoute.post("/embeddings", embeddingsController);
```

#### 5. Register in Main

`src/index.ts`:

```typescript
import { embeddingsRoute } from "./routes/embeddings";

// Mount the route
app.route("/v1", embeddingsRoute);
```

---

## Scaling Patterns

### 1. Provider Abstraction

Create a unified interface for all providers:

```typescript
// src/providers/base.ts
export interface AIProvider {
    name: string;
    
    chat(req: ChatCompletionRequest): Promise<Response>;
    
    chatStream(req: ChatCompletionRequest): Promise<ReadableStream>;
    
    getModels(): Promise<string[]>;
    
    embed(req: EmbeddingsRequest): Promise<number[][]>;
}

// src/providers/registry.ts
const providers: Map<string, AIProvider> = new Map();

export function registerProvider(name: string, provider: AIProvider) {
    providers.set(name, provider);
}

export function getProvider(name?: string): AIProvider {
    const providerName = name || process.env.DEFAULT_PROVIDER || "ollama";
    const provider = providers.get(providerName);
    if (!provider) throw new Error(`Unknown provider: ${providerName}`);
    return provider;
}
```

### 2. Rate Limiting

```typescript
// src/middleware/rate-limit.middleware.ts
import { createHash } from "crypto";

interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}

const requests = new Map<string, { count: number; resetTime: number }>();

export function rateLimit({ windowMs, maxRequests }: RateLimitConfig) {
    return async (c: Context, next: () => Promise<void>) => {
        const key = c.req.header("x-api-key") || c.req.header("x-forwarded-for") || "anonymous";
        const now = Date.now();
        
        let record = requests.get(key);
        if (!record || now > record.resetTime) {
            record = { count: 0, resetTime: now + windowMs };
            requests.set(key, record);
        }
        
        record.count++;
        
        if (record.count > maxRequests) {
            return c.text("Rate limit exceeded", 429);
        }
        
        await next();
    };
}
```

### 3. Caching

```typescript
// src/utils/cache.ts
interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return undefined;
    }
    
    return entry.value;
}

export function setCache<T>(key: string, value: T, ttlSeconds: number = 300) {
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
    });
}
```

### 4. Circuit Breaker

```typescript
// src/utils/circuit-breaker.ts
class CircuitBreaker {
    private failures = 0;
    private state: "closed" | "open" | "half-open" = "closed";
    private nextAttempt = 0;
    
    constructor(
        private threshold: number = 5,
        private resetTimeout: number = 30000
    ) {}
    
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === "open") {
            if (Date.now() < this.nextAttempt) {
                throw new Error("Circuit breaker is open");
            }
            this.state = "half-open";
        }
        
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    private onSuccess() {
        this.failures = 0;
        this.state = "closed";
    }
    
    private onFailure() {
        this.failures++;
        if (this.failures >= this.threshold) {
            this.state = "open";
            this.nextAttempt = Date.now() + this.resetTimeout;
        }
    }
}
```

### 5. Request Batching

```typescript
// src/utils/batcher.ts
type BatchItem<T> = { resolve: (value: T) => void; reject: (error: Error) => void };

export class Batcher<T> {
    private queue: BatchItem<T>[] = [];
    private processing = false;
    
    constructor(
        private batchSize: number,
        private delayMs: number,
        private processFn: (count: number) => Promise<T[]>
    ) {}
    
    async add(): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject });
            this.schedule();
        });
    }
    
    private schedule() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        setTimeout(async () => {
            const items = this.queue.splice(0, this.batchSize);
            try {
                const results = await this.processFn(items.length);
                items.forEach((item, i) => item.resolve(results[i]));
            } catch (error) {
                items.forEach(item => item.reject(error as Error));
            }
            this.processing = false;
            this.schedule();
        }, this.delayMs);
    }
}
```

---

## Configuration Management

### Environment Variables

```bash
# .env.example

# Server
PORT=3000
NODE_ENV=development

# Default Provider
DEFAULT_PROVIDER=ollama

# Ollama
OLLAMA_BASE_URL=http://localhost:11434

# Nvidia
NVIDIA_API_KEY=your_nvidia_api_key

# [New Provider]
# PROVIDER_API_KEY=your_api_key
# PROVIDER_BASE_URL=https://api.provider.com/v1

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Cache
CACHE_TTL_SECONDS=300
```

### Configuration Object

```typescript
// src/config.ts
import { z } from "zod";

const ConfigSchema = z.object({
    port: z.number().default(3000),
    nodeEnv: z.enum(["development", "production", "test"]).default("development"),
    
    providers: z.object({
        default: z.string(),
        ollama: z.object({
            baseUrl: z.string().default("http://localhost:11434"),
        }),
        nvidia: z.object({
            apiKey: z.string().optional(),
        }),
    }),
    
    rateLimit: z.object({
        windowMs: z.number().default(60000),
        maxRequests: z.number().default(100),
    }),
    
    cache: z.object({
        ttlSeconds: z.number().default(300),
    }),
});

export const config = ConfigSchema.parse({
    port: parseInt(process.env.PORT || "3000"),
    nodeEnv: process.env.NODE_ENV || "development",
    
    providers: {
        default: process.env.DEFAULT_PROVIDER || "ollama",
        ollama: {
            baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        },
        nvidia: {
            apiKey: process.env.NVIDIA_API_KEY,
        },
    },
    
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
    },
    
    cache: {
        ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || "300"),
    },
});
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/providers/ollama.test.ts
import { describe, test, expect, beforeAll } from "bun:test";
import { Ollama } from "../../src/providers/ollama";

describe("Ollama Provider", () => {
    test("should convert messages to Ollama format", () => {
        const messages = [
            { role: "user", content: "Hello" }
        ];
        
        const result = Ollama.convertMessagesToOllama(messages);
        
        expect(result).toEqual([
            { role: "user", content: "Hello" }
        ]);
    });
    
    test("should handle tool calls", () => {
        const messages = [
            {
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_123",
                        type: "function",
                        function: {
                            name: "get_weather",
                            arguments: '{"location": "NYC"}'
                        }
                    }
                ]
            }
        ];
        
        const result = Ollama.convertMessagesToOllama(messages);
        
        expect(result[0].tool_calls).toHaveLength(1);
        expect(result[0].tool_calls[0].function.name).toBe("get_weather");
    });
});
```

### Integration Tests

```typescript
// tests/integration/responses.test.ts
import { describe, test, expect, beforeAll } from "bun:test";

describe("Responses API", () => {
    const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
    
    test("should create a response", async () => {
        const response = await fetch(`${baseUrl}/v1/responses`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama3.2:3b",
                input: "Hello",
                stream: false,
            }),
        });
        
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.id).toBeDefined();
        expect(data.output).toBeDefined();
    });
});
```

---

## Deployment Considerations

### Docker

```dockerfile
# Dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  api-gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - OLLAMA_BASE_URL=http://ollama:11434
      - NVIDIA_API_KEY=${NVIDIA_API_KEY}
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama
    volumes:
      - ollama-data:/root/.ollama
    ports:
      - "11434:11434"

volumes:
  ollama-data:
```

### Health Checks

```typescript
// src/routes/health.ts
import { Hono } from "hono";
import { Ollama } from "../providers/ollama";

export const healthRoute = new Hono();

healthRoute.get("/health", async (c) => {
    const checks: Record<string, any> = {};
    
    // Check Ollama
    try {
        const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`);
        checks.ollama = {
            status: response.ok ? "healthy" : "unhealthy",
            latency: response.headers.get("latency"),
        };
    } catch (error) {
        checks.ollama = { status: "unhealthy", error: (error as Error).message };
    }
    
    const allHealthy = Object.values(checks).every((check: any) => check.status === "healthy");
    
    return c.json({
        status: allHealthy ? "healthy" : "degraded",
        checks,
    }, allHealthy ? 200 : 503);
});
```

---

## Best Practices Summary

1. **Single Responsibility**: Each file does one thing
2. **Dependency Injection**: Pass dependencies, don't import globals
3. **Error Handling**: Centralize in middleware
4. **Type Safety**: Use Zod for all input/output validation
5. **Provider Abstraction**: Always use the provider interface
6. **Configuration**: Use env vars, validate with Zod
7. **Testing**: Unit tests for utilities, integration tests for APIs
8. **Logging**: Log requests and errors appropriately
9. **Rate Limiting**: Protect upstream providers
10. **Circuit Breakers**: Prevent cascade failures

---

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Routes | `[feature].ts` | `responses.ts`, `chat.ts` |
| Controller | `[feature].controller.ts` | `responses.controller.ts` |
| Service | `[feature].service.ts` | `response.service.ts` |
| Types | `[feature].types.ts` | `responses.types.ts` |
| Provider | `[provider].ts` | `ollama.ts`, `nvidia.ts` |
| Middleware | `[name].middleware.ts` | `error.middleware.ts` |
| Utility | `[name].ts` | `parseChunk.ts` |

---

## Quick Start: Adding a Provider

1. **Create** `src/providers/[provider].ts`
2. **Implement** `chat()` and `getAllModels()` methods
3. **Add** provider type to service
4. **Add** conversion functions (request → provider, provider → response)
5. **Update** `.env.example`
6. **Test** with unit tests
7. **Document** in this guide

---

## Next Steps

- [ ] Implement rate limiting middleware
- [ ] Add circuit breakers to providers
- [ ] Set up request caching
- [ ] Add OpenTelemetry tracing
- [ ] Set up Prometheus metrics
- [ ] Add WebSocket support for streaming
- [ ] Implement multi-provider failover

---

*Last updated: 2026-05-06*
