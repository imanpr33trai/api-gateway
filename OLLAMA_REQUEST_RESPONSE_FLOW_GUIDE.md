# Complete Request/Response Flow: Codex → Ollama

This guide shows the complete journey of a request from Codex all the way to Ollama and back, including every transformation step.

---

## Scenario: User asks Codex a question that requires tool execution

Let's trace a complete conversation flow where:
1. User asks a question
2. Codex decides to call a tool (shell command)
3. Ollama processes the request
4. Tool results are returned
5. Final response is generated

---

## Step 1: Codex Internal Request Format

When a user types a message in Codex, internally it prepares a request. The exact internal format depends on the protocol, but conceptually it looks like:

```json
{
  "model": "llama3.2:3b",
  "messages": [
    {
      "role": "system",
      "content": "You are Codex, an AI coding assistant..."
    },
    {
      "role": "user", 
      "content": "List the files in the current directory"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "shell",
        "description": "Execute a shell command",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "The shell command to execute"
            }
          },
          "required": ["command"]
        }
      }
    }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

---

## Step 2: Conversion - OpenAI Format to Ollama Native

The Go layer in Ollama (`openai.go`) receives this and converts it. Let's trace through `FromChatRequest()`:

### 2a. Tool Conversion

**Before (OpenAI tool format):**
```json
{
  "type": "function",
  "function": {
    "name": "shell",
    "description": "Execute a shell command",
    "parameters": {...}
  }
}
```

**After (Ollama api.Tool format):**
```go
// In Go, this becomes:
api.Tool{
    Type: "function",
    Function: api.ToolFunction{
        Name:        "shell",
        Description: "Execute a shell command", 
        Parameters:  // converted from JSON schema to map[string]any
    }
}
```

### 2b. Message Conversion

**Before (OpenAI Message format):**
```json
{
  "role": "user",
  "content": "List the files in the current directory"
}
```

**After (Ollama api.Message format):**
```go
api.Message{
    Role:    "user",
    Content: "List the files in the current directory",
}
```

### 2c. Full Converted Request to Ollama

The final request sent to Ollama's native `/api/chat` endpoint:

```json
POST http://localhost:11434/api/chat
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "messages": [
    {
      "role": "system",
      "content": "You are Codex, an AI coding assistant..."
    },
    {
      "role": "user",
      "content": "List the files in the current directory"
    }
  ],
  "stream": true,
  "options": {
    "temperature": 0.7,
    "num_predict": 4096
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "shell",
        "description": "Execute a shell command",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "The shell command to execute"
            }
          },
          "required": ["command"]
        }
      }
    }
  ]
}
```

**Key transformations:**
- `max_tokens` → `num_predict` in `options` object
- `temperature` → moved to `options` object
- Tools stay mostly the same format
- Added `stream: true` explicitly

---

## Step 3: Ollama Processing

Ollama receives the request and processes it:

### 3a. Ollama's Internal Processing

1. Loads the model into memory
2. Tokenizes the input
3. Runs inference
4. May generate "thinking" (reasoning) content
5. May decide to call a tool

### 3b. Streaming Response (First Chunk - Thinking)

Ollama sends SSE streaming response:

```
data: {"model":"llama3.2:3b","message":{"role":"assistant","content":"","thinking":"Let me think about this. The user wants to list files. I'll use the shell tool to execute 'ls -la'."},"done":false}

data: {"model":"llama3.2:3b","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_abc123","function":{"name":"shell","arguments":{"command":"ls -la"}}}],"done":false,"done_reason":"tool_calls"}
```

**Format breakdown:**
```json
{
  "model": "llama3.2:3b",
  "message": {
    "role": "assistant",
    "content": "",                    // Empty - no text yet
    "thinking": "...",                // Reasoning content
    "tool_calls": [                   // Tool call decision
      {
        "id": "call_abc123",
        "function": {
          "name": "shell",
          "arguments": {
            "command": "ls -la"
          }
        }
      }
    ]
  },
  "done": false,
  "done_reason": "tool_calls"        // Indicates tool was called
}
```

---

## Step 4: Conversion - Ollama Response to OpenAI Format

The Go layer converts the Ollama response back to OpenAI format for the client.

### 4a. Tool Calls Conversion

**Before (Ollama api.ToolCall):**
```go
api.ToolCall{
    ID: "call_abc123",
    Function: api.ToolCallFunction{
        Name: "shell",
        Arguments: map[string]any{"command": "ls -la"},
        Index: 0,
    }
}
```

**After (OpenAI ToolCall):**
```json
{
  "id": "call_abc123",
  "type": "function",
  "index": 0,
  "function": {
    "name": "shell",
    "arguments": "{\"command\":\"ls -la\"}"
  }
}
```

### 4b. Complete Converted Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion.chunk",
  "created": 1704067200,
  "model": "llama3.2:3b",
  "choices": [
    {
      "index": 0,
      "delta": {
        "role": "assistant",
        "content": "",
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "index": 0,
            "function": {
              "name": "shell",
              "arguments": "{\"command\":\"ls -la\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

---

## Step 5: Codex Receives Tool Call

Codex receives the response, sees `finish_reason: "tool_calls"`, and:

1. Extracts the tool call
2. Executes the shell command
3. Sends the result back

### 5a. Tool Execution Result

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "total 48\ndrwxr-xr-x  12 user  staff   384 May  6 09:01 .\nddrwxr-xr-x   5 user  staff   160 May  6 09:01 ..\n-rw-r--r--   1 user  staff  1234 May  6 09:01 README.md\ndrwxr-xr-x   1 user  staff  4096 May  6 09:01 src\ndrwxr-xr-x   1 user  staff  4096 May  6 09:01 Cargo.toml\n"
}
```

---

## Step 6: Second Request - Continue Conversation

Codex sends the conversation with tool result:

### 6a. Request to Ollama (After Tool Execution)

```json
POST http://localhost:11434/api/chat
Content-Type: application/json

{
  "model": "llama3.2:3b",
  "messages": [
    {
      "role": "system", 
      "content": "You are Codex, an AI coding assistant..."
    },
    {
      "role": "user",
      "content": "List the files in the current directory"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "id": "call_abc123",
          "function": {
            "name": "shell",
            "arguments": {"command": "ls -la"}
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_abc123",
      "content": "total 48\ndrwxr-xr-x  12 user  staff   384 May  6 09:01 .\ndrwxr-xr-x   5 user  staff   160 May  6 09:01 ..\n-rw-r--r--   1 user  staff  1234 May  6 09:01 README.md\ndrwxr-xr-x   1 user  staff  4096 May  6 09:01 src\ndrwxr-xr-x   1 user  staff  4096 May  6 09:01 Cargo.toml"
    }
  ],
  "stream": true,
  "options": {
    "temperature": 0.7,
    "num_predict": 4096
  },
  "tools": [...]
}
```

---

## Step 7: Final Response from Ollama

### 7a. Streaming Response (Text Generation)

```
data: {"model":"llama3.2:3b","message":{"role":"assistant","content":"I"},"done":false}

data: {"model":"llama3.2:3b","message":{"role":"assistant","content":"I can"},"done":false}

data: {"model":"llama3.2:3b","message":{"role":"assistant","content":"I can see"},"done":false}

... (more chunks) ...

data: {"model":"llama3.2:3b","message":{"role":"assistant","content":"I can see the following files in your current directory:\n\n- README.md\n- src/\n- Cargo.toml\n\nThe directory contains a Rust project with source code in the `src` folder and a Cargo configuration file."},"done":true,"done_reason":"stop","metrics":{"prompt_eval_count":150,"eval_count":80,"prompt_eval_duration":50000000,"eval_duration":120000000}}
```

### 7b. Final Converted Response to Client

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1704067200,
  "model": "llama3.2:3b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I can see the following files in your current directory:\n\n- README.md\n- src/\n- Cargo.toml\n\nThe directory contains a Rust project with source code in the `src` folder and a Cargo configuration file."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 80,
    "total_tokens": 230
  }
}
```

---

## Summary Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CODEX CLIENT                                      │
│  User types: "List files in directory"                                      │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CODEX REQUEST FORMAT                                   │
│  {                                                                         │
│    "model": "llama3.2:3b",                                                 │
│    "messages": [...],                                                      │
│    "tools": [...],                                                         │
│    "stream": true                                                          │
│  }                                                                         │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ (HTTP POST)
┌─────────────────────────────────────────────────────────────────────────────┐
│                     OLLAMA SERVER (Go)                                      │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  FromChatRequest() - Transformation Layer                           │  │
│  │                                                                      │  │
│  │  • Converts max_tokens → num_predict                                │  │
│  │  • Converts tools format                                            │  │
│  │  • Converts message format                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ (Internal)
┌─────────────────────────────────────────────────────────────────────────────┐
│                  OLLAMA NATIVE /api/chat                                    │
│                                                                             │
│  POST /api/chat                                                            │
│  {                                                                         │
│    "model": "llama3.2:3b",                                                 │
│    "messages": [...],                                                      │
│    "options": {"temperature": 0.7, "num_predict": 4096},                  │
│    "tools": [...],                                                         │
│    "stream": true                                                          │
│  }                                                                         │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ (Inference)
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OLLAMA MODEL INFERENCE                                   │
│                                                                             │
│  • Loads model                                                             │
│  • Tokenizes input                                                         │
│  • Runs LLM inference                                                      │
│  • May generate thinking                                                   │
│  • May call tools                                                          │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ (Streaming SSE)
┌─────────────────────────────────────────────────────────────────────────────┐
│                  OLLAMA NATIVE RESPONSE (Streaming)                        │
│                                                                             │
│  data: {"message":{"role":"assistant","content":"","tool_calls":[...]}}   │
│  data: {"message":{"role":"assistant","content":"..."},"done":true}       │
│  data: [DONE]                                                              │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     OLLAMA SERVER (Go)                                      │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  ToChatCompletion() / ToChunks() - Transformation Layer            │  │
│  │                                                                      │  │
│  │  • Converts tool_calls to OpenAI format                             │  │
│  │  • Converts message format                                          │  │
│  │  • Extracts metrics for usage                                       │  │
│  │  • Handles streaming chunks                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼ (HTTP Response)
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CODEX CLIENT RECEIVES                                  │
│                                                                             │
│  {                                                                         │
│    "id": "chatcmpl-...",                                                   │
│    "choices": [{                                                           │
│      "message": {"role": "assistant", "content": "..."},                  │
│      "finish_reason": "stop"                                               │
│    }],                                                                     │
│    "usage": {...}                                                          │
│  }                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Conversion Reference

### Request Conversions

| OpenAI Field | Ollama Field | Notes |
|--------------|--------------|-------|
| `max_tokens` | `options.num_predict` | Moved to options |
| `temperature` | `options.temperature` | Moved to options |
| `top_p` | `options.top_p` | Moved to options |
| `stop` | `options.stop` | Can be string or array |
| `seed` | `options.seed` | Moved to options |
| `frequency_penalty` | `options.frequency_penalty` | Moved to options |
| `presence_penalty` | `options.presence_penalty` | Moved to options |
| `response_format.type` | `format` | For JSON mode |
| `response_format.json_schema` | `format` | For structured output |
| `tools` | `tools` | Slightly different structure |
| `reasoning.effort` | `think` | For thinking models |

### Response Conversions

| Ollama Field | OpenAI Field | Notes |
|--------------|--------------|-------|
| `model` | `model` | Same |
| `message.role` | `choices[].message.role` | Same |
| `message.content` | `choices[].message.content` | Same |
| `message.tool_calls` | `choices[].message.tool_calls` | Different structure |
| `message.thinking` | `choices[].delta.reasoning` | For thinking models |
| `done_reason` | `finish_reason` | Map: "stop"→"stop", "tool_calls"→"tool_calls" |
| `metrics.prompt_eval_count` | `usage.prompt_tokens` | Same |
| `metrics.eval_count` | `usage.completion_tokens` | Same |

### Tool Call Structure Conversion

**Ollama (api.ToolCall):**
```go
type ToolCall struct {
    ID   string
    Function ToolCallFunction
}

type ToolCallFunction struct {
    Name      string
    Arguments map[string]any  // JSON object as map
    Index     int
}
```

**OpenAI (ToolCall):**
```json
{
  "id": "call_abc",
  "type": "function", 
  "index": 0,
  "function": {
    "name": "shell",
    "arguments": "{\"command\":\"ls\"}"  // JSON as string
  }
}
```

---

## Responses API Flow (Newer Format)

The Responses API (`/v1/responses`) is similar but with different structure:

### Request

```json
POST http://localhost:11434/v1/responses
{
  "model": "llama3.2:3b",
  "input": "List files in directory",
  "reasoning": {"effort": "medium"},
  "text": {"format": {"type": "text"}},
  "tools": [
    {
      "type": "function",
      "name": "shell",
      "description": "...",
      "strict": true,
      "parameters": {...}
    }
  ],
  "stream": false
}
```

### Response

```json
{
  "id": "resp_abc123",
  "object": "response",
  "created_at": 1704067200,
  "status": "completed",
  "model": "llama3.2:3b",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Here are the files..."
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 150,
    "output_tokens": 80,
    "total_tokens": 230,
    "input_tokens_details": {"cached_tokens": 0},
    "output_tokens_details": {"reasoning_tokens": 0}
  }
}
```

### Tool Call in Responses API

```json
{
  "output": [
    {
      "type": "function_call",
      "call_id": "fc_abc123",
      "name": "shell",
      "arguments": "{\"command\":\"ls\"}"
    }
  ]
}
```

---

## Complete Example: Streaming with Tool Calls

### Step 1: Initial Request

```bash
curl -N http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "stream": true,
    "tools": [{
      "type": "function",
      "function": {
        "name": "calculator",
        "description": "Calculate math expressions",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {"type": "string"}
          },
          "required": ["expression"]
        }
      }
    }]
  }'
```

### Step 2: Response Stream

```
data: {"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"calculator","arguments":"{\"expression\":\"2+2\"}"}}],"finish_reason":null}}]}

data: {"id":"chatcmpl-xxx","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls","usage":null}]}

data: [DONE]
```

### Step 3: Tool Result Request

```bash
curl -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "messages": [
      {"role": "user", "content": "What is 2+2?"},
      {"role": "assistant", "content": "", "tool_calls": [{"id":"call_1","type":"function","function":{"name":"calculator","arguments":"{\"expression\":\"2+2\"}"}}]},
      {"role": "tool", "tool_call_id": "call_1", "content": "4"}
    ],
    "stream": false
  }'
```

### Step 4: Final Response

```json
{
  "id": "chatcmpl-yyy",
  "object": "chat.completion",
  "created": 1704067200,
  "model": "llama3.2:3b",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "2 + 2 equals 4!"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 200,
    "completion_tokens": 15,
    "total_tokens": 215
  }
}
```

---

## File-by-File Transformation Code

### openai.go - FromChatRequest()

```go
func FromChatRequest(r ChatCompletionRequest) (*api.ChatRequest, error) {
    var messages []api.Message
    
    // Convert each message
    for _, msg := range r.Messages {
        switch content := msg.Content.(type) {
        case string:
            // Simple text message
            toolCalls, _ := FromCompletionToolCall(msg.ToolCalls)
            messages = append(messages, api.Message{
                Role:      msg.Role,
                Content:   content,
                Thinking:  msg.Reasoning,
                ToolCalls: toolCalls,
            })
        case []any:
            // Multi-content message (text + images)
            // ... handle each content item
        }
    }
    
    // Convert options
    options := make(map[string]any)
    if r.MaxTokens != nil {
        options["num_predict"] = *r.MaxTokens
    }
    if r.Temperature != nil {
        options["temperature"] = *r.Temperature
    }
    // ... more options
    
    return &api.ChatRequest{
        Model:    r.Model,
        Messages: messages,
        Options:  options,
        Stream:   &r.Stream,
        Tools:    r.Tools,
    }, nil
}
```

### openai.go - ToChatCompletion()

```go
func ToChatCompletion(id string, r api.ChatResponse) ChatCompletion {
    toolCalls := ToToolCalls(r.Message.ToolCalls)
    
    return ChatCompletion{
        Id:        id,
        Object:    "chat.completion",
        Created:   r.CreatedAt.Unix(),
        Model:     r.Model,
        Choices: []Choice{{
            Index:   0,
            Message: Message{
                Role:      r.Message.Role,
                Content:   r.Message.Content,
                ToolCalls: toolCalls,
                Reasoning: r.Message.Thinking,
            },
            FinishReason: func(reason string) *string {
                if len(toolCalls) > 0 {
                    reason = "tool_calls"
                }
                return &reason
            }(r.DoneReason),
        }},
        Usage: Usage{
            PromptTokens:     r.Metrics.PromptEvalCount,
            CompletionTokens: r.Metrics.EvalCount,
            TotalTokens:      r.Metrics.PromptEvalCount + r.Metrics.EvalCount,
        },
    }
}
```

### responses.go - FromResponsesRequest()

```go
func FromResponsesRequest(r ResponsesRequest) (*api.ChatRequest, error) {
    var messages []api.Message
    
    // Handle string input
    if r.Input.Text != "" {
        messages = append(messages, api.Message{
            Role:    "user",
            Content: r.Input.Text,
        })
    }
    
    // Handle array of input items
    for _, item := range r.Input.Items {
        switch v := item.(type) {
        case ResponsesInputMessage:
            // Convert message content
            msg, _ := convertInputMessage(v)
            messages = append(messages, msg)
        case ResponsesFunctionCall:
            // Convert tool call
            toolCall := api.ToolCall{
                ID: v.CallID,
                Function: api.ToolCallFunction{
                    Name:      v.Name,
                    Arguments: parseArguments(v.Arguments),
                },
            }
            messages = append(messages, api.Message{
                Role:      "assistant",
                ToolCalls: []api.ToolCall{toolCall},
            })
        case ResponsesFunctionCallOutput:
            // Convert tool result
            messages = append(messages, api.Message{
                Role:       "tool",
                Content:    v.Output,
                ToolCallID: v.CallID,
            })
        }
    }
    
    return &api.ChatRequest{
        Model:    r.Model,
        Messages: messages,
        Options:  options,
        Tools:    tools,
    }, nil
}
```

---

This guide shows the complete flow from user input through all transformation layers to Ollama and back.
