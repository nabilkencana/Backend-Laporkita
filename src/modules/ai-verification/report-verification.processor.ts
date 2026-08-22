import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { AIVerificationService } from './ai-verification.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { SmartPriorityService } from '../smart-priority/smart-priority.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReportStatus } from '@prisma/client';

export interface VerifyReportJobData {
  reportId: string;
}

@Processor('verify-report')
export class ReportVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportVerificationProcessor.name);

  constructor(
    private readonly aiVerificationService: AIVerificationService,
    private readonly reportsService: ReportsService,
    private readonly smartPriorityService: SmartPriorityService,
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue('reverse-geocode') private readonly reverseGeocodeQueue?: Queue,
  ) {
    super();
  }

  async process(job: Job<VerifyReportJobData>): Promise<{ status: string; confidence: number }> {
    const { reportId } = job.data;
    this.logger.log(`[BullMQ Worker] Memulai proses verifikasi AI untuk laporan: ${reportId}`);

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      this.logger.error(`[BullMQ Worker] Laporan '${reportId}' tidak ditemukan di database.`);
      return { status: 'NOT_FOUND', confidence: 0 };
    }

    // 1. Eksekusi Verifikasi AI (FastAPI / Gemini Vision / MOCK)
    const verification = await this.aiVerificationService.verifyReport(reportId);

    // 2. Simpan skor confidence & estimasi keparahan ke database
    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        ai_confidence_score: verification.confidence,
        damage_severity: verification.damageSeverity,
      },
    });

    // 3. Hitung skor urgensi awal dengan Smart Priority Engine
    await this.smartPriorityService.recalculateUrgencyScore(reportId);

    // 4. Evaluasi aturan bisnis Rules.md §1.2
    const meetsConfidence = verification.confidence >= 0.6;
    const isSpatialValid = verification.isValidGps;
    const isTemporalValid = verification.isValidTimestamp;

    // F5-1: Set flag eksplisit needs_manual_review sesuai Rules.md §1.2.
    // true jika: confidence < 0.6 ATAU isValidGps=false ATAU isValidTimestamp=false.
    // Operator bisa filter via GET /reports?needsManualReview=true.
    const needsManualReview = !meetsConfidence || !isSpatialValid || !isTemporalValid;
    await this.prisma.report.update({
      where: { id: reportId },
      data: { needs_manual_review: needsManualReview },
    });

    if (meetsConfidence && isSpatialValid && isTemporalValid) {
      // ── Lolos verifikasi otomatis (Confidence >= 0.6) ──────────────────────
      this.logger.log(
        `[BullMQ Worker] Laporan ${report.report_code} lolos verifikasi AI (Confidence: ${verification.confidence}). Mengubah status ke 'verified'.`,
      );

      // Transisi status ke verified (Rules.md §1.1 & §1.2)
      // transitionReportStatus otomatis membuat notifikasi in-app dan memberi +10 poin kontribusi
      await this.reportsService.transitionReportStatus(
        reportId,
        ReportStatus.verified,
        '00000000-0000-4000-8000-000000000001', // system/admin ID
        `Lolos verifikasi AI otomatis (Confidence: ${(verification.confidence * 100).toFixed(0)}%, Keparahan: ${((verification.damageSeverity ?? 0.5) * 100).toFixed(0)}%)`,
      );

      // Enqueue reverse geocoding via OpenStreetMap Nominatim jika belum memiliki address_text (Fase 2 / Maps)
      if (this.reverseGeocodeQueue && !report.address_text) {
        try {
          await this.reverseGeocodeQueue.add(
            'reverse-geocode-job',
            {
              reportId: report.id,
              latitude: Number(report.latitude),
              longitude: Number(report.longitude),
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: true,
            },
          );
        } catch (err) {
          this.logger.warn(`Gagal enqueue reverse-geocode untuk ${report.id}:`, err);
        }
      }

      return { status: 'VERIFIED', confidence: verification.confidence };
    } else {
      // ── Tidak lolos otomatis (Confidence < 0.6 atau GPS/Waktu anomali) ─────
      // ATURAN KRITIKAL Rules.md §1.2: JANGAN tolak otomatis!
      // Masuk ke antrian verifikasi manual operator (tetap pending_verification).
      const reasons: string[] = [];
      if (!meetsConfidence) reasons.push(`Confidence rendah (${verification.confidence} < 0.6)`);
      if (!isSpatialValid) reasons.push('Koordinat GPS di luar jangkauan Kota Malang');
      if (!isTemporalValid) reasons.push('Waktu laporan tidak valid');

      this.logger.warn(
        `[BullMQ Worker] Laporan ${report.report_code} dialihkan ke antrian verifikasi manual operator (needs_manual_review=true). Alasan: ${reasons.join(', ')}`,
      );

      return { status: 'MANUAL_REVIEW_REQUIRED', confidence: verification.confidence };
    }
  }
}
