import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PolicySimulatorService } from './policy-simulator.service.js';
import { CreatePolicySimulationDto } from './dto/create-simulation.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';

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
  async findAll(@Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.policySimulatorService.findAll(limit ? Number(limit) : 20, cursor);
  }

  /**
   * Detail Simulasi Kebijakan — GET /api/v1/policy-simulations/:id
   */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.policySimulatorService.findById(id);
  }
}
