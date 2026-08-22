import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { User, Prisma } from '@prisma/client';
import { QueryUserDto } from './dto/query-user.dto.js';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    id: string,
  ): Promise<(User & { agency?: { id: string; name: string } | null }) | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findMany(query: QueryUserDto): Promise<{
    users: (User & { agency?: { id: string; name: string } | null })[];
    total: number;
    nextCursor: string | null;
  }> {
    const where: Prisma.UserWhereInput = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.search) {
      where.OR = [
        { full_name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone_number: { contains: query.search } },
      ];
    }

    const total = await this.prisma.user.count({ where });

    const users = await this.prisma.user.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor },
          }
        : {}),
      orderBy: { created_at: 'desc' },
      include: {
        agency: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (users.length > query.limit) {
      const nextItem = users.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    return { users, total, nextCursor };
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async getPointsLogs(
    userId: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<{
    logs: Array<{
      id: string;
      points: number;
      reason: string;
      reference_report_id: string | null;
      created_at: Date;
    }>;
    total: number;
    nextCursor: string | null;
  }> {
    const where: Prisma.ContributionPointsLogWhereInput = { user_id: userId };
    const total = await this.prisma.contributionPointsLog.count({ where });

    const logs = await this.prisma.contributionPointsLog.findMany({
      where,
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { created_at: 'desc' },
    });

    let nextCursor: string | null = null;
    if (logs.length > limit) {
      const nextItem = logs.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    return { logs, total, nextCursor };
  }
}
