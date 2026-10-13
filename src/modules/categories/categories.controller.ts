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
import { CategoriesService } from './categories.service.js';
import { CategoryWithAgency } from './categories.repository.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Public } from '../../common/decorators/roles.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { UserRole } from '@prisma/client';

@ApiTags('Categories')
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // Read endpoints are Public
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Daftar Kategori Fasilitas Publik (Publik)',
    description: 'Mengambil seluruh kategori laporan beserta data instansi penanggung jawab default.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar kategori berhasil diambil',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '33333333-3333-4000-8000-000000000001',
            name: 'Jalan Rusak / Berlubang',
            icon_url: 'https://storage.laporkita.id/icons/road.svg',
            urgency_weight: '1.5',
            default_agency_id: '22222222-2222-4000-8000-000000000001',
            default_agency: {
              id: '22222222-2222-4000-8000-000000000001',
              name: 'Dinas Pekerjaan Umum dan Penataan Ruang (DPUPR)',
              type: 'dpupr',
            },
          },
        ],
        meta: null,
        error: null,
      },
    },
  })
  async findAll(): Promise<CategoryWithAgency[]> {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Detail Kategori Berdasarkan ID (Publik)',
    description: 'Mengambil data spesifik kategori beserta instansi penanggung jawabnya.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID kategori (UUID v4)',
    example: '33333333-3333-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail kategori berhasil diambil',
    schema: {
      example: {
        success: true,
        data: {
          id: '33333333-3333-4000-8000-000000000001',
          name: 'Jalan Rusak / Berlubang',
          icon_url: 'https://storage.laporkita.id/icons/road.svg',
          urgency_weight: '1.5',
          default_agency_id: '22222222-2222-4000-8000-000000000001',
          default_agency: {
            id: '22222222-2222-4000-8000-000000000001',
            name: 'Dinas Pekerjaan Umum dan Penataan Ruang (DPUPR)',
            type: 'dpupr',
          },
        },
        meta: null,
        error: null,
      },
    },
  })
  async findById(@Param('id', new UuidValidationPipe()) id: string): Promise<CategoryWithAgency> {
    return this.categoriesService.findById(id);
  }

  // Mutation endpoints are Admin-Only
  @Post()
  @ApiBearerAuth('bearer')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Buat Kategori Baru (Admin Only)',
    description: 'Mendaftarkan jenis kerusakan fasilitas publik baru dan menetapkan dinas pengampu default.',
  })
  @ApiResponse({
    status: 201,
    description: 'Kategori berhasil dibuat',
    schema: {
      example: {
        success: true,
        data: {
          id: '33333333-3333-4000-8000-000000000001',
          name: 'Jalan Rusak / Berlubang',
          icon_url: 'https://storage.laporkita.id/icons/road.svg',
          urgency_weight: '1.5',
          default_agency_id: '22222222-2222-4000-8000-000000000001',
        },
        meta: null,
        error: null,
      },
    },
  })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryWithAgency> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth('bearer')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Perbarui Kategori (Admin Only)',
    description: 'Memperbarui nama, icon, bobot urgensi, atau dinas default pengampu kategori.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID kategori (UUID v4)',
    example: '33333333-3333-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Kategori berhasil diperbarui',
  })
  async update(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryWithAgency> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('bearer')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Hapus Kategori (Admin Only)',
    description: 'Menghapus kategori fasilitas publik jika belum terikat laporan aktif.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID kategori (UUID v4)',
    example: '33333333-3333-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Kategori berhasil dihapus',
    schema: {
      example: {
        success: true,
        data: {
          message: "Kategori dengan ID '33333333-3333-4000-8000-000000000001' berhasil dihapus.",
        },
        meta: null,
        error: null,
      },
    },
  })
  async delete(@Param('id', new UuidValidationPipe()) id: string): Promise<{ message: string }> {
    return this.categoriesService.delete(id);
  }
}
