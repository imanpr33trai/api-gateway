# Ollama Integration Guide

## Overview

This guide explains how to integrate Ollama with the API Gateway to enable local LLM serving capabilities.

## Architecture

The integration follows the same pattern as the existing Nvidia provider but is adapted for Ollama:

1. **Provider Layer**: Ollama provider that handles direct communication with the Ollama API
2. **Service Layer**: Conversion services that translate between OpenAI and Ollama formats
3. **Controller Layer**: Request/response handling for the API endpoints
4. **Routing Layer**: API endpoints for chat completions and model management

## Implementation Details

### 1. Provider Layer (`src/providers/ollama.ts`)

The Ollama provider handles direct communication with the Ollama API:

```typescript
const BASE_URL = "http://localhost:11434";

export const Ollama = {
    async chat(req: ChatCompletionRequest): Promise<Response> {
        // Convert the request to Ollama format
        const ollamaRequest = this.convertToOllamaFormat(req);
        
        const response = await fetch(`${BASE_URL}/api/chat`, {
            method: "POST",
            body: JSON.stringify(ollamaRequest),
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return response;
    },

    getAllModels(): Promise<Response> {
        return fetch(`${BASE_URL}/api/tags`);
    },
};
```

### 2. Service Layer (`src/services/ollama.service.ts`)

The service layer handles conversion between OpenAI and Ollama formats:

- `fromChatRequest`: Converts OpenAI ChatCompletion request to Ollama ChatRequest
- `toChatCompletion`: Converts Ollama ChatResponse to OpenAI ChatCompletion
- `toChatCompletionChunk`: Converts Ollama ChatResponse to OpenAI ChatCompletionChunk for streaming

### 3. Controller Layer (`src/controller/ollama.controller.ts`)

The controller handles the API endpoints for Ollama:

- Processes incoming requests and converts them to Ollama format
- Handles both streaming and non-streaming responses
- Proper error handling and validation

### 4. Routing (`src/routes/ollama.ts`)

The routing layer defines the API endpoints:

```typescript
import { Hono } from "hono";
import { ollamaChatController } from "../controller/ollama.controller";

export const ollamaRoute = new Hono();

ollamaRoute.post("/chat/completions", ollamaChatController);
```

## Key Features

1. **Format Conversion**: Seamless conversion between OpenAI and Ollama formats
2. **Streaming Support**: Full support for streaming responses
3. **Error Handling**: Comprehensive error handling and validation
4. **Tool Support**: Support for function calling and tool usage
5. **Reasoning Support**: Support for thinking/reasoning features

## Usage

To use the Ollama integration:

1. Start the Ollama service on port 11434
2. Make requests to `/v1/ollama/chat/completions` with OpenAI-compatible payloads
3. Receive responses in OpenAI format

Example request:
```json
{
  "model": "llama3",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false
}
```

## Configuration

The Ollama provider connects to `http://localhost:11434` by default. This can be configured by modifying the `BASE_URL` constant in `src/providers/ollama.ts`.