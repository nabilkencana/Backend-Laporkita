import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let repository: AuthRepository;
  let jwtService: JwtService;

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
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeAll(async () => {
    mockUser.password_hash = await bcrypt.hash('Secret123', 10);
  });

  beforeEach(async () => {
    const mockAuthRepository = {
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findById: jest.fn(),
      createUser: jest.fn(),
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
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: mockAuthRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repository = module.get<AuthRepository>(AuthRepository);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('register', () => {
    it('should throw BadRequestException if both email and phone are missing (Rules.md §2.2)', async () => {
      await expect(
        service.register({
          full_name: 'No Contact',
          password: 'Password123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if email already registered', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockUser);

      await expect(
        service.register({
          full_name: 'Budi Duplicate',
          email: 'budi@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should force role to citizen upon self-registration (Rules.md §2.2)', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(null);
      const createSpy = jest.spyOn(repository, 'createUser').mockResolvedValue(mockUser);

      const result = await service.register({
        full_name: 'Budi Santoso',
        email: 'budi.new@example.com',
        password: 'Password123',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.citizen,
          full_name: 'Budi Santoso',
        }),
      );

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user.role).toBe(UserRole.citizen);
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValue(null);

      await expect(
        service.login({
          identifier: 'notfound@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
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

    it('should return tokens when login credentials are valid', async () => {
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

  describe('refresh', () => {
    it('should return new tokens when refresh token is valid', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        agency_id: mockUser.agency_id,
      });
      jest.spyOn(repository, 'findById').mockResolvedValue(mockUser);

      const result = await service.refresh({ refresh_token: 'valid_refresh_token' });

      expect(result).toHaveProperty('access_token');
      expect(result.user.id).toBe(mockUser.id);
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
