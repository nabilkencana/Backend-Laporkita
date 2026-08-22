import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { ReportsRepository } from './reports.repository.js';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
