import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AgenciesService } from './agencies.service.js';
import { AgencyDetail } from './agencies.repository.js';
import { CreateAgencyDto } from './dto/create-agency.dto.js';
import { UpdateAgencyDto } from './dto/update-agency.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole, Agency } from '@prisma/client';

@Controller('agencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  // Read endpoints are Authenticated
  @Get()
  async findAll(): Promise<AgencyDetail[]> {
    return this.agenciesService.findAll();
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<AgencyDetail> {
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgencyDto,
  ): Promise<Agency> {
    return this.agenciesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.agenciesService.delete(id);
  }
}
