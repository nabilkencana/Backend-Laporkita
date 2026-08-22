import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { AuthRepository } from './auth.repository.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { JwtPayload } from './strategies/jwt.strategy.js';

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
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
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

    // 5. Simpan user baru — role WAJIB default citizen (Rules.md §2.2: tidak ada self-registration role lain)
    const newUser = await this.authRepository.createUser({
      full_name: dto.full_name,
      email: dto.email,
      phone_number: dto.phone_number,
      password_hash: passwordHash,
      role: UserRole.citizen,
    });

    // 6. Generate access token + refresh token
    return this.generateTokens(newUser);
  }

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
