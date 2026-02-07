import { Controller, Get, Param, BadRequestException } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { WalletService } from '../service/wallet.service';

@Controller('api/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':address/balance')
  async getBalance(@Param('address') address: string) {
    if (!address) {
      throw new BadRequestException({ ok: false, error: 'MISSING_FIELD', message: 'address is required' });
    }
    try {
      new PublicKey(address);
    } catch {
      throw new BadRequestException({ ok: false, error: 'INVALID_PUBKEY', message: 'address is not a valid public key' });
    }

    const data = await this.walletService.getBalances(address);
    return { ok: true, data };
  }
}
