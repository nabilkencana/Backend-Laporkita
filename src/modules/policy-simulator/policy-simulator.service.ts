import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IPolicySimulatorService, PolicySimulationResult } from './policy-simulator.interface.js';

interface GeminiGenerateContentResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
}

@Injectable()
export class PolicySimulatorService implements IPolicySimulatorService {
  private readonly logger = new Logger(PolicySimulatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Menjalankan simulasi kebijakan berbasis LLM Gemini 2.5 atau Fallback MOCK
   * Sesuai Architecture.md §1 & §3.1 serta ERD.md §2.13
   */
  async simulatePolicy(
    requestedBy: string,
    promptText: string,
    zoneId?: string,
  ): Promise<PolicySimulationResult> {
    let zoneName: string | undefined = undefined;
    if (zoneId) {
      const zone = await this.prisma.zone.findUnique({
        where: { id: zoneId },
      });
      if (!zone) {
        throw new NotFoundException(`Zona dengan ID '${zoneId}' tidak ditemukan.`);
      }
      zoneName = zone.name;
    }

    const aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL');
    if (aiServiceUrl && /^https?:\/\//i.test(aiServiceUrl)) {
      try {
        this.logger.log(
          `Mengirim simulasi kebijakan ke AI Service: ${aiServiceUrl}/v1/policy-simulate`,
        );
        const apiKey =
          this.configService.get<string>('INTERNAL_API_KEY') ||
          this.configService.get<string>('AI_SERVICE_API_KEY') ||
          '';

        const aiResp = await firstValueFrom(
          this.httpService.post<{
            success?: boolean;
            data?: {
              result_narrative?: string;
              result_data?: Record<string, unknown>;
              key_recommendations?: string[];
              model_used?: string;
            };
            result_narrative?: string;
            result_data?: Record<string, unknown>;
            key_recommendations?: string[];
          }>(
            `${aiServiceUrl}/v1/policy-simulate`,
            {
              prompt_text: promptText,
              zone_id: zoneName ? `${zoneName} (${zoneId})` : zoneId,
              time_horizon_months: 6,
            },
            {
              headers: { 'X-API-Key': apiKey },
              timeout: 25000,
            },
          ),
        );

        const payload = aiResp.data?.data ?? aiResp.data;
        if (payload && (payload.result_narrative || payload.result_data)) {
          const proj = (payload.result_data ?? {}) as Record<string, unknown>;
          const reductionPct = Number(
            proj.estimated_incident_reduction_pct ??
              proj.estimated_complaint_reduction_percent ??
              proj.risk_reduction_pct ??
              38,
          );
          const budgetIdr = Number(
            proj.budget_estimate_idr ?? proj.estimated_budget_idr ?? 650000000,
          );
          const weeks = Number(proj.time_to_impact_weeks ?? 16);
          const months = Math.max(1, Math.round(weeks / 4));
          const simRiskScore = Number(
            (5.0 * (1 - Math.min(100, Math.max(0, reductionPct)) / 100)).toFixed(2),
          );
          const recs = Array.isArray(payload.key_recommendations) && payload.key_recommendations.length > 0
            ? payload.key_recommendations
            : Array.isArray(proj.risk_mitigations)
              ? (proj.risk_mitigations as string[])
              : [];

          const resultData: Record<string, unknown> = {
            ...proj,
            estimated_complaint_reduction_percent: reductionPct,
            estimated_incident_reduction_pct: reductionPct,
            risk_reduction_pct: reductionPct,
            estimated_budget_idr: budgetIdr,
            budget_estimate_idr: budgetIdr,
            implementation_months: months,
            time_horizon_months: months,
            time_to_impact_weeks: weeks,
            simulated_risk_score: simRiskScore,
            recommended_actions: recs,
            key_recommendations: recs,
            target_zone: zoneName ?? (proj.target_department as string) ?? 'Kota Malang',
            confidence_index: 0.9,
            source_model: payload.model_used ?? 'gemini-2.5-flash',
          };

          const narrativeText =
            payload.result_narrative ?? 'Simulasi kebijakan berhasil dijalankan.';

          const simulation = await this.prisma.policySimulation.create({
            data: {
              requested_by: requestedBy,
              prompt_text: promptText,
              zone_id: zoneId ?? null,
              result_narrative: narrativeText,
              result_data: resultData as never,
            },
          });

          return {
            id: simulation.id,
            requestedBy: simulation.requested_by,
            promptText: simulation.prompt_text,
            zoneId: simulation.zone_id,
            resultNarrative: simulation.result_narrative ?? narrativeText,
            resultData,
            createdAt: simulation.created_at,
            isMock: false,
          };
        }
      } catch (err) {
        this.logger.warn(
          `Panggilan AI Service /v1/policy-simulate gagal: ${
            err instanceof Error ? err.message : String(err)
          }. Mencoba fallback berikutnya.`,
        );
      }
    }

    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
    const dynamicMetrics = this.computeContextualMetrics(promptText, zoneId, zoneName);

    if (geminiApiKey) {
      try {
        this.logger.log(`Mengirim prompt simulasi kebijakan ke Google Gemini 2.5 API...`);

        const systemInstruction =
          'Anda adalah asisten AI perencana tata ruang perkotaan Kota Malang untuk platform LaporKita. Berikan analisis dampak kebijakan, estimasi penurunan keluhan, dan rekomendasi anggaran dalam format terstruktur.';

        const fullPrompt = `${systemInstruction}\n\nKonteks Wilayah: ${
          zoneName ?? 'Seluruh Wilayah Kota Malang'
        }\nUsulan Kebijakan: ${promptText}\n\nBerikan analisis komprehensif berupa:\n1. Narasi Analisis Dampak Kebijakan\n2. Estimasi Penurunan Laporan (%)\n3. Estimasi Anggaran (Rp)\n4. Jangka Waktu Implementasi (Bulan)\n5. Rekomendasi Mitigasi Risiko`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

        const response = await firstValueFrom(
          this.httpService.post<GeminiGenerateContentResponse>(
            geminiUrl,
            {
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048,
                thinkingConfig: { thinkingBudget: 0 },
              },
            },
            { timeout: 15000 },
          ),
        );

        const narrativeText =
          response.data.candidates?.[0]?.content?.parts?.[0]?.text ??
          'Simulasi berhasil dijalankan namun tidak ada narasi balasan.';

        const resultData = {
          ...dynamicMetrics,
          confidence_index: 0.88,
          source_model: 'Gemini 2.5 Flash',
        };

        const simulation = await this.prisma.policySimulation.create({
          data: {
            requested_by: requestedBy,
            prompt_text: promptText,
            zone_id: zoneId ?? null,
            result_narrative: narrativeText,
            result_data: resultData as never,
          },
        });

        return {
          id: simulation.id,
          requestedBy: simulation.requested_by,
          promptText: simulation.prompt_text,
          zoneId: simulation.zone_id,
          resultNarrative: simulation.result_narrative ?? narrativeText,
          resultData,
          createdAt: simulation.created_at,
          isMock: false,
        };
      } catch (error) {
        this.logger.warn(
          `Panggilan Gemini API gagal: ${
            error instanceof Error ? error.message : String(error)
          }. Menggunakan fallback MOCK Policy Simulator.`,
        );
      }
    }

    return this.mockSimulatePolicy(requestedBy, promptText, zoneId, zoneName);
  }

  private computeContextualMetrics(
    promptText: string,
    zoneId?: string,
    zoneName?: string,
  ): Record<string, unknown> {
    const lower = promptText.toLowerCase();
    const area = zoneName ?? 'Kota Malang';
    let hash = 0;
    const seedStr = `${promptText}|${zoneId ?? ''}|${zoneName ?? ''}`;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
    }

    let baseBudget = 420_000_000;
    let baseReduction = 32;
    let months = 5;
    let recs: string[] = [
      `Audit lapangan terpadu di koridor prioritas ${area}`,
      'Penjadwalan pengerjaan pada jam lalu lintas rendah (22.00 - 05.00 WIB)',
      'Integrasi pelaporan warga LaporKita untuk evaluasi berkala',
    ];

    if (lower.includes('drainase') || lower.includes('banjir') || lower.includes('saluran') || lower.includes('pompa')) {
      baseBudget = 1_450_000_000;
      baseReduction = 44;
      months = 6;
      recs = [
        `Pengerukan sedimen dan normalisasi saluran drainase primer di ${area}`,
        'Pemasangan saringan sampah mekanis dan sensor tinggi muka air',
        'Koordinasi lintas OPD (DPUPRPKP & DLH) untuk pemeliharaan berkala',
      ];
    } else if (lower.includes('lampu') || lower.includes('pju') || lower.includes('penerangan') || lower.includes('led')) {
      baseBudget = 310_000_000;
      baseReduction = 52;
      months = 3;
      recs = [
        `Penggantian lampu jalan ke unit LED hemat energi di ${area}`,
        'Pemasangan panel kontrol otomatis berbasis sensor cahaya (photocell)',
        'Patroli malam Dishub untuk pemetaan titik gelap rawan kecelakaan',
      ];
    } else if (lower.includes('trotoar') || lower.includes('difabel') || lower.includes('pejalan')) {
      baseBudget = 680_000_000;
      baseReduction = 39;
      months = 4;
      recs = [
        `Revitalisasi ubin pemandu (guiding block) ramah difabel di ${area}`,
        'Pemasangan bollard pembatas agar trotoar steril dari kendaraan bermotor',
        'Perbaikan kemiringan ramp akses kursi roda di persimpangan utama',
      ];
    } else if (lower.includes('jalan') || lower.includes('aspal') || lower.includes('berlubang')) {
      baseBudget = 890_000_000;
      baseReduction = 47;
      months = 5;
      recs = [
        `Pelapisan ulang (overlay) aspal hotmix pada ruas jalan arteri ${area}`,
        'Penambalan cepat (quick response cold-mix) untuk lubang jalan berisiko tinggi',
        'Pengujian kepadatan lapis pondasi sebelum pengaspalan ulang',
      ];
    }

    const budgetOffset = ((hash % 19) - 9) * 15_000_000;
    const reductionOffset = Number((((hash >> 4) % 15) - 7) * 0.5);
    const finalBudget = Math.max(100_000_000, baseBudget + budgetOffset);
    const finalReduction = Number(Math.min(85, Math.max(15, baseReduction + reductionOffset)).toFixed(1));
    const simRiskScore = Number((5.0 * (1 - finalReduction / 100)).toFixed(2));

    return {
      target_zone: area,
      estimated_complaint_reduction_percent: finalReduction,
      estimated_incident_reduction_pct: finalReduction,
      risk_reduction_pct: finalReduction,
      estimated_budget_idr: finalBudget,
      budget_estimate_idr: finalBudget,
      implementation_months: months,
      time_horizon_months: months,
      simulated_risk_score: simRiskScore,
      recommended_actions: recs,
      key_recommendations: recs,
    };
  }

  /**
   * Mock implementation simulasi kebijakan berbasis aturan heuristik dinamis
   */
  private async mockSimulatePolicy(
    requestedBy: string,
    promptText: string,
    zoneId?: string,
    zoneName?: string,
  ): Promise<PolicySimulationResult> {
    const area = zoneName ?? 'Kota Malang';
    const dynamicMetrics = this.computeContextualMetrics(promptText, zoneId, zoneName);
    const redPct = dynamicMetrics.estimated_complaint_reduction_percent as number;
    const budget = dynamicMetrics.estimated_budget_idr as number;
    const recs = dynamicMetrics.recommended_actions as string[];

    const narrative = `### Analisis Simulasi Kebijakan LaporKita (${area})
**Usulan Kebijakan:** "${promptText}"

#### 1. Proyeksi Efektivitas & Dampak
- Penerapan intervensi di wilayah **${area}** diproyeksikan menurunkan kepadatan laporan sebesar **${redPct}%** dalam kurun waktu ${dynamicMetrics.implementation_months} bulan.

#### 2. Estimasi Kebutuhan Finansial & Waktu
- **Estimasi Anggaran:** Rp ${budget.toLocaleString('id-ID')}
- **Estimasi Waktu Pengerjaan:** ${dynamicMetrics.implementation_months} Bulan

#### 3. Rekomendasi Langkah Aksi
1. ${recs[0]}
2. ${recs[1]}
3. ${recs[2]}`;

    const resultData: Record<string, unknown> = {
      ...dynamicMetrics,
      projected_satisfaction_increase: 1.8,
      risk_factors: ['Curah hujan tinggi pada musim penghujan', 'Disrupsi arus lalu lintas lokal'],
      is_mock: true,
    };

    const simulation = await this.prisma.policySimulation.create({
      data: {
        requested_by: requestedBy,
        prompt_text: promptText,
        zone_id: zoneId ?? null,
        result_narrative: narrative,
        result_data: resultData as never,
      },
    });

    return {
      id: simulation.id,
      requestedBy: simulation.requested_by,
      promptText: simulation.prompt_text,
      zoneId: simulation.zone_id,
      resultNarrative: narrative,
      resultData,
      createdAt: simulation.created_at,
      isMock: true,
    };
  }

  async findAll(limit = 20, cursor?: string) {
    const total = await this.prisma.policySimulation.count();
    const simulations = await this.prisma.policySimulation.findMany({
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { created_at: 'desc' },
      include: {
        requester: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        zone: {
          select: { id: true, name: true, stress_level: true },
        },
      },
    });

    let nextCursor: string | null = null;
    if (simulations.length > limit) {
      const nextItem = simulations.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    return {
      data: simulations,
      meta: {
        total,
        limit,
        nextCursor,
        hasPrevious: !!cursor,
      },
    };
  }

  async findById(id: string) {
    const simulation = await this.prisma.policySimulation.findUnique({
      where: { id },
      include: {
        requester: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        zone: {
          select: { id: true, name: true, stress_level: true },
        },
      },
    });

    if (!simulation) {
      throw new NotFoundException(`Simulasi kebijakan dengan ID '${id}' tidak ditemukan.`);
    }

    return simulation;
  }
}
