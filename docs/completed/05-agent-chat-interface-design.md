# Agent Chat Interface Design

## Overview

A customer service chat endpoint for agents, powered by a locally-running OpenClaw agent. Client agents send questions via the SDK, the backend forwards them to OpenClaw's OpenAI-compatible HTTP API, and returns the response.

## Architecture

### Module Structure

New `ChatModule` at `apps/backend/src/chat/` — isolated from ApiModule.

**File Structure:**
```
apps/backend/src/chat/
├── chat.module.ts
├── chat.controller.ts
├── chat.service.ts
├── dto/
│   └── send-message.dto.ts
└── prompts/
    └── system-prompt.txt
```

### Flow

1. Client agent (via SDK) → `POST /chat` with `{ agentId, message }`
2. `ChatController` validates request → `ChatService.sendMessage()`
3. `ChatService` calls OpenClaw HTTP API at `POST /v1/chat/completions`
4. OpenClaw maintains session via `user: agentId` parameter
5. Backend returns `{ ok: true, data: { message: "..." } }` or error

### Session Management

- Stateless on the backend — no database needed
- Each SDK installation generates a UUID v4 `agentId` stored in `~/.config/silk/config.json`
- `agentId` is passed with every SDK request automatically
- Backend forwards `agentId` as the OpenClaw `user` parameter, which gives OpenClaw session continuity per agent

### Configuration

Environment variables:
```bash
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_AUTH_TOKEN=your-token-here
OPENCLAW_AGENT_ID=main
```

## API Contract

### Endpoint

```
POST /chat
Content-Type: application/json
```

### Request Body

```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "How do I send a payment?"
}
```

**Validation:**
- `agentId`: Required, valid UUID v4
- `message`: Required, non-empty, max 10,000 characters

### Success Response (200)

```json
{
  "ok": true,
  "data": {
    "message": "To send a payment, use the `silk pay` command...",
    "agentId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Error Responses

**400 Bad Request:**
```json
{
  "ok": false,
  "error": "INVALID_AGENT_ID",
  "message": "agentId must be a valid UUID"
}
```

**503 Service Unavailable:**
```json
{
  "ok": false,
  "error": "OPENCLAW_UNAVAILABLE",
  "message": "Support chat is temporarily unavailable"
}
```

**500 Internal Server Error:**
```json
{
  "ok": false,
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred"
}
```

## Implementation Details

### ChatService

**OpenClaw Request Format:**
```typescript
{
  model: `openclaw:${OPENCLAW_AGENT_ID}`,
  messages: [
    { role: "system", content: "<loaded from prompts/system-prompt.txt>" },
    { role: "user", content: "<user's message>" }
  ],
  user: "<agentId>",
  temperature: 0.7,
  max_tokens: 1000
}
```

**System Prompt:**
- Loaded from `prompts/system-prompt.txt` once at module initialization (`onModuleInit`)
- Cached in memory for all requests
- Falls back to `"You are a helpful assistant for Silkyway."` if file is unreadable

**HTTP Client:**
- axios with 30-second timeout
- `Authorization: Bearer <OPENCLAW_AUTH_TOKEN>`

**Error Handling:**
- Network errors (ECONNREFUSED, timeout) → `OPENCLAW_UNAVAILABLE`
- 401/403 from OpenClaw → Log error, return `OPENCLAW_UNAVAILABLE`
- 400/500 from OpenClaw → Log full error, return `INTERNAL_ERROR`
- Unexpected exceptions → Log stack trace, return `INTERNAL_ERROR`

### Edge Cases

- Empty/null OpenClaw response → `INTERNAL_ERROR`
- Malformed JSON from OpenClaw → Catch parse error, `INTERNAL_ERROR`
- Very long messages (>10k chars) → Reject at validation layer
- Missing env vars → Default to `http://127.0.0.1:18789` with no auth, log warning

### Logging

- Info: Each chat request (agentId, message length, response time)
- Warn: OpenClaw errors, missing config
- Error: Unexpected exceptions with stack traces

### Authentication

None — matches existing backend API pattern. Rate limiting handled at infrastructure level.
