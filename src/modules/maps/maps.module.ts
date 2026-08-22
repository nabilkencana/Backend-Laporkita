import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { MapsService } from './maps.service.js';
import { ReverseGeocodeProcessor } from './reverse-geocode.processor.js';

@Module({
  imports: [
    HttpModule,
    BullModule.registerQueue({
      name: 'reverse-geocode',
    }),
  ],
  providers: [MapsService, ReverseGeocodeProcessor],
  exports: [MapsService, BullModule],
})
export class MapsModule {}
