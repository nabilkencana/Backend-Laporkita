import { Controller, Get, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
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

@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Profile Pengguna Sendiri ───────────────────────────────────────────────

  @Get('me')
  async getMe(@CurrentUser('id') userId: string): Promise<UserResponse> {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMeDto,
  ): Promise<UserResponse> {
    return this.usersService.updateMe(userId, dto);
  }

  /**
   * Endpoint READ-ONLY riwayat poin kontribusi (Rules.md §1.6 & ERD §2.10).
   */
  @Get('me/points')
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
  async findAllUsers(@Query() query: QueryUserDto): Promise<PaginatedResult<UserResponse>> {
    return this.usersService.findAllUsers(query);
  }

  @Get(':id')
  @Roles(UserRole.admin)
  async findUserById(@Param('id', new UuidValidationPipe()) id: string): Promise<UserResponse> {
    return this.usersService.findUserById(id);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  async adminUpdateUser(
    @Param('id', new UuidValidationPipe()) id: string,
    @Body() dto: AdminUpdateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.adminUpdateUser(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  async deleteUser(
    @Param('id', new UuidValidationPipe()) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.usersService.deleteUser(id, currentUser.id);
  }
}
