import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaginatedResult } from '../../common/interceptors/response.interceptor.js';
import { User, UserRole } from '@prisma/client';

export interface UserResponse {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  role: UserRole;
  agency_id: string | null;
  agency?: { id: string; name: string } | null;
  contribution_points: number;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export type UserWithAgencyRelation = User & {
  agency?: { id: string; name: string } | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getMe(userId: string): Promise<UserResponse> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Profil pengguna tidak ditemukan.');
    }

    return this.mapToUserResponse(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<UserResponse> {
    if (dto.phone_number) {
      const existingPhone = await this.prisma.user.findFirst({
        where: {
          phone_number: dto.phone_number,
          NOT: { id: userId },
        },
      });

      if (existingPhone) {
        throw new ConflictException('Nomor telepon sudah digunakan oleh akun lain.');
      }
    }

    const updated = await this.usersRepository.update(userId, {
      ...(dto.full_name ? { full_name: dto.full_name } : {}),
      ...(dto.avatar_url !== undefined ? { avatar_url: dto.avatar_url } : {}),
      ...(dto.phone_number !== undefined ? { phone_number: dto.phone_number } : {}),
    });

    return this.mapToUserResponse(updated);
  }

  /**
   * READ-ONLY endpoint poin kontribusi (Rules.md §1.6 & ERD.md §2.10).
   * Tidak ada endpoint yang mengizinkan penulisan angka poin secara langsung.
   */
  async getMyPoints(
    userId: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<
    PaginatedResult<{
      id: string;
      points: number;
      reason: string;
      reference_report_id: string | null;
      created_at: Date;
    }>
  > {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    const { logs, total, nextCursor } = await this.usersRepository.getPointsLogs(
      userId,
      limit,
      cursor,
    );

    return {
      data: logs,
      meta: {
        total,
        limit,
        nextCursor,
        hasPrevious: !!cursor,
      },
    };
  }

  // ── Admin-Only Operations ──────────────────────────────────────────────────

  async findAllUsers(query: QueryUserDto): Promise<PaginatedResult<UserResponse>> {
    const { users, total, nextCursor } = await this.usersRepository.findMany(query);

    return {
      data: users.map((u) => this.mapToUserResponse(u)),
      meta: {
        total,
        limit: query.limit,
        nextCursor,
        hasPrevious: !!query.cursor,
      },
    };
  }

  async findUserById(id: string): Promise<UserResponse> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User dengan ID '${id}' tidak ditemukan.`);
    }

    return this.mapToUserResponse(user);
  }

  async adminUpdateUser(id: string, dto: AdminUpdateUserDto): Promise<UserResponse> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User dengan ID '${id}' tidak ditemukan.`);
    }

    if (dto.agency_id) {
      const agency = await this.prisma.agency.findUnique({
        where: { id: dto.agency_id },
      });
      if (!agency) {
        throw new BadRequestException(`Agency dengan ID '${dto.agency_id}' tidak ditemukan.`);
      }
    }

    if (dto.phone_number) {
      const duplicatePhone = await this.prisma.user.findFirst({
        where: {
          phone_number: dto.phone_number,
          NOT: { id },
        },
      });
      if (duplicatePhone) {
        throw new ConflictException('Nomor telepon sudah digunakan oleh akun lain.');
      }
    }

    const updated = await this.usersRepository.update(id, {
      ...(dto.full_name ? { full_name: dto.full_name } : {}),
      ...(dto.role ? { role: dto.role } : {}),
      ...(dto.agency_id !== undefined ? { agency_id: dto.agency_id } : {}),
      ...(dto.avatar_url !== undefined ? { avatar_url: dto.avatar_url } : {}),
      ...(dto.phone_number !== undefined ? { phone_number: dto.phone_number } : {}),
    });

    return this.mapToUserResponse(updated);
  }

  async deleteUser(id: string, currentUserId: string): Promise<{ message: string }> {
    if (id === currentUserId) {
      throw new BadRequestException('Admin tidak dapat menghapus akunnya sendiri.');
    }

    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User dengan ID '${id}' tidak ditemukan.`);
    }

    await this.usersRepository.delete(id);
    return { message: `User '${user.full_name}' (${id}) berhasil dihapus.` };
  }

  private mapToUserResponse(user: UserWithAgencyRelation): UserResponse {
    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      agency_id: user.agency_id,
      agency: user.agency ? { id: user.agency.id, name: user.agency.name } : null,
      contribution_points: user.contribution_points,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}
