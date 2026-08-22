import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { User, UserRole, OtpVerification, OtpPurpose } from '@prisma/client';

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
    is_active?: boolean;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        full_name: data.full_name,
        email: data.email ?? null,
        phone_number: data.phone_number ?? null,
        password_hash: data.password_hash,
        role: data.role,
        is_active: data.is_active ?? false,
        contribution_points: 0,
      },
    });
  }

  async createOtpVerification(data: {
    user_id: string;
    phone_number: string;
    otp_code_hash: string;
    purpose?: OtpPurpose;
    expires_at: Date;
    last_sent_at?: Date;
  }): Promise<OtpVerification> {
    return this.prisma.otpVerification.create({
      data: {
        user_id: data.user_id,
        phone_number: data.phone_number,
        otp_code_hash: data.otp_code_hash,
        purpose: data.purpose ?? OtpPurpose.register,
        expires_at: data.expires_at,
        last_sent_at: data.last_sent_at ?? new Date(),
        attempt_count: 0,
        is_used: false,
      },
    });
  }

  async findLatestActiveOtp(params: {
    user_id?: string;
    phone_number?: string;
    purpose?: OtpPurpose;
  }): Promise<OtpVerification | null> {
    return this.prisma.otpVerification.findFirst({
      where: {
        ...(params.user_id ? { user_id: params.user_id } : {}),
        ...(params.phone_number ? { phone_number: params.phone_number } : {}),
        purpose: params.purpose ?? OtpPurpose.register,
        is_used: false,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findLatestOtpAnyState(params: {
    user_id?: string;
    phone_number?: string;
    purpose?: OtpPurpose;
  }): Promise<OtpVerification | null> {
    return this.prisma.otpVerification.findFirst({
      where: {
        ...(params.user_id ? { user_id: params.user_id } : {}),
        ...(params.phone_number ? { phone_number: params.phone_number } : {}),
        purpose: params.purpose ?? OtpPurpose.register,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async incrementOtpAttempt(otpId: string): Promise<OtpVerification> {
    return this.prisma.otpVerification.update({
      where: { id: otpId },
      data: {
        attempt_count: { increment: 1 },
      },
    });
  }

  async invalidatePreviousOtps(
    userId: string,
    purpose: OtpPurpose = OtpPurpose.register,
  ): Promise<void> {
    await this.prisma.otpVerification.updateMany({
      where: {
        user_id: userId,
        purpose,
        is_used: false,
      },
      data: {
        is_used: true,
      },
    });
  }

  async verifyUserAndMarkOtpInTransaction(userId: string, otpId: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      await tx.otpVerification.update({
        where: { id: otpId },
        data: { is_used: true },
      });

      return tx.user.update({
        where: { id: userId },
        data: {
          is_active: true,
          phone_verified_at: new Date(),
        },
      });
    });
  }
}
