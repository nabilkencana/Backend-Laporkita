import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AgenciesService } from './agencies.service.js';
import { AgencyDetail } from './agencies.repository.js';
import { CreateAgencyDto } from './dto/create-agency.dto.js';
import { UpdateAgencyDto } from './dto/update-agency.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { UserRole, Agency } from '@prisma/client';

@ApiBearerAuth()
@Controller('agencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  // Read endpoints are Public (Swagger docs & public viewer)
  @Public()
  @Get()
  async findAll(): Promise<AgencyDetail[]> {
    return this.agenciesService.findAll();
  }

  @Public()
  @Get(':id')
  async findById(@Param('id', new UuidValidationPipe()) id: string): Promise<AgencyDetail> {
    return this.agenciesService.findById(id);
  }

  // Mutation endpoints are Admin-Only
  @Post()
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAgencyDto): Promise<Agency> {
    return this.agenciesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  async update(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body() dto: UpdateAgencyDto,
  ): Promise<Agency> {
    return this.agenciesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  async delete(@Param('id', new UuidValidationPipe()) id: string): Promise<{ message: string }> {
    return this.agenciesService.delete(id);
  }
}
