import { Module } from '@nestjs/common';
import { AgenciesController } from './agencies.controller.js';
import { AgenciesService } from './agencies.service.js';
import { AgenciesRepository } from './agencies.repository.js';

@Module({
  controllers: [AgenciesController],
  providers: [AgenciesService, AgenciesRepository],
  exports: [AgenciesService, AgenciesRepository],
})
export class AgenciesModule {}
