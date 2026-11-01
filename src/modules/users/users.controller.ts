import { Controller, Get, Patch, Delete, Param, Body, Query, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../storage/storage.service.js';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService, UserResponse } from './users.service.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { UuidValidationPipe } from '../../common/pipes/uuid-validation.pipe.js';
import { PaginatedResult } from '../../common/interceptors/response.interceptor.js';
import { UserRole } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth('bearer')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  // ── Profile Pengguna Sendiri ───────────────────────────────────────────────

  @Get('me')
  @ApiOperation({
    summary: 'Ambil Profil Saya',
    description: 'Mengambil informasi lengkap profil pengguna yang sedang login.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profil berhasil diambil',
    schema: {
      example: {
        success: true,
        data: {
          id: '11111111-1111-4000-8000-000000000001',
          full_name: 'Budi Santoso',
          email: 'budi@example.com',
          phone_number: '+6281234567890',
          role: 'citizen',
          agency_id: null,
          agency: null,
          contribution_points: 25,
          avatar_url: 'https://storage.laporkita.id/avatars/user-1.jpg',
          created_at: '2026-08-22T07:00:00.000Z',
          updated_at: '2026-08-22T07:00:00.000Z',
        },
        meta: null,
        error: null,
      },
    },
  })
  async getMe(@CurrentUser('id') userId: string): Promise<UserResponse> {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar_url', maxCount: 1 },
      { name: 'avatar', maxCount: 1 },
      { name: 'photo', maxCount: 1 },
    ]),
  )
  @ApiOperation({
    summary: 'Perbarui Profil Saya',
    description: 'Memperbarui nama lengkap, nomor telepon, atau foto avatar profil sendiri (mendukung raw JSON maupun upload file gambar fisik).',
  })
  @ApiResponse({
    status: 200,
    description: 'Profil berhasil diperbarui',
    schema: {
      example: {
        success: true,
        data: {
          id: '11111111-1111-4000-8000-000000000001',
          full_name: 'Budi Santoso Nugroho',
          email: 'budi@example.com',
          phone_number: '+6281298765432',
          role: 'citizen',
          agency_id: null,
          agency: null,
          contribution_points: 25,
          avatar_url: 'https://storage.laporkita.id/avatars/budi-new.jpg',
          created_at: '2026-08-22T07:00:00.000Z',
          updated_at: '2026-08-22T08:00:00.000Z',
        },
        meta: null,
        error: null,
      },
    },
  })
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMeDto,
    @UploadedFiles()
    files?: {
      avatar_url?: Express.Multer.File[];
      avatar?: Express.Multer.File[];
      photo?: Express.Multer.File[];
    },
  ): Promise<UserResponse> {
    const uploadedFile = files?.avatar_url?.[0] || files?.avatar?.[0] || files?.photo?.[0];
    if (uploadedFile) {
      dto.avatar_url = await this.storageService.uploadFile(uploadedFile, 'avatars');
    }
    return this.usersService.updateMe(userId, dto);
  }

  /**
   * Endpoint READ-ONLY riwayat poin kontribusi (Rules.md §1.6 & ERD §2.10).
   */
  @Get('me/points')
  @ApiOperation({
    summary: 'Riwayat Poin Kontribusi Saya',
    description: 'Mengambil riwayat perolehan poin kontribusi gamifikasi pelapor (paginated).',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Jumlah data per halaman' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    example: '77777777-7777-4000-8000-000000000001',
    description: 'Cursor ID poin untuk halaman berikutnya',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar riwayat poin kontribusi',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '77777777-7777-4000-8000-000000000001',
            points: 10,
            reason: 'report_submitted',
            reference_report_id: '44444444-4444-4000-8000-000000000001',
            created_at: '2026-08-22T08:00:00.000Z',
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
  async getMyPoints(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<
    PaginatedResult<{
      id: string;
      points: number;
      reason: string;
      reference_report_id: string | null;
      created_at: Date;
    }>
  > {
    return this.usersService.getMyPoints(userId, limit ? Number(limit) : 20, cursor);
  }

  // ── Admin-Only Endpoints ───────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Daftar Seluruh Pengguna (Admin Only)',
    description: 'Mencari dan menampilkan daftar pengguna dengan filter role dan cursor pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar pengguna berhasil diambil',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '11111111-1111-4000-8000-000000000001',
            full_name: 'Budi Santoso',
            email: 'budi@example.com',
            phone_number: '+6281234567890',
            role: 'citizen',
            agency_id: null,
            contribution_points: 25,
            avatar_url: null,
            created_at: '2026-08-22T07:00:00.000Z',
            updated_at: '2026-08-22T07:00:00.000Z',
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
  async findAllUsers(@Query() query: QueryUserDto): Promise<PaginatedResult<UserResponse>> {
    return this.usersService.findAllUsers(query);
  }

  @Get(':id')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Detail Pengguna Berdasarkan ID (Admin Only)',
    description: 'Mengambil informasi lengkap satu pengguna berdasarkan UUID.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID pengguna (UUID v4)',
    example: '11111111-1111-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail pengguna berhasil diambil',
  })
  async findUserById(@Param('id', new UuidValidationPipe()) id: string): Promise<UserResponse> {
    return this.usersService.findUserById(id);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Ubah Data Pengguna oleh Admin (Admin Only)',
    description: 'Mengubah nama, peran (role), instansi, no HP, atau avatar pengguna.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID pengguna (UUID v4)',
    example: '11111111-1111-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Data pengguna berhasil diperbarui',
  })
  async adminUpdateUser(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.adminUpdateUser(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary: 'Nonaktifkan / Hapus Pengguna (Admin Only)',
    description: 'Menonaktifkan akun pengguna dari sistem.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID pengguna (UUID v4)',
    example: '11111111-1111-4000-8000-000000000001',
  })
  @ApiResponse({
    status: 200,
    description: 'Pengguna berhasil dinonaktifkan',
    schema: {
      example: {
        success: true,
        data: {
          message: "Pengguna dengan ID '11111111-1111-4000-8000-000000000001' berhasil dihapus.",
        },
        meta: null,
        error: null,
      },
    },
  })
  async deleteUser(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.usersService.deleteUser(id, currentUser.id);
  }
}
