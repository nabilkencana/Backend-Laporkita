import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { OTP_SMS_SERVICE } from './sms/otp-sms.interface.js';
import { MockSmsService } from './sms/mock-sms.service.js';
import { HttpSmsService } from './sms/http-sms.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    JwtStrategy,
    {
      provide: OTP_SMS_SERVICE,
      useFactory: (configService: ConfigService) => {
        const nodeEnv = (configService.get<string>('NODE_ENV') ?? 'development').toLowerCase();
        const provider = (configService.get<string>('SMS_PROVIDER') ?? 'mock').toLowerCase();

        // Guard eksplisit startup: throw error jika production memakai mock SMS
        if (nodeEnv === 'production' && provider === 'mock') {
          throw new Error(
            'FATAL: SMS_PROVIDER cannot be "mock" in production environment. Configure a valid SMS provider (zenziva, fonnte, or twilio).',
          );
        }

        if (provider === 'mock' || nodeEnv === 'test') {
          return new MockSmsService();
        }

        return new HttpSmsService(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, JwtStrategy, PassportModule, OTP_SMS_SERVICE],
})
export class AuthModule {}
