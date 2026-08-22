import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from '../auth.repository.js';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator.js';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string | null;
  role: UserRole;
  agency_id: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authRepository: AuthRepository,
  ) {
    const jwtSecret =
      configService.get<string>('JWT_SECRET') ?? 'default_dev_jwt_secret_min_32_chars';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.authRepository.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException(
        'Token tidak valid: User tidak ditemukan atau telah dihapus.',
      );
    }

    return {
      id: user.id,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      agency_id: user.agency_id,
      full_name: user.full_name,
    };
  }
}
