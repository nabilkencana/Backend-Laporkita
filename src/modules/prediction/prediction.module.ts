import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PredictionService } from './prediction.service.js';
import { PredictionController } from './prediction.controller.js';

@Module({
  imports: [HttpModule],
  controllers: [PredictionController],
  providers: [PredictionService],
  exports: [PredictionService],
})
export class PredictionModule {}
