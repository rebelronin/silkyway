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
