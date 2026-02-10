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
