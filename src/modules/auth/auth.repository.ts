import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { User, UserRole } from '@prisma/client';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByPhone(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phone_number: phoneNumber },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createUser(data: {
    full_name: string;
    email?: string;
    phone_number?: string;
    password_hash: string;
    role: UserRole;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        full_name: data.full_name,
        email: data.email ?? null,
        phone_number: data.phone_number ?? null,
        password_hash: data.password_hash,
        role: data.role,
        contribution_points: 0,
      },
    });
  }
}
