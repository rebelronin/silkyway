import { Module } from '@nestjs/common';
import { SolanaModule } from '../../../solana/solana.module';
import { NativeBuilder } from './programs/native.builder';
import { HandshakeBuilder } from './programs/handshake.builder';
import { SolanaBuilder } from './solana.builder';
import { SolanaAnalyzer } from './solana.analyzer';

@Module({
  imports: [SolanaModule],
  providers: [NativeBuilder, HandshakeBuilder, SolanaBuilder, SolanaAnalyzer],
  exports: [SolanaBuilder, SolanaAnalyzer],
})
export class SolanaChainModule {}
