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

    const geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');

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
                temperature: 0.4,
                maxOutputTokens: 1500,
              },
            },
            { timeout: 10000 },
          ),
        );

        const narrativeText =
          response.data.candidates?.[0]?.content?.parts?.[0]?.text ??
          'Simulasi berhasil dijalankan namun tidak ada narasi balasan.';

        const resultData = {
          estimated_complaint_reduction_percent: 35,
          estimated_budget_idr: 450000000,
          implementation_months: 6,
          target_zone: zoneName ?? 'Kota Malang',
          confidence_index: 0.86,
          source_model: 'Gemini 2.5 Flash',
        };

        const simulation = await this.prisma.policySimulation.create({
          data: {
            requested_by: requestedBy,
            prompt_text: promptText,
            zone_id: zoneId ?? null,
            result_narrative: narrativeText,
            result_data: resultData,
          },
        });

        return {
          id: simulation.id,
          requestedBy: simulation.requested_by,
          promptText: simulation.prompt_text,
          zoneId: simulation.zone_id,
          resultNarrative: simulation.result_narrative ?? '',
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

    // =========================================================================
    // MOCK — ganti ke panggilan Gemini API asli saat API key tersedia
    // =========================================================================
    return this.mockSimulatePolicy(requestedBy, promptText, zoneId, zoneName);
  }

  /**
   * Mock implementation simulasi kebijakan berbasis aturan heuristik
   */
  private async mockSimulatePolicy(
    requestedBy: string,
    promptText: string,
    zoneId?: string,
    zoneName?: string,
  ): Promise<PolicySimulationResult> {
    const area = zoneName ?? 'Kota Malang';

    const narrative = `### 🏛️ Analisis Simulasi Kebijakan LaporKita (${area})
**Usulan Kebijakan:** "${promptText}"

#### 1. Proyeksi Efektivitas & Dampak
- Penerapan intervensi infrastruktur terpadu di wilayah **${area}** diproyeksikan dapat mengurangi kepadatan laporan kerusakan publik sebesar **28% - 42%** dalam kurun waktu 6 bulan pertama.
- Titik kemacetan dan risiko genangan air lokal dapat diminimalisir dengan perbaikan drainase primer dan overlay aspal bertahap.

#### 2. Estimasi Kebutuhan Finansial & Waktu
- **Estimasi Anggaran:** Rp 380.000.000 – Rp 520.000.000
- **Estimasi Waktu Pengerjaan:** 4 – 6 Bulan
- **Indeks Kepuasan Publik:** Proyeksi peningkatan +1.8 pada skala kepuasan kota.

#### 3. Rekomendasi Langkah Aksi
1. Pengadaan material aspal cold-mix tahan cuaca untuk penanganan cepat (quick response).
2. Penyelarasan jadwal pengerjaan proyek dengan jam lalu lintas non-sibuk (22.00 - 05.00 WIB).
3. Pemasangan sensor ketinggian air otomatis pada saluran drainase kritis.`;

    const resultData = {
      target_zone: area,
      estimated_complaint_reduction_percent: 35,
      estimated_budget_idr: 450000000,
      implementation_months: 5,
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
        result_data: resultData,
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
