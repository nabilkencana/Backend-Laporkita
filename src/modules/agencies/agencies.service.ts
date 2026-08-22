import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AgenciesRepository, AgencyDetail } from './agencies.repository.js';
import { CreateAgencyDto } from './dto/create-agency.dto.js';
import { UpdateAgencyDto } from './dto/update-agency.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Agency } from '@prisma/client';

@Injectable()
export class AgenciesService {
  constructor(
    private readonly agenciesRepository: AgenciesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(): Promise<AgencyDetail[]> {
    return this.agenciesRepository.findAll();
  }

  async findById(id: string): Promise<AgencyDetail> {
    const agency = await this.agenciesRepository.findById(id);
    if (!agency) {
      throw new NotFoundException(`Instansi dengan ID '${id}' tidak ditemukan.`);
    }
    return agency;
  }

  async create(dto: CreateAgencyDto): Promise<Agency> {
    const existing = await this.agenciesRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Instansi dengan nama '${dto.name}' sudah terdaftar.`);
    }

    return this.agenciesRepository.create({
      name: dto.name,
      type: dto.type,
      contact_email: dto.contact_email,
    });
  }

  async update(id: string, dto: UpdateAgencyDto): Promise<Agency> {
    await this.findById(id);

    if (dto.name) {
      const duplicate = await this.prisma.agency.findFirst({
        where: {
          name: { equals: dto.name, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Instansi dengan nama '${dto.name}' sudah terdaftar.`);
      }
    }

    return this.agenciesRepository.update(id, {
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.contact_email ? { contact_email: dto.contact_email } : {}),
    });
  }

  async delete(id: string): Promise<{ message: string }> {
    const agency = await this.findById(id);

    // Cek relasi kategori dan laporan sebelum delete
    const [categoryCount, reportCount] = await Promise.all([
      this.prisma.category.count({ where: { default_agency_id: id } }),
      this.prisma.report.count({ where: { assigned_agency_id: id } }),
    ]);

    if (categoryCount > 0 || reportCount > 0) {
      throw new BadRequestException(
        `Instansi '${agency.name}' tidak dapat dihapus karena masih terhubung dengan ${categoryCount} kategori dan ${reportCount} laporan.`,
      );
    }

    await this.agenciesRepository.delete(id);
    return { message: `Instansi '${agency.name}' (${id}) berhasil dihapus.` };
  }
}
