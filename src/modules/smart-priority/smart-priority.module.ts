import { Module } from '@nestjs/common';
import { SmartPriorityService } from './smart-priority.service.js';

@Module({
  providers: [SmartPriorityService],
  exports: [SmartPriorityService],
})
export class SmartPriorityModule {}
