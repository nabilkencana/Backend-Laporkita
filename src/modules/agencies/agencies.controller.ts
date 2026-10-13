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
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AgenciesService } from './agencies.service.js';
import { AgencyDetail } from './agencies.repository.js';
import { CreateAgencyDto } from './dto/create-agency.dto.js';
import { UpdateAgencyDto } from './dto/update-agency.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { UserRole, Agency } from '@prisma/client';

@ApiTags('Agencies')
@Controller('agencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgenciesController {
  constructor(private readonly agenciesService: AgenciesService) {}

  // Read endpoints are Public (Swagger docs & public viewer)
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Daftar Instansi Pemerintah (Publik)',
    description:
      'Mengambil daftar dinas/instansi beserta jumlah user, kategori, dan laporan tertugaskan.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar instansi berhasil diambil',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '22222222-2222-4000-8000-000000000001',
            name: 'Dinas Pekerjaan Umum dan Penataan Ruang (DPUPR)',
            type: 'dpupr',
            contact_email: 'dpupr@malangkota.go.id',
            _count: {
              users: 5,
              categories: 3,
              assigned_reports: 12,
            },
          },
        ],
        meta: null,
        error: null,
      },
    },
  })
  async findAll(): Promise<AgencyDetail[]> {
    return this.agenciesService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Detail Instansi Berdasarkan ID (Publik)',
    description: 'Mengambil informasi lengkap satu instansi berdasarkan UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID instansi (UUID v4)',
    example: '22222222-2222-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail instansi berhasil diambil',
    schema: {
      example: {
        success: true,
        data: {
          id: '22222222-2222-4000-8000-000000000001',
          name: 'Dinas Pekerjaan Umum dan Penataan Ruang (DPUPR)',
          type: 'dpupr',
          contact_email: 'dpupr@malangkota.go.id',
          _count: {
            users: 5,
            categories: 3,
            assigned_reports: 12,
          },
        },
        meta: null,
        error: null,
      },
    },
  })
  async findById(@Param('id', new UuidValidationPipe()) id: string): Promise<AgencyDetail> {
    return this.agenciesService.findById(id);
  }

  // Mutation endpoints are Admin-Only
  @Post()
  @ApiBearerAuth('bearer')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Buat Instansi Baru (Admin Only)',
    description: 'Mendaftarkan instansi pemerintah / OPD baru ke dalam sistem.',
  })
  @ApiResponse({
    status: 201,
    description: 'Instansi berhasil didaftarkan',
    schema: {
      example: {
        success: true,
        data: {
          id: '22222222-2222-4000-8000-000000000001',
          name: 'Dinas Pekerjaan Umum dan Penataan Ruang (DPUPR) Kota Malang',
          type: 'dpupr',
          contact_email: 'dpupr@malangkota.go.id',
        },
        meta: null,
        error: null,
      },
    },
  })
  async create(@Body() dto: CreateAgencyDto): Promise<Agency> {
    return this.agenciesService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth('bearer')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Perbarui Data Instansi (Admin Only)',
    description: 'Memperbarui nama, tipe, atau email kontak instansi.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID instansi (UUID v4)',
    example: '22222222-2222-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Data instansi berhasil diperbarui',
  })
  async update(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body() dto: UpdateAgencyDto,
  ): Promise<Agency> {
    return this.agenciesService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('bearer')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Hapus Instansi (Admin Only)',
    description: 'Menghapus instansi jika tidak terikat user, kategori, atau laporan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID instansi (UUID v4)',
    example: '22222222-2222-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Instansi berhasil dihapus',
    schema: {
      example: {
        success: true,
        data: {
          message: "Instansi dengan ID '22222222-2222-4000-8000-000000000001' berhasil dihapus.",
        },
        meta: null,
        error: null,
      },
    },
  })
  async delete(@Param('id', new UuidValidationPipe()) id: string): Promise<{ message: string }> {
    return this.agenciesService.delete(id);
  }
}
