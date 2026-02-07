import { Controller, Get } from '@nestjs/common';
import { TokenService } from '../service/token.service';

@Controller('api/tokens')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get()
  async listTokens() {
    const tokens = await this.tokenService.listTokens();
    return { ok: true, data: { tokens } };
  }
}
