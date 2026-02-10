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
