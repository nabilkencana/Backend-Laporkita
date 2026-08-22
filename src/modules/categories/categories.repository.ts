import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Category, Prisma } from '@prisma/client';

export type CategoryWithAgency = Category & {
  default_agency: { id: string; name: string; type: string } | null;
};

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<CategoryWithAgency[]> {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        default_agency: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<CategoryWithAgency | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        default_agency: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
  }

  async findByName(name: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  async create(data: Prisma.CategoryCreateInput): Promise<CategoryWithAgency> {
    return this.prisma.category.create({
      data,
      include: {
        default_agency: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
  }

  async update(id: string, data: Prisma.CategoryUpdateInput): Promise<CategoryWithAgency> {
    return this.prisma.category.update({
      where: { id },
      data,
      include: {
        default_agency: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
  }

  async delete(id: string): Promise<Category> {
    return this.prisma.category.delete({
      where: { id },
    });
  }
}
