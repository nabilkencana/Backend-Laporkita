import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MapsService } from './maps.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReverseGeocodeJobData } from './maps.interface.js';

@Processor('reverse-geocode', {
  concurrency: 1, // Syarat OpenStreetMap Nominatim Usage Policy (max 1 req/sec)
  limiter: {
    max: 1,
    duration: 1000, // 1 request per 1000ms
  },
})
export class ReverseGeocodeProcessor extends WorkerHost {
  private readonly logger = new Logger(ReverseGeocodeProcessor.name);

  constructor(
    private readonly mapsService: MapsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ReverseGeocodeJobData>): Promise<{ status: string; address: string }> {
    const { reportId, latitude, longitude } = job.data;
    this.logger.log(
      `[ReverseGeocode Worker] Memproses geocoding untuk laporan ${reportId} di (${latitude}, ${longitude})`,
    );

    const result = await this.mapsService.reverseGeocode(latitude, longitude);

    // Update address_text di tabel reports jika belum diisi atau perlu diperbarui
    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        address_text: result.address,
      },
    });

    this.logger.log(
      `[ReverseGeocode Worker] Berhasil memperbarui address_text untuk ${reportId}: "${result.address}" (Attribution: ${result.attribution})`,
    );

    return { status: 'COMPLETED', address: result.address };
  }
}
