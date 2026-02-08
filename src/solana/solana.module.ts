import { Module, Global } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { SolanaService } from './solana.service';
import { Token } from '../db/models/Token';
import { Pool } from '../db/models/Pool';

@Global()
@Module({
  imports: [MikroOrmModule.forFeature([Token, Pool])],
  providers: [SolanaService],
  exports: [SolanaService],
})
export class SolanaModule {}
