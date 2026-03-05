import { Module } from '@nestjs/common';
import { ChainsModule } from '../chains/chains.module';
import { IntentBuildService } from './intent-build.service';
import { IntentAnalyzeService } from './intent-analyze.service';

@Module({
  imports: [ChainsModule],
  providers: [IntentBuildService, IntentAnalyzeService],
  exports: [IntentBuildService, IntentAnalyzeService],
})
export class IntentModule {}
