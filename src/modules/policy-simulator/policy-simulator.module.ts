import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PolicySimulatorService } from './policy-simulator.service.js';
import { PolicySimulatorController } from './policy-simulator.controller.js';

@Module({
  imports: [HttpModule],
  controllers: [PolicySimulatorController],
  providers: [PolicySimulatorService],
  exports: [PolicySimulatorService],
})
export class PolicySimulatorModule {}
