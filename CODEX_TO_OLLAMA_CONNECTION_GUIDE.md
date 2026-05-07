# Codex to Ollama Connection Guide

## Overview

This guide explains how Codex connects to Ollama through the API Gateway, detailing the request/response flow and transformation process.

## Connection Architecture

The connection between Codex and Ollama follows this architecture:

1. **Request Flow**: Codex → API Gateway → Ollama
2. **Response Flow**: Ollama → API Gateway → Codex

## Implementation Details

### Request Transformation

The API Gateway acts as a middleware that transforms OpenAI-style requests to Ollama format:

- **Endpoint Mapping**:
  - OpenAI: `/v1/chat/completions` → Ollama: `/api/chat`
  - OpenAI: `/v1/models` → Ollama: `/api/tags`

- **Field Mappings**:
  - `max_tokens` → `num_predict` in options
  - `tool_calls` in the response maps to tool_calls in Ollama format

### Response Transformation

- Ollama responses are transformed back to OpenAI format for the API Gateway
- The gateway ensures compatibility between the two systems

## Key Files

The implementation involves several key files:
1. `src/providers/ollama.ts` - Provider implementation
2. `src/services/ollama.service.ts` - Request/response conversion services
3. `src/controller/ollama.controller.ts` - API endpoint handling

## Usage

This integration allows Codex to communicate with Ollama using the familiar OpenAI API format while the backend handles the actual communication with Ollama.