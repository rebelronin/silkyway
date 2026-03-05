import { Module } from '@nestjs/common';
import { SolanaChainModule } from './solana/solana-chain.module';

@Module({
  imports: [SolanaChainModule],
  exports: [SolanaChainModule],
})
export class ChainsModule {}
