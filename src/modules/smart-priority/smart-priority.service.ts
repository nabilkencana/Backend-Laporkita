import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { calculateHaversineDistanceMeters } from '../reports/utils/geo.util.js';
import { SmartPriorityWeights, SmartPriorityScoreResult } from './smart-priority.interface.js';
import { Prisma, ReportStatus } from '@prisma/client';

export const DEFAULT_WEIGHTS: SmartPriorityWeights = {
  w1_damage_severity: 0.35,
  w2_support: 0.2,
  w3_density: 0.25,
  w4_category: 0.2,
  density_radius_meters: 200,
  support_cap: 100,
};

@Injectable()
export class SmartPriorityService {
  private readonly logger = new Logger(SmartPriorityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mengambil bobot dinamis dari tabel database system_configs (Rules.md §1.3).
   * Fallback ke DEFAULT_WEIGHTS jika konfigurasi belum diset di DB.
   */
  async getWeights(): Promise<SmartPriorityWeights> {
    try {
      const config = await this.prisma.systemConfig.findUnique({
        where: { key: 'smart_priority_weights' },
      });

      if (config && typeof config.value === 'object' && config.value !== null) {
        const val = config.value as unknown as Partial<SmartPriorityWeights>;
        return {
          w1_damage_severity: Number(val.w1_damage_severity ?? DEFAULT_WEIGHTS.w1_damage_severity),
          w2_support: Number(val.w2_support ?? DEFAULT_WEIGHTS.w2_support),
          w3_density: Number(val.w3_density ?? DEFAULT_WEIGHTS.w3_density),
          w4_category: Number(val.w4_category ?? DEFAULT_WEIGHTS.w4_category),
          density_radius_meters: Number(
            val.density_radius_meters ?? DEFAULT_WEIGHTS.density_radius_meters,
          ),
          support_cap: Number(val.support_cap ?? DEFAULT_WEIGHTS.support_cap),
        };
      }
    } catch (err) {
      this.logger.warn('Gagal membaca smart_priority_weights dari DB, menggunakan default.', err);
    }

    return DEFAULT_WEIGHTS;
  }

  /**
   * Pure formula calculation:
   * urgency_score = w1*damage_severity + w2*support_count_normalized + w3*location_density_factor + w4*category_urgency_weight
   * Sesuai Rules.md §1.3
   */
  computeScore(
    damageSeverity: number,
    supportCount: number,
    locationDensityCount: number,
    categoryUrgencyWeight: number,
    weights: SmartPriorityWeights = DEFAULT_WEIGHTS,
  ): SmartPriorityScoreResult {
    // 1. Normalisasi Keparahan Kerusakan (0.0 - 1.0)
    const damageRaw = Math.max(0, Math.min(1.0, damageSeverity));
    const damageWeighted = weights.w1_damage_severity * damageRaw;

    // 2. Normalisasi Dukungan Warga (support_count / support_cap, max 1.0)
    const cap = Math.max(1, weights.support_cap);
    const supportNormalized = Math.max(0, Math.min(1.0, supportCount / cap));
    const supportWeighted = weights.w2_support * supportNormalized;

    // 3. Normalisasi Densitas Lokasi (jumlah laporan aktif sekitar / 10, max 1.0)
    const densityFactor = Math.max(0, Math.min(1.0, locationDensityCount / 10.0));
    const densityWeighted = weights.w3_density * densityFactor;

    // 4. Normalisasi Bobot Kategori (category.urgency_weight / 2.0, max 1.0)
    const catNormalized = Math.max(0, Math.min(1.0, categoryUrgencyWeight / 2.0));
    const catWeighted = weights.w4_category * catNormalized;

    // Total Skor Urgensi (0.0 – 1.0, diskalakan ke 1.0 – 5.0 untuk visualisasi yang mudah dibaca)
    const normalizedSum = damageWeighted + supportWeighted + densityWeighted + catWeighted;
    const finalScore = Number((normalizedSum * 5.0).toFixed(2));

    return {
      urgency_score: finalScore,
      components: {
        damage_severity_raw: damageRaw,
        damage_severity_weighted: Number(damageWeighted.toFixed(4)),
        support_count_raw: supportCount,
        support_normalized: Number(supportNormalized.toFixed(4)),
        support_weighted: Number(supportWeighted.toFixed(4)),
        location_density_raw: locationDensityCount,
        location_density_factor: Number(densityFactor.toFixed(4)),
        location_density_weighted: Number(densityWeighted.toFixed(4)),
        category_urgency_weight_raw: categoryUrgencyWeight,
        category_urgency_weighted: Number(catWeighted.toFixed(4)),
      },
    };
  }

  /**
   * Menghitung ulang skor urgensi laporan tertentu dan menyimpannya ke database
   */
  async recalculateUrgencyScore(reportId: string): Promise<number | null> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        category: {
          select: { urgency_weight: true },
        },
      },
    });

    if (!report) {
      this.logger.warn(`recalculateUrgencyScore: Report '${reportId}' not found.`);
      return null;
    }

    const weights = await this.getWeights();

    // Hitung jumlah laporan aktif lain di sekitar radius
    const nearbyCount = await this.countNearbyActiveReports(
      Number(report.latitude),
      Number(report.longitude),
      weights.density_radius_meters,
      reportId,
    );

    const damageSeverity =
      report.damage_severity ??
      (report.ai_confidence_score ? report.ai_confidence_score * 0.8 : 0.5);
    const categoryWeight = report.category.urgency_weight ?? 1.0;

    const result = this.computeScore(
      damageSeverity,
      report.support_count,
      nearbyCount,
      categoryWeight,
      weights,
    );

    await this.prisma.report.update({
      where: { id: reportId },
      data: { urgency_score: result.urgency_score },
    });

    this.logger.log(
      `Skor urgensi diperbarui untuk ${report.report_code}: ${result.urgency_score} (Damage: ${damageSeverity}, Supports: ${report.support_count}, Nearby: ${nearbyCount})`,
    );

    return result.urgency_score;
  }

  /**
   * Menghitung ulang skor urgensi laporan-laporan di sekitar koordinat tertentu
   * Dipanggil saat ada laporan baru masuk (Rules.md §1.3)
   */
  async recalculateNearbyReports(
    latitude: number,
    longitude: number,
    radiusMeters?: number,
  ): Promise<number> {
    const weights = await this.getWeights();
    const effectiveRadius = radiusMeters ?? weights.density_radius_meters ?? 200;
    const nearbyReports = await this.findNearbyActiveReports(latitude, longitude, effectiveRadius);

    let updatedCount = 0;
    for (const r of nearbyReports) {
      await this.recalculateUrgencyScore(r.id);
      updatedCount++;
    }

    return updatedCount;
  }

  /**
   * Menemukan dan menghitung laporan aktif dalam radius spasial menggunakan
   * optimasi Bounding Box pre-filter + presisi rumus Haversine
   */
  private async countNearbyActiveReports(
    lat: number,
    lng: number,
    radiusMeters: number,
    excludeReportId?: string,
  ): Promise<number> {
    const reports = await this.findNearbyActiveReports(lat, lng, radiusMeters, excludeReportId);
    return reports.length;
  }

  private async findNearbyActiveReports(
    lat: number,
    lng: number,
    radiusMeters: number,
    excludeReportId?: string,
  ): Promise<{ id: string; latitude: Prisma.Decimal; longitude: Prisma.Decimal }[]> {
    // 1 Derajat latitude ~ 111,000 meter. 200m ~ 0.0018 derajat
    const latDelta = (radiusMeters / 111000) * 1.5;
    const lngDelta = (radiusMeters / (111000 * Math.cos(lat * (Math.PI / 180)))) * 1.5;

    // 1. Optimasi BBox scan terlebih dahulu pada indeks database
    const candidates = await this.prisma.report.findMany({
      where: {
        ...(excludeReportId ? { id: { not: excludeReportId } } : {}),
        status: {
          in: [
            ReportStatus.pending_verification,
            ReportStatus.verified,
            ReportStatus.assigned,
            ReportStatus.in_progress,
          ],
        },
        latitude: {
          gte: new Prisma.Decimal(lat - latDelta),
          lte: new Prisma.Decimal(lat + latDelta),
        },
        longitude: {
          gte: new Prisma.Decimal(lng - lngDelta),
          lte: new Prisma.Decimal(lng + lngDelta),
        },
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
      },
    });

    // 2. Filter presisi lingkaran menggunakan rumus Haversine
    return candidates.filter((c) => {
      const dist = calculateHaversineDistanceMeters(
        lat,
        lng,
        Number(c.latitude),
        Number(c.longitude),
      );
      return dist <= radiusMeters;
    });
  }
}
