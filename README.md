# API Gateway

A multi-provider API gateway that supports both OpenAI Chat Completions API (old style) and OpenAI Responses API (new style).

## Architecture

```
Client (Codex/Tool)
    |
    v
+-------------------+
|   Controllers     |
| /v1/responses   | -> ResponsesController
| /v1/chat/       | -> ChatController  
| completions       |
| /v1/models       | -> ModelsController
+-------------------+
    |
    v
+-------------------+
|     Converters     |
| responses-to-     |
| openai.ts        | -> Responses API <-> OpenAI format
+-------------------+
    |
    v
+-------------------+
|     Services       |
| provider-service  | -> Business logic
+-------------------+
    |
    v
+-------------------+
|    Providers       |
| nvidia (default) | -> OpenAI compatible
| (future: openai, |    /v1/chat/completions
|  anthropic...)   |    /v1/models
+-------------------+
```

## Key Components

### 1. Converters (`src/converters/`)
- **responses-to-openai.ts**: THE KEY CONVERTER
  - Takes Responses API request -> converts to OpenAI Chat Completions format
  - Takes OpenAI response -> converts to Responses API format
  - Acts as middleware between the two API styles

### 2. Controllers (`src/controllers/`)
- **responses-controller.ts**: Handles `/v1/responses` (new API style)
- **chat-controller.ts**: Handles `/v1/chat/completions` (old API style)
- **models-controller.ts**: Handles `/v1/models`

### 3. Services (`src/services/`)
- **provider-service.ts**: Business logic for provider operations
  - `chatCompletion()`: Non-streaming requests
  - `streamChatCompletion()`: Streaming requests
  - `listModels()`: List available models

### 4. Providers (`src/providers/`)
- Currently supports **NVIDIA** (OpenAI compatible)
- Can be extended to support other providers (OpenAI, Anthropic, etc.)

### 5. Types (`src/types/`)
- **responses.ts**: Responses API types (Zod schemas)
- **chat.ts**: Chat Completions API types (Zod schemas)
- **common.ts**: Shared types (enums, common interfaces)
- **ollama.ts**: Ollama-specific types

## API Endpoints

### Old Style (Chat Completions API)
- `POST /v1/chat/completions` - Chat completions (pass-through for OpenAI-compatible providers)
- `GET /v1/models` - List available models

### New Style (Responses API)
- `POST /v1/responses` - Create response (uses converter middleware)
- `GET /v1/responses/{id}` - Retrieve response (future)

## Usage

### Environment Variables
```
NVIDIA_API_KEY=your_nvidia_api_key
PORT=11434
DEFAULT_MODEL=nvidia/llama-3.1-nemotron-70b-instruct
MODEL_MAP={"gpt-4": "openai/gpt-4"}
```

### Start Server
```bash
bun run src/index.ts
```

### Connect Codex
```bash
codex --oss --provider-base-url http://localhost:11434
```

## Converter Flow

The **responses-to-openai.ts** converter enables:

1. **Request Flow**: Responses API request -> Converter -> OpenAI format -> Provider (NVIDIA)
2. **Response Flow**: Provider (NVIDIA) -> OpenAI format -> Converter -> Responses API response

This allows clients to use the new Responses API while providers only need to support the older Chat Completions API.

## Testing

```bash
bun test tests/converter.test.ts
```

## Future Extensions

- Add more providers (OpenAI, Anthropic, Google, etc.)
- Add response retrieval endpoint (`GET /v1/responses/{id}`)
- Add support for NVIDIA's `/v1/generate` endpoint
- Add middleware for request/response logging
- Add rate limiting and caching
