# Agent Chat Interface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a customer service chat endpoint where client agents send questions via the SDK, the backend forwards them to a locally-running OpenClaw agent (OpenAI-compatible API), and returns the response.

**Architecture:** New `ChatModule` isolated from `ApiModule` at `apps/backend/src/chat/`. Stateless — no database. Each SDK installation has a UUID v4 `agentId` in config, sent with every request. Backend forwards `agentId` as the OpenClaw `user` parameter for session continuity. SDK exposes `silk chat "<message>"`.

**Tech Stack:** NestJS 11, axios (via `@nestjs/axios`), Commander CLI, Jest for backend tests.

---

### Task 1: Install backend dependencies

**Files:**
- Modify: `apps/backend/package.json`

**Step 1: Install @nestjs/axios and axios**

Run from repo root:
```bash
cd apps/backend && npm install @nestjs/axios axios
```

**Step 2: Verify installation**

Run: `cat apps/backend/package.json | grep -E "axios|@nestjs/axios"`
Expected: Both `@nestjs/axios` and `axios` appear in dependencies.

**Step 3: Commit**

```bash
git add apps/backend/package.json apps/backend/package-lock.json
git commit -m "chore: add @nestjs/axios for chat module HTTP client"
```

---

### Task 2: Create ChatService with tests

**Files:**
- Create: `apps/backend/src/chat/chat.service.ts`
- Create: `apps/backend/src/chat/chat.service.spec.ts`
- Create: `apps/backend/src/chat/prompts/system-prompt.txt`

**Step 1: Create the system prompt file**

Create `apps/backend/src/chat/prompts/system-prompt.txt`:
```
You are a helpful customer support assistant for Silkyway, an agent payments protocol on Solana. You help AI agents understand how to use the Silkyway SDK to send payments, check balances, manage accounts, and more. Be concise and practical.
```

**Step 2: Write the failing test**

Create `apps/backend/src/chat/chat.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders } from 'axios';

describe('ChatService', () => {
  let service: ChatService;
  let httpService: HttpService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        ChatService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const map: Record<string, string> = {
                OPENCLAW_GATEWAY_URL: 'http://127.0.0.1:18789',
                OPENCLAW_AUTH_TOKEN: 'test-token',
                OPENCLAW_AGENT_ID: 'main',
              };
              return map[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);

    // Trigger onModuleInit to load system prompt
    await service.onModuleInit();
  });

  describe('sendMessage', () => {
    it('should return the assistant message from OpenClaw', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          choices: [
            { message: { content: 'Use the `silk pay` command to send a payment.' } },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = await service.sendMessage('agent-123', 'How do I send a payment?');

      expect(result).toBe('Use the `silk pay` command to send a payment.');
    });

    it('should pass agentId as the user parameter to OpenClaw', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          choices: [{ message: { content: 'Hello' } }],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      const postSpy = jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      await service.sendMessage('my-agent-uuid', 'Hi');

      expect(postSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:18789/v1/chat/completions',
        expect.objectContaining({
          model: 'openclaw:main',
          user: 'my-agent-uuid',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Hi' }),
          ]),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('should throw OPENCLAW_UNAVAILABLE on network error', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(
        throwError(() => ({ code: 'ECONNREFUSED' })),
      );

      await expect(service.sendMessage('agent-123', 'Hi'))
        .rejects.toMatchObject({ code: 'OPENCLAW_UNAVAILABLE' });
    });

    it('should throw OPENCLAW_UNAVAILABLE on timeout', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(
        throwError(() => ({ code: 'ECONNABORTED' })),
      );

      await expect(service.sendMessage('agent-123', 'Hi'))
        .rejects.toMatchObject({ code: 'OPENCLAW_UNAVAILABLE' });
    });

    it('should throw OPENCLAW_UNAVAILABLE on 401/403 from OpenClaw', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(
        throwError(() => ({ response: { status: 401 } })),
      );

      await expect(service.sendMessage('agent-123', 'Hi'))
        .rejects.toMatchObject({ code: 'OPENCLAW_UNAVAILABLE' });
    });

    it('should throw INTERNAL_ERROR on empty choices', async () => {
      const mockResponse: AxiosResponse = {
        data: { choices: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      await expect(service.sendMessage('agent-123', 'Hi'))
        .rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('should throw INTERNAL_ERROR on 500 from OpenClaw', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(
        throwError(() => ({ response: { status: 500, data: { error: 'server error' } } })),
      );

      await expect(service.sendMessage('agent-123', 'Hi'))
        .rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/chat/chat.service.spec.ts --no-cache`
Expected: FAIL — `Cannot find module './chat.service'`

**Step 4: Write the ChatService implementation**

Create `apps/backend/src/chat/chat.service.ts`:
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface ChatError {
  code: string;
  message: string;
}

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);
  private systemPrompt = 'You are a helpful assistant for Silkyway.';

  private readonly gatewayUrl: string;
  private readonly authToken: string;
  private readonly agentId: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.gatewayUrl = this.configService.get<string>(
      'OPENCLAW_GATEWAY_URL',
      'http://127.0.0.1:18789',
    );
    this.authToken = this.configService.get<string>('OPENCLAW_AUTH_TOKEN', '');
    this.agentId = this.configService.get<string>('OPENCLAW_AGENT_ID', 'main');

    if (!this.authToken) {
      this.logger.warn('OPENCLAW_AUTH_TOKEN is not set');
    }
  }

  async onModuleInit() {
    try {
      const promptPath = join(__dirname, 'prompts', 'system-prompt.txt');
      this.systemPrompt = await readFile(promptPath, 'utf-8');
    } catch {
      this.logger.warn('Could not load system-prompt.txt, using default');
    }
  }

  async sendMessage(agentId: string, message: string): Promise<string> {
    const url = `${this.gatewayUrl}/v1/chat/completions`;
    const body = {
      model: `openclaw:${this.agentId}`,
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: message },
      ],
      user: agentId,
      temperature: 0.7,
      max_tokens: 1000,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    let response;
    try {
      response = await firstValueFrom(
        this.httpService.post(url, body, { headers, timeout: 30000 }),
      );
    } catch (err: any) {
      const code = err?.code;
      const status = err?.response?.status;

      if (code === 'ECONNREFUSED' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
        this.logger.warn(`OpenClaw unavailable: ${code}`);
        throw { code: 'OPENCLAW_UNAVAILABLE', message: 'Support chat is temporarily unavailable' };
      }

      if (status === 401 || status === 403) {
        this.logger.error(`OpenClaw auth error: ${status}`);
        throw { code: 'OPENCLAW_UNAVAILABLE', message: 'Support chat is temporarily unavailable' };
      }

      this.logger.error(`OpenClaw error: ${JSON.stringify(err?.response?.data || err?.message)}`);
      throw { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
    }

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      this.logger.error('Empty response from OpenClaw');
      throw { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
    }

    return content;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/chat/chat.service.spec.ts --no-cache`
Expected: All 7 tests PASS.

**Step 6: Commit**

```bash
git add apps/backend/src/chat/chat.service.ts apps/backend/src/chat/chat.service.spec.ts apps/backend/src/chat/prompts/system-prompt.txt
git commit -m "feat(chat): add ChatService with OpenClaw integration"
```

---

### Task 3: Create ChatController with tests

**Files:**
- Create: `apps/backend/src/chat/chat.controller.ts`
- Create: `apps/backend/src/chat/chat.controller.spec.ts`

**Step 1: Write the failing test**

Create `apps/backend/src/chat/chat.controller.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { BadRequestException, ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            sendMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);
  });

  describe('POST /chat', () => {
    it('should return assistant message on success', async () => {
      jest.spyOn(chatService, 'sendMessage').mockResolvedValue('Use silk pay to send.');

      const result = await controller.sendMessage({
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'How do I pay?',
      });

      expect(result).toEqual({
        ok: true,
        data: {
          message: 'Use silk pay to send.',
          agentId: '550e8400-e29b-41d4-a716-446655440000',
        },
      });
    });

    it('should reject missing agentId', async () => {
      await expect(
        controller.sendMessage({ agentId: '', message: 'Hi' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid UUID agentId', async () => {
      await expect(
        controller.sendMessage({ agentId: 'not-a-uuid', message: 'Hi' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty message', async () => {
      await expect(
        controller.sendMessage({ agentId: '550e8400-e29b-41d4-a716-446655440000', message: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject message over 10000 chars', async () => {
      await expect(
        controller.sendMessage({
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          message: 'a'.repeat(10001),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 503 when OpenClaw is unavailable', async () => {
      jest.spyOn(chatService, 'sendMessage').mockRejectedValue({
        code: 'OPENCLAW_UNAVAILABLE',
        message: 'Support chat is temporarily unavailable',
      });

      await expect(
        controller.sendMessage({
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          message: 'Hi',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should return 500 on internal error', async () => {
      jest.spyOn(chatService, 'sendMessage').mockRejectedValue({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });

      await expect(
        controller.sendMessage({
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          message: 'Hi',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/chat/chat.controller.spec.ts --no-cache`
Expected: FAIL — `Cannot find module './chat.controller'`

**Step 3: Write the ChatController implementation**

Create `apps/backend/src/chat/chat.controller.ts`:
```typescript
import {
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
  ServiceUnavailableException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ChatService } from './chat.service';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 10000;

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(200)
  async sendMessage(@Body() body: { agentId: string; message: string }) {
    // Validate agentId
    if (!body.agentId) {
      throw new BadRequestException({
        ok: false,
        error: 'INVALID_AGENT_ID',
        message: 'agentId is required',
      });
    }
    if (!UUID_V4_REGEX.test(body.agentId)) {
      throw new BadRequestException({
        ok: false,
        error: 'INVALID_AGENT_ID',
        message: 'agentId must be a valid UUID',
      });
    }

    // Validate message
    if (!body.message || body.message.trim().length === 0) {
      throw new BadRequestException({
        ok: false,
        error: 'INVALID_MESSAGE',
        message: 'message is required',
      });
    }
    if (body.message.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException({
        ok: false,
        error: 'INVALID_MESSAGE',
        message: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
      });
    }

    this.logger.log(
      `Chat request from ${body.agentId} (${body.message.length} chars)`,
    );
    const start = Date.now();

    try {
      const message = await this.chatService.sendMessage(body.agentId, body.message);

      this.logger.log(`Chat response for ${body.agentId} in ${Date.now() - start}ms`);

      return {
        ok: true,
        data: { message, agentId: body.agentId },
      };
    } catch (err: any) {
      if (err?.code === 'OPENCLAW_UNAVAILABLE') {
        throw new ServiceUnavailableException({
          ok: false,
          error: 'OPENCLAW_UNAVAILABLE',
          message: 'Support chat is temporarily unavailable',
        });
      }

      this.logger.error(`Chat error for ${body.agentId}: ${err?.message || err}`);
      throw new InternalServerErrorException({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/chat/chat.controller.spec.ts --no-cache`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add apps/backend/src/chat/chat.controller.ts apps/backend/src/chat/chat.controller.spec.ts
git commit -m "feat(chat): add ChatController with validation and error mapping"
```

---

### Task 4: Create ChatModule and register in AppModule

**Files:**
- Create: `apps/backend/src/chat/chat.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/.env.sample`

**Step 1: Create the ChatModule**

Create `apps/backend/src/chat/chat.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [HttpModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
```

**Step 2: Register ChatModule in AppModule**

In `apps/backend/src/app.module.ts`, add to imports array:
```typescript
import { ChatModule } from './chat/chat.module';

// In @Module imports array, add:
ChatModule,
```

The full imports array should be:
```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  MikroOrmModule.forRoot({}),
  ServeStaticModule.forRoot(
    {
      rootPath: join(__dirname, '..', '.well-known'),
      serveRoot: '/.well-known',
    },
    {
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      serveStaticOptions: { index: false },
    },
  ),
  ContentModule,
  SolanaModule,
  ApiModule,
  ChatModule,
],
```

**Step 3: Add env vars to .env.sample**

Append to `apps/backend/.env.sample`:
```bash

# Chat (OpenClaw)
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_AUTH_TOKEN=
OPENCLAW_AGENT_ID=main
```

**Step 4: Verify the backend builds**

Run: `cd apps/backend && npm run build`
Expected: Build completes without errors.

**Step 5: Run all chat tests**

Run: `cd apps/backend && npx jest src/chat/ --no-cache`
Expected: All tests PASS (14 tests across 2 files).

**Step 6: Commit**

```bash
git add apps/backend/src/chat/chat.module.ts apps/backend/src/app.module.ts apps/backend/.env.sample
git commit -m "feat(chat): add ChatModule and register in AppModule"
```

---

### Task 5: Add agentId to SDK config

**Files:**
- Modify: `packages/sdk/src/config.ts`

**Step 1: Add agentId field to HandshakeConfig**

In `packages/sdk/src/config.ts`, add `agentId` to the `HandshakeConfig` interface:
```typescript
export interface HandshakeConfig {
  wallets: WalletEntry[];
  defaultWallet: string;
  preferences: Record<string, unknown>;
  apiUrl?: string;
  account?: AccountInfo;
  agentId?: string;
}
```

**Step 2: Add getAgentId helper function**

Add to `packages/sdk/src/config.ts` after the `getApiUrl` function:
```typescript
export function getAgentId(config: HandshakeConfig): string {
  if (config.agentId) return config.agentId;

  // Generate and persist on first use
  const { randomUUID } = await import('node:crypto');
  // Can't use top-level await in this sync function, so use the sync crypto API
  const agentId = crypto.randomUUID();
  config.agentId = agentId;
  saveConfig(config);
  return agentId;
}
```

Wait — the existing code uses synchronous patterns and `node:crypto`'s `randomUUID` is synchronous. Let's use the correct approach:

Add this import at the top of `packages/sdk/src/config.ts`:
```typescript
import { randomUUID } from 'node:crypto';
```

Add this function after `getApiUrl`:
```typescript
export function getAgentId(config: HandshakeConfig): string {
  if (config.agentId) return config.agentId;

  const agentId = randomUUID();
  config.agentId = agentId;
  saveConfig(config);
  return agentId;
}
```

**Step 3: Verify SDK builds**

Run: `cd packages/sdk && npm run build`
Expected: Build completes without errors.

**Step 4: Commit**

```bash
git add packages/sdk/src/config.ts
git commit -m "feat(sdk): add agentId to config with auto-generation"
```

---

### Task 6: Add silk chat command to SDK

**Files:**
- Create: `packages/sdk/src/commands/chat.ts`
- Modify: `packages/sdk/src/cli.ts`

**Step 1: Create the chat command**

Create `packages/sdk/src/commands/chat.ts`:
```typescript
import { loadConfig, getApiUrl, getAgentId } from '../config.js';
import { createHttpClient } from '../client.js';
import { outputSuccess } from '../output.js';

export async function chat(message: string) {
  const config = loadConfig();
  const agentId = getAgentId(config);
  const client = createHttpClient({ baseUrl: getApiUrl(config) });

  const res = await client.post('/chat', { agentId, message });
  const data = res.data.data;

  outputSuccess({ message: data.message });
}
```

**Step 2: Register the command in cli.ts**

In `packages/sdk/src/cli.ts`, add import at the top with the other command imports:
```typescript
import { chat } from './commands/chat.js';
```

Add the command registration before `program.parse()`:
```typescript
// chat
program
  .command('chat')
  .argument('<message>', 'Message to send to support')
  .description('Chat with Silkyway support agent')
  .action(wrapCommand(chat));
```

**Step 3: Verify SDK builds**

Run: `cd packages/sdk && npm run build`
Expected: Build completes without errors.

**Step 4: Commit**

```bash
git add packages/sdk/src/commands/chat.ts packages/sdk/src/cli.ts
git commit -m "feat(sdk): add silk chat command"
```

---

### Task 7: Copy system prompt to dist on build

The `ChatService` loads `system-prompt.txt` from `join(__dirname, 'prompts', 'system-prompt.txt')`. Since the backend uses SWC to compile to `dist/`, the text file won't be copied automatically.

**Files:**
- Modify: `apps/backend/nest-cli.json` (or equivalent asset config)

**Step 1: Check how NestJS handles assets**

Read `apps/backend/nest-cli.json` to see existing config.

**Step 2: Add chat prompts to assets in nest-cli.json**

The file already has an assets array. Add the chat prompts entry to `apps/backend/nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": [
      {
        "include": "solana/*.json",
        "outDir": "dist"
      },
      {
        "include": "content/*.html",
        "outDir": "dist"
      },
      {
        "include": "chat/prompts/*.txt",
        "outDir": "dist"
      }
    ]
  }
}
```

This tells NestJS to copy `src/chat/prompts/*.txt` to `dist/chat/prompts/` on build.

**Step 3: Verify the prompt file is copied**

Run: `cd apps/backend && npm run build && cat dist/chat/prompts/system-prompt.txt`
Expected: The system prompt text is printed.

**Step 4: Commit**

```bash
git add apps/backend/nest-cli.json
git commit -m "chore: configure asset copying for chat system prompt"
```

---

### Task 8: End-to-end smoke test

This task verifies the full flow works with a manually-started backend.

**Step 1: Add the OpenClaw env vars to your local .env**

In `apps/backend/.env`, add:
```bash
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_AUTH_TOKEN=your-token-here
OPENCLAW_AGENT_ID=main
```

**Step 2: Start the backend**

Run: `cd apps/backend && npm run start:dev`

**Step 3: Test with curl (without OpenClaw running — expect 503)**

Run:
```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"550e8400-e29b-41d4-a716-446655440000","message":"Hello"}' | jq .
```

Expected (OpenClaw not running):
```json
{
  "ok": false,
  "error": "OPENCLAW_UNAVAILABLE",
  "message": "Support chat is temporarily unavailable"
}
```

**Step 4: Test validation with curl**

Run:
```bash
curl -s -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"bad-uuid","message":"Hi"}' | jq .
```

Expected:
```json
{
  "ok": false,
  "error": "INVALID_AGENT_ID",
  "message": "agentId must be a valid UUID"
}
```

**Step 5: Test with SDK**

Run: `silk chat "How do I send a payment?"`

Expected (OpenClaw not running): Error output with `OPENCLAW_UNAVAILABLE` or `NETWORK_ERROR`.

**Step 6: If OpenClaw is running, test full flow**

Run: `silk chat "How do I send a payment?"`

Expected: A helpful response from the agent.

**Step 7: Final commit**

No code changes needed — this is a verification task.
