# Codex-to-Ollama-to-NVIDIA API Gateway - Issues and Analysis

## Overview

This document analyzes the API differences between NVIDIA NIM (NVIDIA Inference Manager), Ollama, and Codex, documenting the issues encountered when creating an API gateway that allows agentic CLIs designed for Ollama to connect to NVIDIA's models.

The gateway enables agentic CLIs (like Codex CLI) that can connect to Ollama but not directly to NVIDIA's API to use NVIDIA's models through the Ollama-compatible endpoint.

## Project Context

**Key Repositories:**
- **Codex**: OpenAI's autonomous coding agent (https://github.com/sourcegraph/codex)
- **Ollama**: Local LLM runtime (https://github.com/ollama/ollama)
- **NVIDIA NIM**: NVIDIA's inference API (https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-120b-infer)

**Codex-to-Ollama Architecture (from codex-rs):**
1. Rust Client (`codex-rs/ollama/src/client.rs`) - Manages model listing, pulling, version checking
2. OpenAI Compatibility Layer (`openai.go`) - Transforms OpenAI API format to Ollama's native format
3. Responses API Layer (`responses.go`) - Handles the newer Responses API format

## API Comparison

### Endpoint Differences

| Feature | NVIDIA NIM | Ollama | Codex (via codex-rs) |
|---------|------------|--------|----------------------|
| Chat Endpoint | `/v1/chat/completions` | `/api/chat` | Uses OpenAI compat layer |
| Models Endpoint | `/v1/models` | `/api/tags` | `/api/tags` or `/v1/models` |
| Embeddings | `/v1/embeddings` | `/api/embed` | `/api/embed` |
| Responses API | `/v1/responses` | Not native | Custom conversion required |
| Version Endpoint | N/A | `/api/version` | Uses for feature detection |
| Pull Model | N/A | `/api/pull` | Supported in Rust client |

**Key Discovery from Codex:**
- Codex uses dual-mode detection: checks if URL contains `/v1` to determine OpenAI compatibility
- From `codex-rs/ollama/src/client.rs` line 65:
  ```go
  uses_openai_compat := is_openai_compatible_base_url(base_url)
  ```

### Request Parameter Mapping Issues

#### 1. Max Tokens Mapping

**Issue**: `max_tokens` parameter name differs

- **NVIDIA/OpenAI**: `max_tokens`
- **Ollama**: `num_predict`

```typescript
// In fromChatRequest()
if (req.max_tokens !== undefined) {
    options.num_predict = req.max_tokens;
}
```

#### 2. Temperature Default

**Issue**: Different default values

- **NVIDIA**: No explicit default (model-dependent)
- **Ollama**: Default is `1.0` but needs explicit setting

```typescript
// Workaround in ollama.service.ts
if (req.temperature !== undefined) {
    options.temperature = req.temperature;
} else {
    options.temperature = 1.0; // Must set default
}
```

#### 3. Response Format (JSON Schema)

**Issue**: Different format specification

- **NVIDIA**: Uses `response_format` with `type: "json_schema"`
- **Ollama**: Uses `format` with nested schema object

```typescript
// NVIDIA format
{
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "my_schema",
            "schema": { ... }
        }
    }
}

// Ollama format
{
    "format": {
        "type": "json_schema",
        "name": "my_schema",
        "schema": { ... }
    }
}
```

#### 4. Reasoning/Thinking Feature

**Issue**: Different parameter names

- **NVIDIA**: Uses `reasoning_effort` (none, low, medium, high)
- **Ollama**: Uses `think` (boolean or "high", "medium", "low")

```typescript
// Conversion in ollama.service.ts
let think: boolean | "high" | "medium" | "low" | undefined;
if (req.reasoning_effort) {
    if (req.reasoning_effort === "none") {
        think = false;
    } else {
        think = req.reasoning_effort as "high" | "medium" | "low";
    }
}
```

### Response Format Differences

#### 1. Chat Completion Response

**NVIDIA Response**:
```json
{
    "id": "chatcmpl-xxx",
    "object": "chat.completion",
    "created": 1234567890,
    "model": "gpt-oss-120b",
    "choices": [{
        "index": 0,
        "message": {
            "role": "assistant",
            "content": "..."
        },
        "finish_reason": "stop"
    }],
    "usage": {
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "total_tokens": 150
    }
}
```

**Ollama Response**:
```json
{
    "model": "llama3.1:70b",
    "message": {
        "role": "assistant",
        "content": "..."
    },
    "done": true,
    "prompt_eval_count": 100,
    "eval_count": 50
}
```

#### 2. Thinking/Reasoning in Response

**Ollama specific field**:
```json
{
    "message": {
        "content": "Final answer",
        "thinking": "Reasoning process..."
    }
}
```

**NVIDIA** does not have a separate thinking field - reasoning is embedded in content or uses `reasoning` content type.

#### 3. Tool Calls Format

**NVIDIA**:
```json
{
    "tool_calls": [
        {
            "id": "call_abc123",
            "type": "function",
            "function": {
                "name": "get_weather",
                "arguments": "{\"location\": \"NYC\"}"
            }
        }
    ]
}
```

**Ollama**:
```json
{
    "tool_calls": [
        {
            "function": {
                "name": "get_weather",
                "arguments": {"location": "NYC"}
            }
        }
    ]
}
```

Note: Ollama lacks the `id` and `type` fields on tool calls.

### Streaming Differences

#### SSE Format

Both use Server-Sent Events but with subtle differences:

- **NVIDIA**: Standard OpenAI SSE format
- **Ollama**: Custom SSE with different field names

```typescript
// ollama.service.ts - streaming conversion
export function ollamaToSSEMessage(chunk: ChatCompletionChunk): string {
    const data = JSON.stringify(chunk);
    return `data: ${data}\n\n`;
}

export function createSSEDone(): string {
    return "data: [DONE]\n\n";
}
```

### Known Issues and Limitations

#### 1. Model Name Mapping

**Issue**: NVIDIA model names differ from Ollama model names

- NVIDIA: `meta/llama-3.1-70b-instruct`
- Ollama: `llama3.1:70b`

The gateway needs a mapping or prefix system to route requests correctly.

#### 2. Missing Fields

**Issue**: Some OpenAI fields not supported by Ollama

- `frequency_penalty` - Partial support in Ollama
- `presence_penalty` - Partial support in Ollama
- `logprobs` - Limited support
- `top_logprobs` - Not fully supported
- `seed` - Not supported in all models

#### 3. Error Response Format

**NVIDIA**:
```json
{
    "error": {
        "message": "Error description",
        "type": "invalid_request_error",
        "code": "invalid_api_key"
    }
}
```

**Ollama**:
```json
{
    "error": "Error description"
}
```

#### 4. Authentication

- **NVIDIA**: Requires API key (`nv-api-key` header)
- **Ollama**: No authentication by default (or uses `Authorization` header)

#### 5. Version Requirements

**Issue**: Different API versions

- **NVIDIA NIM**: Requires specific NIM version for each model
- **Ollama**: Version 0.13.4+ for Responses API support

#### 6. Responses API Compatibility

The OpenAI Responses API (`/v1/responses`) is not natively supported by Ollama. The gateway must convert:

1. **Request**: Responses API format → Ollama Chat format
2. **Response**: Ollama Chat format → Responses API format

```typescript
// Conversion challenges:
// - Responses API uses "input" array vs "messages"
// - Responses API has "instructions" vs "system" role
// - Responses API has "reasoning" items vs thinking field
// - Responses API has complex tool call handling
```

### Architecture Issues in Current Implementation

#### 1. Type Import Conflicts

The project had issues with type-only imports in `chat.ts` and `responses.ts`:

```typescript
// Problem: Regular import used where type-only import needed
import { ChatCompletionMessage } from "./chat"; // ❌
import type { ChatCompletionMessage } from "./chat"; // ✅
```

#### 2. Duplicate Type Definitions

Multiple files defined similar types:
- `src/types/ollama.type.ts`
- `src/types/responses.types.ts`
- `src/types/new-respo.types.ts`
- `src/types/nvidia.types.ts`

These were consolidated into:
- `src/types/common.ts` - Common/shared types
- `src/types/chat.ts` - Chat Completions API types
- `src/types/responses.ts` - Responses API types
- `src/types/ollama.ts` - Ollama-specific types
- `src/types/index.ts` - Main exports

#### 3. Service Import Updates Needed

After type reorganization, these files needed import updates:
- `src/services/ollama.service.ts`
- `src/services/response.service.ts`
- `src/controller/responses.controller.ts`
- `tests/responses.test.ts`

### Recommendations

1. **Model Mapping Registry**: Create a mapping between NVIDIA model names and Ollama model names
2. **Feature Detection**: Check model capabilities before using features like thinking/reasoning
3. **Error Normalization**: Create unified error handling that works with both APIs
4. **Version Checks**: Add API version detection for feature compatibility
5. **Streaming Robustness**: Handle edge cases in streaming responses
6. **Testing**: Add comprehensive tests for API conversion edge cases

## References

- NVIDIA NIM API: https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-120b-infer
- Ollama API: https://docs.ollama.com/api/chat
- Ollama GitHub: https://github.com/ollama/ollama
- OpenAI Chat API: https://platform.openai.com/docs/api-reference/chat
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
