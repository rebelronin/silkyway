import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Transfer } from '../db/models/Transfer';
import { Pool } from '../db/models/Pool';
import { Token } from '../db/models/Token';
import { TxController } from './controller/tx.controller';
import { TransferController } from './controller/transfer.controller';
import { TxService } from './service/tx.service';
import { TransferService } from './service/transfer.service';

@Module({
  imports: [MikroOrmModule.forFeature([Transfer, Pool, Token])],
  controllers: [TxController, TransferController],
  providers: [TxService, TransferService],
})
export class ApiModule {}
