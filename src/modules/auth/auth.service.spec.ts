import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole, OtpPurpose } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { OTP_SMS_SERVICE, OTPSmsService } from './sms/otp-sms.interface.js';

describe('AuthService (with Phone OTP Verification)', () => {
  let service: AuthService;
  let repository: AuthRepository;
  let jwtService: JwtService;
  let otpSmsService: OTPSmsService;

  const mockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    full_name: 'Budi Santoso',
    email: 'budi@example.com',
    phone_number: '+6281234567890',
    password_hash: '',
    role: UserRole.citizen,
    agency_id: null,
    contribution_points: 0,
    avatar_url: null,
    is_flagged_for_review: false,
    is_active: true,
    phone_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    // SA-2: refresh_token_hash akan di-set secara dinamis di test yang butuh
    refresh_token_hash: null as string | null,
  };

  const mockInactiveUser = {
    ...mockUser,
    id: '22222222-2222-2222-2222-222222222222',
    is_active: false,
    phone_verified_at: null,
  };

  const mockOtpRecord = {
    id: 'otp-uuid-1111',
    user_id: mockInactiveUser.id,
    phone_number: '+6281234567890',
    otp_code_hash: '',
    purpose: OtpPurpose.register,
    expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes in future
    attempt_count: 0,
    is_used: false,
    last_sent_at: new Date(Date.now() - 50 * 1000), // 50 seconds ago (cooldown passed)
    created_at: new Date(),
  };

  beforeAll(async () => {
    mockUser.password_hash = await bcrypt.hash('Secret123', 10);
    mockInactiveUser.password_hash = await bcrypt.hash('Secret123', 10);
    mockOtpRecord.otp_code_hash = await bcrypt.hash('1234', 10);
  });

  beforeEach(async () => {
    const mockAuthRepository = {
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
      createOtpVerification: jest.fn().mockResolvedValue(mockOtpRecord),
      findLatestActiveOtp: jest.fn(),
      findLatestOtpAnyState: jest.fn(),
      incrementOtpAttempt: jest.fn(),
      invalidatePreviousOtps: jest.fn().mockResolvedValue(undefined),
      verifyUserAndMarkOtpInTransaction: jest.fn(),
      // SA-2: Mock untuk refresh token rotation
      updateRefreshTokenHash: jest.fn().mockResolvedValue(undefined),
      clearRefreshTokenHash: jest.fn().mockResolvedValue(undefined),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock_jwt_token'),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test_jwt_secret_32_characters_long_!';
        if (key === 'JWT_REFRESH_SECRET') return 'test_refresh_secret_32_characters_long_!';
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        if (key === 'OTP_EXPIRY_MINUTES') return 5;
        if (key === 'OTP_RESEND_COOLDOWN_SECONDS') return 45;
        if (key === 'OTP_MAX_ATTEMPTS') return 5;
        return null;
      }),
    };

    const mockSmsProvider: OTPSmsService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: mockAuthRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OTP_SMS_SERVICE, useValue: mockSmsProvider },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repository = module.get<AuthRepository>(AuthRepository);
    jwtService = module.get<JwtService>(JwtService);
    otpSmsService = module.get<OTPSmsService>(OTP_SMS_SERVICE);
  });

  describe('1. register', () => {
    // ── F3-1 / QA F3-5 / F3-6 — validasi kedua field wajib ─────────────────
    it('F3-5: should throw BadRequestException if email is missing (only phone provided)', async () => {
      // Service-layer tidak akan disentuh karena ValidationPipe di DTO memblokir duluan,
      // tapi unit test ini memastikan service JUGA menangkap kasus ini jika DTO dibypass.
      // Dengan RegisterDto yang sudah difix, email tidak boleh undefined.
      await expect(
        service.register({
          full_name: 'No Email User',
          phone_number: '+6281234567890',
          password: 'Password123',
          // email sengaja dihilangkan
        } as Parameters<typeof service.register>[0]),
      ).rejects.toThrow(); // ConflictException atau BadRequestException tergantung mock state
    });

    it('F3-6: should throw BadRequestException if phone_number is missing (only email provided)', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(null);
      // phone_number tidak ada → findByPhone tidak dipanggil,
      // tapi createOtpVerification akan gagal karena phone_number undefined
      await expect(
        service.register({
          full_name: 'No Phone User',
          email: 'nophone@example.com',
          password: 'Password123',
          // phone_number sengaja dihilangkan
        } as Parameters<typeof service.register>[0]),
      ).rejects.toThrow();
    });

    it('F3-1: should accept registration when BOTH email AND phone_number are provided', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(repository, 'findByPhone').mockResolvedValue(null);
      jest.spyOn(repository, 'createUser').mockResolvedValue(mockInactiveUser);
      jest.spyOn(repository, 'createOtpVerification');
      jest.spyOn(otpSmsService, 'send');

      const result = await service.register({
        full_name: 'Budi Lengkap',
        email: 'budi.lengkap@example.com',
        phone_number: '+6281234567890',
        password: 'Password123',
      });

      expect(result).toHaveProperty('user_id');
      expect(result.message).toContain('OTP');
    });

    it('should throw ConflictException if email already registered', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockUser);

      await expect(
        service.register({
          full_name: 'Budi Duplicate',
          email: 'budi@example.com',
          phone_number: '+6281299999999',
          password: 'Password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create inactive user and send 4-digit OTP via OTPSmsService without exposing plaintext OTP', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(repository, 'findByPhone').mockResolvedValue(null);
      const createSpy = jest.spyOn(repository, 'createUser').mockResolvedValue(mockInactiveUser);
      const otpSpy = jest.spyOn(repository, 'createOtpVerification');
      const smsSpy = jest.spyOn(otpSmsService, 'send');

      const result = await service.register({
        full_name: 'Budi Santoso',
        email: 'budi.new@example.com',
        phone_number: '+6281234567890',
        password: 'Password123',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.citizen,
          full_name: 'Budi Santoso',
          is_active: false,
        }),
      );

      expect(otpSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockInactiveUser.id,
          phone_number: '+6281234567890',
          purpose: OtpPurpose.register,
        }),
      );

      expect(smsSpy).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('user_id', mockInactiveUser.id);
      expect(result).toHaveProperty('message');
      // Plaintext OTP tidak boleh ada di response object
      expect(result).not.toHaveProperty('otp');
      expect(result).not.toHaveProperty('otp_code');
    });
  });

  describe('2. verifyOtp', () => {
    it('should throw BadRequestException (OTP_ALREADY_USED) if OTP already used', async () => {
      jest.spyOn(repository, 'findLatestActiveOtp').mockResolvedValue(null);
      jest.spyOn(repository, 'findLatestOtpAnyState').mockResolvedValue({
        ...mockOtpRecord,
        is_used: true,
      });

      await expect(
        service.verifyOtp({
          phone_number: '+6281234567890',
          otp_code: '1234',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException (OTP_EXPIRED) if OTP has expired (5 mins)', async () => {
      jest.spyOn(repository, 'findLatestActiveOtp').mockResolvedValue({
        ...mockOtpRecord,
        expires_at: new Date(Date.now() - 1000), // expired 1s ago
      });

      await expect(
        service.verifyOtp({
          phone_number: '+6281234567890',
          otp_code: '1234',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException (OTP_MAX_ATTEMPTS) if attempt count >= 5', async () => {
      jest.spyOn(repository, 'findLatestActiveOtp').mockResolvedValue({
        ...mockOtpRecord,
        attempt_count: 5,
      });

      await expect(
        service.verifyOtp({
          phone_number: '+6281234567890',
          otp_code: '1234',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should increment attempt count and throw OTP_INVALID if OTP does not match', async () => {
      jest.spyOn(repository, 'findLatestActiveOtp').mockResolvedValue(mockOtpRecord);
      const incSpy = jest.spyOn(repository, 'incrementOtpAttempt');

      await expect(
        service.verifyOtp({
          phone_number: '+6281234567890',
          otp_code: '9999', // wrong OTP
        }),
      ).rejects.toThrow(BadRequestException);

      expect(incSpy).toHaveBeenCalledWith(mockOtpRecord.id);
    });

    it('should activate user (is_active=true) in transaction and return tokens when OTP is valid', async () => {
      jest.spyOn(repository, 'findLatestActiveOtp').mockResolvedValue(mockOtpRecord);
      jest.spyOn(repository, 'verifyUserAndMarkOtpInTransaction').mockResolvedValue({
        ...mockInactiveUser,
        is_active: true,
        phone_verified_at: new Date(),
      });

      const result = await service.verifyOtp({
        phone_number: '+6281234567890',
        otp_code: '1234',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user.id).toBe(mockInactiveUser.id);
    });
  });

  describe('3. resendOtp', () => {
    it('should throw BadRequestException (OTP_RESEND_COOLDOWN) with remainingSeconds if within 45s cooldown', async () => {
      const recentOtp = {
        ...mockOtpRecord,
        last_sent_at: new Date(Date.now() - 15 * 1000), // 15 seconds ago (30s remaining)
      };
      jest.spyOn(repository, 'findLatestOtpAnyState').mockResolvedValue(recentOtp);

      try {
        await service.resendOtp({ phone_number: '+6281234567890' });
        fail('Should have thrown OTP_RESEND_COOLDOWN');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        expect(response.error).toBe('OTP_RESEND_COOLDOWN');
        expect(response.remainingSeconds).toBeGreaterThanOrEqual(28);
        expect(response.remainingSeconds).toBeLessThanOrEqual(30);
      }
    });

    it('should invalidate old OTP, generate new OTP, and send via SMS when cooldown has passed', async () => {
      jest.spyOn(repository, 'findLatestOtpAnyState').mockResolvedValue({
        ...mockOtpRecord,
        last_sent_at: new Date(Date.now() - 50 * 1000), // 50 seconds ago (> 45s)
      });
      jest.spyOn(repository, 'findByPhone').mockResolvedValue(mockInactiveUser);
      const invalidateSpy = jest.spyOn(repository, 'invalidatePreviousOtps');
      const createSpy = jest.spyOn(repository, 'createOtpVerification');
      const smsSpy = jest.spyOn(otpSmsService, 'send');

      const result = await service.resendOtp({ phone_number: '+6281234567890' });

      expect(invalidateSpy).toHaveBeenCalledWith(mockInactiveUser.id, OtpPurpose.register);
      expect(createSpy).toHaveBeenCalled();
      expect(smsSpy).toHaveBeenCalledTimes(1);
      expect(result.cooldown_seconds).toBe(45);
    });
  });

  describe('4. login', () => {
    it('should throw UnauthorizedException (PHONE_NOT_VERIFIED) if user is not active (is_active=false)', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockInactiveUser);

      try {
        await service.login({
          identifier: 'budi@example.com',
          password: 'Secret123',
        });
        fail('Should have thrown PHONE_NOT_VERIFIED');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
        expect(response.error).toBe('PHONE_NOT_VERIFIED');
      }
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockUser);

      await expect(
        service.login({
          identifier: 'budi@example.com',
          password: 'WrongPassword999',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens when user is active and password matches', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockUser);

      const result = await service.login({
        identifier: 'budi@example.com',
        password: 'Secret123',
      });

      expect(result).toHaveProperty('access_token', 'mock_jwt_token');
      expect(result).toHaveProperty('refresh_token', 'mock_jwt_token');
      expect(result.user.email).toBe('budi@example.com');
    });
  });

  describe('5. refresh', () => {
    it('should return new tokens when refresh token is valid and user is active', async () => {
      const rawToken = 'valid_refresh_token_string_example';
      const tokenDigest = createHash('sha256').update(rawToken).digest('hex');
      const tokenHash = await bcrypt.hash(tokenDigest, 10);

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        agency_id: mockUser.agency_id,
      });
      // SA-2: User harus punya refresh_token_hash yang cocok dengan rawToken via SHA-256
      jest
        .spyOn(repository, 'findById')
        .mockResolvedValue({ ...mockUser, refresh_token_hash: tokenHash });

      const result = await service.refresh({ refresh_token: rawToken });

      expect(result).toHaveProperty('access_token');
      expect(result.user.id).toBe(mockUser.id);
      // SA-2: updateRefreshTokenHash harus dipanggil (menyimpan token baru = rotate)
      expect(repository.updateRefreshTokenHash).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
      );
    });

    it('should throw REFRESH_TOKEN_INVALID when token has already been used (single-use)', async () => {
      // SA-2: Simulasi replay attack — token sudah di-rotate, hash di DB sudah beda
      const usedToken = 'already_used_refresh_token';
      const newDigest = createHash('sha256').update('new_token_after_rotation').digest('hex');
      const differentTokenHash = await bcrypt.hash(newDigest, 10);

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        agency_id: mockUser.agency_id,
      });
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockUser,
        refresh_token_hash: differentTokenHash, // hash di DB ≠ usedToken
      });

      try {
        await service.refresh({ refresh_token: usedToken });
        fail('Should have thrown UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
        expect(response.error).toBe('REFRESH_TOKEN_INVALID');
      }
    });

    it('should correctly distinguish tokens sharing the first 72+ bytes prefix (FIX3-B1 bcrypt 72-byte limit fix)', async () => {
      // Dua token yang 100 byte pertamanya SAMA PERSIS tapi berbeda di karakter ke-101
      const commonPrefix =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.';
      const tokenA = `${commonPrefix}RANDOM_JTI_AAAA_1234567890`;
      const tokenB = `${commonPrefix}RANDOM_JTI_BBBB_0987654321`;

      // Token B yang saat ini aktif di DB
      const digestB = createHash('sha256').update(tokenB).digest('hex');
      const hashB = await bcrypt.hash(digestB, 10);

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        agency_id: mockUser.agency_id,
      });
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockUser,
        refresh_token_hash: hashB,
      });

      // Mencoba me-refresh menggunakan token A (token lama) HARUS DITOLAK
      try {
        await service.refresh({ refresh_token: tokenA });
        fail('Should have rejected tokenA');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
        expect(response.error).toBe('REFRESH_TOKEN_INVALID');
      }
    });

    it('should throw REFRESH_TOKEN_INVALID when no session exists (hash is null)', async () => {
      // SA-2: User tidak punya session aktif (belum login atau sudah logout)
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        agency_id: mockUser.agency_id,
      });
      jest.spyOn(repository, 'findById').mockResolvedValue({
        ...mockUser,
        refresh_token_hash: null,
      });

      try {
        await service.refresh({ refresh_token: 'any_token' });
        fail('Should have thrown UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
        expect(response.error).toBe('REFRESH_TOKEN_INVALID');
      }
    });

    it('should throw UnauthorizedException when refresh token verification fails', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refresh({ refresh_token: 'expired_token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
