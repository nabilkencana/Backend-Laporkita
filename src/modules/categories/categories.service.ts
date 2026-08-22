import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CategoriesRepository, CategoryWithAgency } from './categories.repository.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(): Promise<CategoryWithAgency[]> {
    return this.categoriesRepository.findAll();
  }

  async findById(id: string): Promise<CategoryWithAgency> {
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException(`Kategori dengan ID '${id}' tidak ditemukan.`);
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryWithAgency> {
    // 1. Validasi keunikan nama kategori
    const existing = await this.categoriesRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Kategori dengan nama '${dto.name}' sudah ada.`);
    }

    // 2. Validasi default_agency_id WAJIB ada di database (Rules.md §1.7)
    const agency = await this.prisma.agency.findUnique({
      where: { id: dto.default_agency_id },
    });
    if (!agency) {
      throw new BadRequestException(
        `Instansi default (default_agency_id: '${dto.default_agency_id}') tidak ditemukan di database.`,
      );
    }

    return this.categoriesRepository.create({
      name: dto.name,
      icon_url: dto.icon_url ?? null,
      urgency_weight: dto.urgency_weight ?? 1.0,
      default_agency: {
        connect: { id: dto.default_agency_id },
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryWithAgency> {
    await this.findById(id);

    if (dto.name) {
      const duplicate = await this.prisma.category.findFirst({
        where: {
          name: { equals: dto.name, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Kategori dengan nama '${dto.name}' sudah digunakan.`);
      }
    }

    if (dto.default_agency_id) {
      const agency = await this.prisma.agency.findUnique({
        where: { id: dto.default_agency_id },
      });
      if (!agency) {
        throw new BadRequestException(
          `Instansi default (default_agency_id: '${dto.default_agency_id}') tidak ditemukan di database.`,
        );
      }
    }

    return this.categoriesRepository.update(id, {
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.icon_url !== undefined ? { icon_url: dto.icon_url } : {}),
      ...(dto.urgency_weight !== undefined ? { urgency_weight: dto.urgency_weight } : {}),
      ...(dto.default_agency_id
        ? {
            default_agency: {
              connect: { id: dto.default_agency_id },
            },
          }
        : {}),
    });
  }

  async delete(id: string): Promise<{ message: string }> {
    const category = await this.findById(id);

    // Cek jika kategori sudah memiliki laporan terkait
    const reportCount = await this.prisma.report.count({
      where: { category_id: id },
    });

    if (reportCount > 0) {
      throw new BadRequestException(
        `Kategori '${category.name}' tidak dapat dihapus karena sudah memiliki ${reportCount} laporan terkait.`,
      );
    }

    await this.categoriesRepository.delete(id);
    return { message: `Kategori '${category.name}' (${id}) berhasil dihapus.` };
  }
}
