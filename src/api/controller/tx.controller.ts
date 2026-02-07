import {
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { TxService, CreateTransferParams, ClaimTransferParams, CancelTransferParams } from '../service/tx.service';
import { SolanaService } from '../../solana/solana.service';

@Controller('api/tx')
export class TxController {
  private readonly logger = new Logger(TxController.name);

  constructor(
    private readonly txService: TxService,
    private readonly solanaService: SolanaService,
  ) {}

  @Post('create-transfer')
  @HttpCode(200)
  async createTransfer(@Body() body: CreateTransferParams) {
    this.validatePubkey(body.sender, 'sender');
    this.validatePubkey(body.recipient, 'recipient');
    if (body.poolPda) this.validatePubkey(body.poolPda, 'poolPda');
    if (body.mint) this.validatePubkey(body.mint, 'mint');
    if (!body.amount || body.amount <= 0) {
      throw new BadRequestException({ ok: false, error: 'INVALID_AMOUNT', message: 'Amount must be positive' });
    }
    if (!body.poolPda && !body.mint && !body.token) {
      throw new BadRequestException({ ok: false, error: 'MISSING_FIELD', message: 'Provide poolPda, mint, or token' });
    }

    const data = await this.txService.buildCreateTransfer(body);
    return { ok: true, data };
  }

  @Post('claim-transfer')
  @HttpCode(200)
  async claimTransfer(@Body() body: ClaimTransferParams) {
    this.validatePubkey(body.claimer, 'claimer');
    this.validatePubkey(body.transferPda, 'transferPda');

    const data = await this.txService.buildClaimTransfer(body);
    return { ok: true, data };
  }

  @Post('cancel-transfer')
  @HttpCode(200)
  async cancelTransfer(@Body() body: CancelTransferParams) {
    this.validatePubkey(body.canceller, 'canceller');
    this.validatePubkey(body.transferPda, 'transferPda');

    const data = await this.txService.buildCancelTransfer(body);
    return { ok: true, data };
  }

  @Post('submit')
  @HttpCode(200)
  async submitTx(@Body() body: { signedTx: string }) {
    if (!body.signedTx) {
      throw new BadRequestException({ ok: false, error: 'MISSING_TX', message: 'signedTx is required' });
    }

    try {
      const data = await this.txService.submitSignedTx(body.signedTx);
      return { ok: true, data };
    } catch (e) {
      this.logger.error(`Submit tx failed: ${e.message}`);
      throw new BadRequestException({ ok: false, error: 'TX_FAILED', message: e.message });
    }
  }

  @Post('/faucet')
  @HttpCode(200)
  async faucet(@Body() body: { wallet: string; token?: string }) {
    this.validatePubkey(body.wallet, 'wallet');
    const wallet = new PublicKey(body.wallet);

    try {
      if (body.token === 'usdc') {
        const data = await this.solanaService.mintUsdc(wallet);
        return { ok: true, data };
      } else if (body.token === 'sol' || !body.token) {
        const data = await this.solanaService.requestAirdrop(wallet);
        return { ok: true, data };
      } else {
        throw new BadRequestException({ ok: false, error: 'UNSUPPORTED_TOKEN', message: `Token '${body.token}' not supported. Use 'sol' or 'usdc'.` });
      }
    } catch (e) {
      if (e.message?.startsWith('RATE_LIMITED')) {
        throw new BadRequestException({ ok: false, error: 'RATE_LIMITED', message: e.message });
      }
      throw new BadRequestException({ ok: false, error: 'FAUCET_FAILED', message: e.message });
    }
  }

  private validatePubkey(value: string, field: string) {
    if (!value) {
      throw new BadRequestException({ ok: false, error: 'MISSING_FIELD', message: `${field} is required` });
    }
    try {
      new PublicKey(value);
    } catch {
      throw new BadRequestException({ ok: false, error: 'INVALID_PUBKEY', message: `${field} is not a valid public key` });
    }
  }
}
