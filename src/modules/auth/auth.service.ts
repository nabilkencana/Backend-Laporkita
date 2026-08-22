import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { UserRole, OtpPurpose, User } from '@prisma/client';
import { AuthRepository } from './auth.repository.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { JwtPayload } from './strategies/jwt.strategy.js';
import { OTP_SMS_SERVICE, type OTPSmsService } from './sms/otp-sms.interface.js';

export interface RegisterResponse {
  user_id: string;
  phone_number: string | null;
  email: string | null;
  message: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  token_type: 'Bearer';
  user: {
    id: string;
    full_name: string;
    email: string | null;
    phone_number: string | null;
    role: UserRole;
    agency_id: string | null;
    contribution_points: number;
    avatar_url: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(OTP_SMS_SERVICE)
    private readonly otpSmsService: OTPSmsService,
  ) {}

  /**
   * 1. Register Citizen — POST /api/v1/auth/register
   * Membuat user dengan status is_active=false, meng-generate OTP 4-digit (expiry 5 menit),
   * dan mengirimkannya via SMS Gateway / Mock.
   * Respons 202 Accepted (JANGAN PERNAH mengembalikan plaintext OTP di response body).
   */
  async register(dto: RegisterDto): Promise<RegisterResponse> {
    // 1. Validasi: minimal salah satu dari email atau phone wajib ada (Rules.md §2.2)
    if (!dto.email && !dto.phone_number) {
      throw new BadRequestException('Email atau nomor telepon wajib diisi untuk registrasi.');
    }

    // 2. Cek keunikan email jika dikirim
    if (dto.email) {
      const existingEmail = await this.authRepository.findByEmail(dto.email);
      if (existingEmail) {
        throw new ConflictException(
          'Email sudah terdaftar. Gunakan email lain atau silakan login.',
        );
      }
    }

    // 3. Cek keunikan nomor telepon jika dikirim
    if (dto.phone_number) {
      const existingPhone = await this.authRepository.findByPhone(dto.phone_number);
      if (existingPhone) {
        throw new ConflictException(
          'Nomor telepon sudah terdaftar. Gunakan nomor lain atau silakan login.',
        );
      }
    }

    // 4. Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // 5. Simpan user baru (is_active = false)
    const newUser = await this.authRepository.createUser({
      full_name: dto.full_name,
      email: dto.email,
      phone_number: dto.phone_number,
      password_hash: passwordHash,
      role: UserRole.citizen,
      is_active: false,
    });

    // 6. Generate 4-digit OTP & kirim SMS jika nomor HP disediakan
    if (dto.phone_number) {
      const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
      const otpCodeHash = await bcrypt.hash(otpCode, 10);
      const expiryMinutes = Number(this.configService.get<string>('OTP_EXPIRY_MINUTES') ?? 5);
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      await this.authRepository.createOtpVerification({
        user_id: newUser.id,
        phone_number: dto.phone_number,
        otp_code_hash: otpCodeHash,
        purpose: OtpPurpose.register,
        expires_at: expiresAt,
        last_sent_at: new Date(),
      });

      await this.otpSmsService.send(dto.phone_number, otpCode);
    }

    return {
      user_id: newUser.id,
      phone_number: newUser.phone_number,
      email: newUser.email,
      message:
        'Registrasi berhasil. Kode OTP verifikasi 4-digit telah dikirim ke nomor telepon Anda.',
    };
  }

  /**
   * 2. Verifikasi OTP Nomor Telepon — POST /api/v1/auth/verify-otp
   * Memvalidasi OTP 4 digit, memeriksa expiry (5 menit), attempt count (max 5),
   * dan mengaktifkan akun (is_active=true) dalam satu database transaction.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthTokens> {
    if (!dto.user_id && !dto.phone_number) {
      throw new BadRequestException('User ID atau nomor telepon wajib disertakan.');
    }

    // Cari OTP aktif terbaru
    const otpRecord = await this.authRepository.findLatestActiveOtp({
      user_id: dto.user_id,
      phone_number: dto.phone_number,
      purpose: OtpPurpose.register,
    });

    if (!otpRecord) {
      // Cek apakah ada record yang sudah used
      const anyOtp = await this.authRepository.findLatestOtpAnyState({
        user_id: dto.user_id,
        phone_number: dto.phone_number,
        purpose: OtpPurpose.register,
      });

      if (anyOtp?.is_used) {
        throw new BadRequestException({
          message: ['Kode OTP sudah digunakan. Silakan minta kode OTP baru.'],
          error: 'OTP_ALREADY_USED',
          statusCode: 400,
        });
      }

      throw new BadRequestException({
        message: ['Kode OTP tidak ditemukan atau belum diminta.'],
        error: 'OTP_INVALID',
        statusCode: 400,
      });
    }

    // Cek batas kedaluwarsa OTP
    if (otpRecord.expires_at < new Date()) {
      throw new BadRequestException({
        message: [
          'Kode OTP sudah kadaluarsa (melebihi batas 5 menit). Silakan minta kode OTP baru.',
        ],
        error: 'OTP_EXPIRED',
        statusCode: 400,
      });
    }

    // Cek proteksi brute-force (maksimal 5x percobaan per window OTP)
    const maxAttempts = Number(this.configService.get<string>('OTP_MAX_ATTEMPTS') ?? 5);
    if (otpRecord.attempt_count >= maxAttempts) {
      throw new BadRequestException({
        message: [
          'Batas percobaan OTP telah terlampaui (maksimal 5 kali). Silakan minta kode OTP baru.',
        ],
        error: 'OTP_MAX_ATTEMPTS',
        statusCode: 400,
      });
    }

    // Verifikasi hash OTP
    const isMatch = await bcrypt.compare(dto.otp_code, otpRecord.otp_code_hash);
    if (!isMatch) {
      await this.authRepository.incrementOtpAttempt(otpRecord.id);
      throw new BadRequestException({
        message: ['Kode OTP yang Anda masukkan salah.'],
        error: 'OTP_INVALID',
        statusCode: 400,
      });
    }

    // Aktivasi user dan tandai OTP telah digunakan dalam satu transaksi
    const activatedUser = await this.authRepository.verifyUserAndMarkOtpInTransaction(
      otpRecord.user_id,
      otpRecord.id,
    );

    return this.generateTokens(activatedUser);
  }

  /**
   * 3. Kirim Ulang OTP — POST /api/v1/auth/resend-otp
   * Menerapkan cooldown 45 detik sesuai mockup UI Figma ("Kirim ulang kode 00:45").
   * Mengembalikan remainingSeconds jika dipanggil sebelum cooldown selesai.
   */
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string; cooldown_seconds: number }> {
    if (!dto.user_id && !dto.phone_number) {
      throw new BadRequestException('User ID atau nomor telepon wajib disertakan.');
    }

    const latestOtp = await this.authRepository.findLatestOtpAnyState({
      user_id: dto.user_id,
      phone_number: dto.phone_number,
      purpose: OtpPurpose.register,
    });

    const cooldownSeconds = Number(
      this.configService.get<string>('OTP_RESEND_COOLDOWN_SECONDS') ?? 45,
    );

    if (latestOtp) {
      const elapsedSeconds = Math.floor((Date.now() - latestOtp.last_sent_at.getTime()) / 1000);
      if (elapsedSeconds < cooldownSeconds) {
        const remainingSeconds = cooldownSeconds - elapsedSeconds;
        throw new BadRequestException({
          message: [
            `Kirim ulang kode OTP sedang dalam cooldown. Tunggu ${remainingSeconds} detik lagi.`,
          ],
          error: 'OTP_RESEND_COOLDOWN',
          statusCode: 400,
          remainingSeconds,
        });
      }
    }

    // Cari user
    let user: User | null = null;
    if (dto.user_id) {
      user = await this.authRepository.findById(dto.user_id);
    } else if (dto.phone_number) {
      user = await this.authRepository.findByPhone(dto.phone_number);
    }

    if (!user) {
      throw new BadRequestException(
        'Pengguna dengan ID atau nomor telepon tersebut tidak ditemukan.',
      );
    }

    if (user.is_active) {
      throw new BadRequestException('Nomor telepon akun ini sudah aktif dan terverifikasi.');
    }

    if (!user.phone_number) {
      throw new BadRequestException('Akun ini tidak memiliki nomor telepon terdaftar.');
    }

    // Invalidate OTP lama
    await this.authRepository.invalidatePreviousOtps(user.id, OtpPurpose.register);

    // Buat OTP baru
    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const newOtpHash = await bcrypt.hash(newOtp, 10);
    const expiryMinutes = Number(this.configService.get<string>('OTP_EXPIRY_MINUTES') ?? 5);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await this.authRepository.createOtpVerification({
      user_id: user.id,
      phone_number: user.phone_number,
      otp_code_hash: newOtpHash,
      purpose: OtpPurpose.register,
      expires_at: expiresAt,
      last_sent_at: new Date(),
    });

    await this.otpSmsService.send(user.phone_number, newOtp);

    return {
      message: 'Kode OTP baru berhasil dikirim ke nomor telepon Anda.',
      cooldown_seconds: cooldownSeconds,
    };
  }

  /**
   * 4. Login User — POST /api/v1/auth/login
   * WAJIB memeriksa status is_active. User yang belum verifikasi OTP ditolak dengan
   * error code PHONE_NOT_VERIFIED.
   */
  async login(dto: LoginDto): Promise<AuthTokens> {
    // Cari user berdasarkan email ATAU nomor telepon
    const isEmail = dto.identifier.includes('@');
    const user = isEmail
      ? await this.authRepository.findByEmail(dto.identifier)
      : await this.authRepository.findByPhone(dto.identifier);

    if (!user || !user.password_hash) {
      throw new UnauthorizedException(
        'Kredensial login tidak valid. Periksa email/no. HP dan password Anda.',
      );
    }

    // Verifikasi password hash
    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Kredensial login tidak valid. Periksa email/no. HP dan password Anda.',
      );
    }

    // WAJIB: Cek apakah nomor telepon / akun sudah aktif terverifikasi OTP
    if (!user.is_active) {
      throw new UnauthorizedException({
        message:
          'Nomor telepon belum diverifikasi. Silakan lakukan verifikasi OTP terlebih dahulu.',
        error: 'PHONE_NOT_VERIFIED',
        statusCode: 401,
      });
    }

    return this.generateTokens(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    try {
      const refreshSecret =
        this.configService.get<string>('JWT_REFRESH_SECRET') ??
        'default_refresh_secret_min_32_chars';
      const payload = this.jwtService.verify<JwtPayload>(dto.refresh_token, {
        secret: refreshSecret,
      });

      const user = await this.authRepository.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Refresh token tidak valid atau user telah dihapus.');
      }

      if (!user.is_active) {
        throw new UnauthorizedException({
          message: 'Akun belum aktif atau nomor telepon belum diverifikasi.',
          error: 'PHONE_NOT_VERIFIED',
          statusCode: 401,
        });
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException(
        'Refresh token tidak valid atau sudah kadaluarsa. Silakan login ulang.',
      );
    }
  }

  private generateTokens(user: {
    id: string;
    full_name: string;
    email: string | null;
    phone_number: string | null;
    role: UserRole;
    agency_id: string | null;
    contribution_points: number;
    avatar_url: string | null;
  }): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      agency_id: user.agency_id,
    };

    const jwtSecret =
      this.configService.get<string>('JWT_SECRET') ?? 'default_dev_jwt_secret_min_32_chars';
    const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '15m';

    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'default_refresh_secret_min_32_chars';
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: jwtExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: jwtExpiresIn,
      token_type: 'Bearer',
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        agency_id: user.agency_id,
        contribution_points: user.contribution_points,
        avatar_url: user.avatar_url,
      },
    };
  }
}
