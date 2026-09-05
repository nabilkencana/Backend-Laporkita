import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { MapsController } from './maps.controller.js';
import { MapsService } from './maps.service.js';
import { ReverseGeocodeProcessor } from './reverse-geocode.processor.js';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({
      name: 'reverse-geocode',
    }),
  ],
  controllers: [MapsController],
  providers: [MapsService, ReverseGeocodeProcessor],
  exports: [MapsService, BullModule],
})
export class MapsModule {}
