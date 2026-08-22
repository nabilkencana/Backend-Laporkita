import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Agency, Prisma } from '@prisma/client';

export type AgencyDetail = Agency & {
  _count?: {
    users: number;
    categories: number;
    assigned_reports: number;
  };
};

@Injectable()
export class AgenciesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AgencyDetail[]> {
    return this.prisma.agency.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            categories: true,
            assigned_reports: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<AgencyDetail | null> {
    return this.prisma.agency.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            categories: true,
            assigned_reports: true,
          },
        },
      },
    });
  }

  async findByName(name: string): Promise<Agency | null> {
    return this.prisma.agency.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  async create(data: Prisma.AgencyCreateInput): Promise<Agency> {
    return this.prisma.agency.create({
      data,
    });
  }

  async update(id: string, data: Prisma.AgencyUpdateInput): Promise<Agency> {
    return this.prisma.agency.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Agency> {
    return this.prisma.agency.delete({
      where: { id },
    });
  }
}
