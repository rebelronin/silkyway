import { Module } from '@nestjs/common';
import { IntentModule } from './intent/intent.module';
import { ChainsModule } from './chains/chains.module';

@Module({
  imports: [IntentModule, ChainsModule],
  exports: [IntentModule, ChainsModule],
})
export class ServicesModule {}
