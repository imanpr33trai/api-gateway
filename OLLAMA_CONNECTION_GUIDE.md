# Comprehensive Guide: Implementing Codex-to-Ollama Connection

This guide documents how Codex connects to Ollama, analyzing the endpoints, request/response formats, and the transformation layer between Codex and Ollama.

---

## Architecture Overview

The connection between Codex and Ollama involves three main components:

1. **Ollama Client (Rust)** - Manages model listing, pulling, and version checking
2. **OpenAI Compatibility Layer (Go)** - Transforms OpenAI API format to Ollama's native format
3. **Responses API Layer (Go)** - Handles the newer Responses API format

---

## Part 1: Ollama Native Endpoints (Rust Client)

The Rust client in `codex-rs/ollama/src/client.rs` connects to these native Ollama endpoints:

### 1. Health Check / Server Probing

**Endpoint:** `GET /api/tags` (native) or `GET /v1/models` (OpenAI compat)

**Request:**

```
GET http://localhost:11434/api/tags
```

**Response:**

```json
{
  "models": [
    { "name": "llama3.2:3b", "modified_at": "2024-01-01T00:00:00Z" },
    { "name": "mistral", "modified_at": "2024-01-02T00:00:00Z" }
  ]
}
```

**Code Reference:** `client.rs` lines 80-101 (`probe_server` method)

### 2. List Models

**Endpoint:** `GET /api/tags`

**Request:**

```
GET http://localhost:11434/api/tags
```

**Response:** Same as health check - returns array of model names

**Code Reference:** `client.rs` lines 103-127 (`fetch_models` method)

### 3. Get Version

**Endpoint:** `GET /api/version`

**Request:**

```
GET http://localhost:11434/api/version
```

**Response:**

```json
{
  "version": "0.14.1"
}
```

**Code Reference:** `client.rs` lines 129-153 (`fetch_version` method)

### 4. Pull Model (Streaming)

**Endpoint:** `POST /api/pull`

**Request:**

```json
POST http://localhost:11434/api/pull
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "stream": true
}
```

**Response (Streaming SSE):**

```json
{"status": "pulling manifest"}
{"status": "downloading", "digest": "sha256:abc123", "total": 1000000, "completed": 500000}
{"status": "verifying"}
{"status": "success"}
```

**Code Reference:** `client.rs` lines 155-212 (`pull_model_stream` method)

### 5. Chat Completion (Native API)

**Endpoint:** `POST /api/chat`

**Request:**

```json
POST http://localhost:11434/api/chat
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": false
}
```

**Response:**

```json
{
  "model": "llama3.2:3b",
  "message": {
    "role": "assistant",
    "content": "Hello! How can I help you?"
  },
  "done": true,
  "done_reason": "stop",
  "metrics": {
    "prompt_eval_count": 10,
    "eval_count": 20,
    "prompt_eval_duration": 10000000,
    "eval_duration": 50000000
  }
}
```

---

## Part 2: OpenAI Compatibility Endpoints (Go)

The Go files `openai.go` and `responses.go` implement an OpenAI-compatible API that wraps Ollama. This allows Codex to talk to Ollama using OpenAI-style requests.

### 1. Chat Completions

**Endpoint:** `POST /v1/chat/completions`

**Request (OpenAI format):**

```json
POST http://localhost:11434/v1/chat/completions
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000,
  "tools": [...]
}
```

**Code Reference:** `openai.go` lines 98-117 (`ChatCompletionRequest` struct)

**Transformation:** `FromChatRequest()` converts OpenAI format to Ollama's native `api.ChatRequest`

### 2. Completion (Legacy)

**Endpoint:** `POST /v1/completions`

**Request:**

```json
POST http://localhost:11434/v1/completions
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "prompt": "Once upon a time",
  "stream": false
}
```

**Code Reference:** `openai.go` lines 141-156 (`CompletionRequest` struct)

### 3. Embeddings

**Endpoint:** `POST /v1/embeddings`

**Request:**

```json
POST http://localhost:11434/v1/embeddings
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "input": "The quick brown fox"
}
```

**Code Reference:** `openai.go` lines 83-88 (`EmbedRequest` struct)

### 4. List Models

**Endpoint:** `GET /v1/models`

**Request:**

```
GET http://localhost:11434/v1/models
```

**Response:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "llama3.2:3b",
      "object": "model",
      "created": 1704067200,
      "owned_by": "llama3.2"
    }
  ]
}
```

**Code Reference:** `openai.go` lines 188-193 (`Model` struct), lines 407-423 (`ToListCompletion`)

---

## Part 3: Responses API (Newer Format)

The `responses.go` file implements the newer OpenAI Responses API format.

### 1. Responses Request

**Endpoint:** `POST /v1/responses`

**Request:**

```json
POST http://localhost:11434/v1/responses
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "input": "Hello, how are you?",
  "instructions": "You are a helpful assistant",
  "reasoning": {"effort": "medium"},
  "text": {"format": {"type": "text"}},
  "temperature": 0.7,
  "max_output_tokens": 1000,
  "tools": [...],
  "stream": false
}
```

**Code Reference:** `responses.go` lines 357-402 (`ResponsesRequest` struct)

### 2. Input Content Types

The Responses API supports rich input content:

```go
// Text content
{"type": "input_text", "text": "Hello"}

// Image content
{"type": "input_image", "detail": "high", "image_url": "data:image/png;base64,..."}

// File content
{"type": "input_file", "file_data": "...", "filename": "doc.pdf"}

// Output text (for conversation history)
{"type": "output_text", "text": "Previous assistant message"}
```

**Code Reference:** `responses.go` lines 14-55 (content type definitions)

### 3. Input Items

```go
// Message
{"type": "message", "role": "user", "content": [...]}

// Function call (from assistant)
{"type": "function_call", "call_id": "call_123", "name": "get_weather", "arguments": "{\"city\": \"NYC\"}"}

// Function call output (from tool)
{"type": "function_call_output", "call_id": "call_123", "output": "Sunny, 72F"}

// Reasoning (from previous response)
{"type": "reasoning", "summary": [...], "encrypted_content": "..."}
```

**Code Reference:** `responses.go` lines 148-289 (input item types)

---

## Part 4: Key Request/Response Transformations

### ChatCompletionRequest → api.ChatRequest

```go
// OpenAI format
type ChatCompletionRequest struct {
    Model            string
    Messages         []Message
    Stream           bool
    MaxTokens        *int
    Temperature      *float64
    TopP             *float64
    Tools            []api.Tool
    Reasoning        *Reasoning
    // ...
}

// Ollama native format
type ChatRequest struct {
    Model    string
    Messages []Message
    Format   json.RawMessage
    Options  map[string]any
    Stream   *bool
    Tools    []Tool
    Think    *ThinkValue
}
```

**Conversion Logic:** `openai.go` lines 476-658 (`FromChatRequest` function)

### api.ChatResponse → ChatCompletion

```go
// Ollama native response
type ChatResponse struct {
    Model       string
    Message     Message
    Done        bool
    DoneReason  string
    Metrics     Metrics
    Logprobs    []Logprob
}

// OpenAI format response
type ChatCompletion struct {
    Id            string
    Object        string
    Created       int64
    Model         string
    Choices       []Choice
    Usage         Usage
}
```

**Conversion Logic:** `openai.go` lines 261-292 (`ToChatCompletion` function)

### Tool Call Handling

**OpenAI ToolCall format:**

```json
{
  "id": "call_123",
  "type": "function",
  "function": {
    "name": "get_weather",
    "arguments": "{\"city\": \"NYC\"}"
  }
}
```

**Ollama api.ToolCall format:**

```go
type ToolCall struct {
    ID   string
    Function ToolCallFunction
}

type ToolCallFunction struct {
    Name      string
    Arguments ToolCallFunctionArguments  // map[string]any
    Index     int
}
```

**Conversion:** `openai.go` lines 241-259 (`ToToolCalls`), lines 707-720 (`FromCompletionToolCall`)

---

## Part 5: Streaming Implementation

### Server-Side (Ollama → Client)

The streaming uses Server-Sent Events (SSE):

```go
// Streaming response format
data: {"id":"chatcmpl-123","choices":[{"delta":{"role":"assistant","content":"Hello"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" world"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}

data: [DONE]
```

**Code Reference:** `openai.go` lines 294-348 (`toChunk`, `ToChunks` functions)

### Responses API Streaming

```go
type ResponsesStreamConverter struct {
    responseID        string
    itemID            string
    model             string
    request           ResponsesRequest
    firstWrite        bool
    accumulatedText   string
    accumulatedThinking string
    // ...
}
```

**Events emitted:**

- `response.created` - Response started
- `response.in_progress` - Response in progress
- `reasoning.thinking` - Reasoning/thinking content
- `response.output_text.delta` - Text content delta
- `response.function_call.created` - Tool call started
- `response.function_call.delta` - Tool call arguments
- `response.done` - Response completed

**Code Reference:** `responses.go` lines 878-1000+ (streaming converter)

---

## Part 6: Configuration and Provider Setup

### Model Provider Configuration

In `codex-rs/model-provider-info/src/lib.rs`:

```go
pub const OLLAMA_OSS_PROVIDER_ID: &str = "ollama"
pub const DEFAULT_OLLAMA_PORT: u16 = 11434
```

### Creating the Client

```rust
// From config
pub async fn try_from_oss_provider(config: &Config) -> io::Result<Self> {
    let provider = config.model_providers.get(OLLAMA_OSS_PROVIDER_ID)?;
    Self::try_from_provider(provider).await
}

// From provider
pub(crate) async fn try_from_provider(provider: &ModelProviderInfo) -> io::Result<Self> {
    let base_url = provider.base_url.as_ref().expect("...");
    let uses_openai_compat = is_openai_compatible_base_url(base_url);
    let host_root = base_url_to_host_root(base_url);

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()?;

    Ok(Self { client, host_root, uses_openai_compat })
}
```

**Code Reference:** `client.rs` lines 31-78

---

## Part 7: Implementation Checklist

To implement a similar connection:

### Step 1: Set Up HTTP Client

- [x] Create a client struct with `reqwest::Client`
- [ ] Implement connection timeout (5 seconds recommended)
- [ ] Add server probing/health check

### Step 2: Implement Basic Endpoints

- [ ] `GET /api/tags` - List models
- [ ] `GET /api/version` - Get version
- [ ] `POST /api/pull` - Pull model with streaming

### Step 3: Implement Chat API

- [ ] `POST /api/chat` - Chat completion
- [ ] Handle streaming responses
- [ ] Convert message formats

### Step 4: Add OpenAI Compatibility (Optional)

- [ ] Implement `/v1/chat/completions`
- [ ] Transform OpenAI requests to native format
- [ ] Transform native responses to OpenAI format

### Step 5: Add Responses API (Optional)

- [ ] Implement `/v1/responses`
- [ ] Handle rich content types (text, images, files)
- [ ] Implement streaming converter

### Step 6: Add Tool Calling

- [ ] Parse tool definitions
- [ ] Handle function call requests
- [ ] Process function call outputs

### Step 7: Error Handling

- [ ] Connection errors with helpful messages
- [ ] Version compatibility checks
- [ ] Proper error response formats

---

## Key Files Reference

| File                            | Purpose                        |
| ------------------------------- | ------------------------------ |
| `codex-rs/ollama/src/client.rs` | Rust client for Ollama         |
| `codex-rs/ollama/src/lib.rs`    | Main library entry             |
| `codex-rs/ollama/src/pull.rs`   | Model pulling with progress    |
| `codex-rs/ollama/src/url.rs`    | URL utilities                  |
| `codex-rs/ollama/src/parser.rs` | JSON parsing utilities         |
| `openai.go`                     | OpenAI API compatibility layer |
| `responses.go`                  | Responses API implementation   |

---

## Important Notes

1. **Version Requirements:** Codex requires Ollama 0.13.4+ for Responses API support
2. **OpenAI Compatibility:** Detect whether to use native (`/api/*`) or OpenAI-compatible (`/v1/*`) endpoints
3. **Streaming:** Both chat and responses APIs support streaming via SSE
4. **Tool Calling:** Full support for function calling in both request formats
5. **Reasoning/Thinking:** Support for thinking/reasoning content in newer models
