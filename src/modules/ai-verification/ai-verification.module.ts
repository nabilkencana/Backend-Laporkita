import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { AIVerificationService } from './ai-verification.service.js';
import { ReportVerificationProcessor } from './report-verification.processor.js';
import { ReportsModule } from '../reports/reports.module.js';
import { SmartPriorityModule } from '../smart-priority/smart-priority.module.js';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({ name: 'verify-report' }, { name: 'reverse-geocode' }),
    ReportsModule,
    SmartPriorityModule,
  ],
  providers: [AIVerificationService, ReportVerificationProcessor],
  exports: [AIVerificationService],
})
export class AIVerificationModule {}
