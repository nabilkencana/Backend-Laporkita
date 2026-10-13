import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PolicySimulatorService } from './policy-simulator.service.js';
import { CreatePolicySimulationDto } from './dto/create-simulation.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { UserRole } from '@prisma/client';

@ApiTags('Policy Simulator')
@ApiBearerAuth('bearer')
@Controller('policy-simulations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.policy_maker, UserRole.admin)
export class PolicySimulatorController {
  constructor(private readonly policySimulatorService: PolicySimulatorService) {}

  /**
   * Jalankan Simulasi Kebijakan Baru — POST /api/v1/policy-simulations
   * Khusus role policy_maker & admin (PRD §3 & Architecture §3.1)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Jalankan Simulasi Kebijakan Tata Ruang Baru (Policy Maker & Admin Only)',
    description:
      'Menganalisis usulan intervensi kebijakan perkotaan menggunakan AI Gemini LLM untuk memprediksi dampak penurunan keluhan, estimasi anggaran, dan mitigasi risiko.',
  })
  @ApiResponse({
    status: 201,
    description: 'Simulasi kebijakan berhasil dijalankan',
    schema: {
      example: {
        success: true,
        data: {
          id: '99999999-9999-4000-8000-000000000001',
          simulationCode: 'POL-SIM-2026-0001',
          requestedBy: '11111111-1111-4000-8000-000000000001',
          promptText:
            'Pemasangan 20 unit biopori dan perbaikan saluran drainase primer di kawasan Lowokwaru.',
          zoneId: '55555555-5555-4000-8000-000000000001',
          resultData: {
            impactAnalysis:
              'Pemasangan biopori akan mempercepat resapan air permukaan hingga 40% saat hujan deras.',
            estimatedComplaintReductionPct: 35,
            estimatedBudgetRp: 150000000,
            implementationMonths: 3,
            riskMitigationRecommendations: [
              'Sosialisasi warga untuk menjaga kebersihan lubang biopori dari sampah anorganik.',
            ],
          },
          createdAt: '2026-08-22T08:00:00.000Z',
          isMock: false,
        },
        meta: null,
        error: null,
      },
    },
  })
  async createSimulation(
    @Body() dto: CreatePolicySimulationDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.policySimulatorService.simulatePolicy(requesterId, dto.prompt_text, dto.zone_id);
  }

  /**
   * List Riwayat Simulasi Kebijakan — GET /api/v1/policy-simulations
   */
  @Get()
  @ApiOperation({
    summary: 'Daftar Riwayat Simulasi Kebijakan (Policy Maker & Admin Only)',
    description: 'Mengambil daftar riwayat simulasi kebijakan yang pernah dijalankan (cursor-based pagination).',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, example: '99999999-9999-4000-8000-000000000001' })
  @ApiResponse({
    status: 200,
    description: 'Daftar simulasi kebijakan berhasil diambil',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '99999999-9999-4000-8000-000000000001',
            simulation_code: 'POL-SIM-2026-0001',
            prompt_text:
              'Pemasangan 20 unit biopori dan perbaikan saluran drainase primer di kawasan Lowokwaru.',
            created_at: '2026-08-22T08:00:00.000Z',
            requester: {
              id: '11111111-1111-4000-8000-000000000001',
              full_name: 'Budi Santoso',
              email: 'budi@example.com',
              role: 'policy_maker',
            },
            zone: {
              id: '55555555-5555-4000-8000-000000000001',
              name: 'Kecamatan Lowokwaru',
              stress_level: 'medium',
            },
          },
        ],
        meta: {
          total: 1,
          limit: 20,
          nextCursor: null,
          hasPrevious: false,
        },
        error: null,
      },
    },
  })
  async findAll(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.policySimulatorService.findAll(limit ? Number(limit) : 20, cursor);
  }

  /**
   * Detail Simulasi Kebijakan — GET /api/v1/policy-simulations/:id
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Detail Simulasi Kebijakan Berdasarkan ID (Policy Maker & Admin Only)',
    description: 'Mengambil detail hasil simulasi kebijakan perkotaan beserta analisis dampak.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID simulasi kebijakan (UUID v4)',
    example: '99999999-9999-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail simulasi kebijakan berhasil diambil',
  })
  async findById(@Param('id', new UuidValidationPipe()) id: string) {
    return this.policySimulatorService.findById(id);
  }
}
