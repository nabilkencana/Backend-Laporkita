import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService, AuthTokens, RegisterResponse } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { ResendOtpDto } from './dto/resend-otp.dto.js';
import { Public } from '../../common/decorators/roles.decorator.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 1. Register User — POST /api/v1/auth/register
   * Status 202 Accepted. Mengirimkan kode OTP 4-digit ke nomor telepon pengguna.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Registrasi Akun Baru (Citizen)',
    description:
      'Mendaftarkan pengguna baru dengan status nonaktif dan mengirimkan kode OTP 4-digit ke nomor telepon.',
  })
  @ApiResponse({
    status: 202,
    description: 'Registrasi berhasil diterima, OTP dikirimkan.',
  })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    return this.authService.register(dto);
  }

  /**
   * 2. Verifikasi OTP — POST /api/v1/auth/verify-otp
   * Memvalidasi kode OTP 4 digit untuk mengaktifkan akun dan menerima token JWT.
   */
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verifikasi Nomor Telepon via Kode OTP',
    description: 'Memverifikasi kode OTP 4 digit untuk mengaktifkan akun pengguna dan login.',
  })
  @ApiResponse({
    status: 200,
    description: 'Verifikasi berhasil, mengembalikan JWT tokens.',
  })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthTokens> {
    return this.authService.verifyOtp(dto);
  }

  /**
   * 3. Kirim Ulang OTP — POST /api/v1/auth/resend-otp
   * Mengirim ulang kode OTP dengan batasan cooldown 45 detik.
   */
  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kirim Ulang Kode OTP',
    description:
      'Mengirim ulang kode OTP baru dengan proteksi cooldown 45 detik (menghasilkan OTP_RESEND_COOLDOWN jika belum 45 detik).',
  })
  @ApiResponse({
    status: 200,
    description: 'Kode OTP baru berhasil dikirim.',
  })
  async resendOtp(
    @Body() dto: ResendOtpDto,
  ): Promise<{ message: string; cooldown_seconds: number }> {
    return this.authService.resendOtp(dto);
  }

  /**
   * 4. Login — POST /api/v1/auth/login
   * Login email/phone + password. Akun wajib sudah terverifikasi OTP (is_active=true).
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login Pengguna',
    description:
      'Masuk menggunakan email/nomor telepon dan password. User belum terverifikasi OTP akan ditolak dengan PHONE_NOT_VERIFIED.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login berhasil, mengembalikan JWT tokens.',
  })
  async login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.authService.login(dto);
  }

  /**
   * 5. Refresh Token — POST /api/v1/auth/refresh
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh Access Token',
    description: 'Memperbarui Access Token menggunakan Refresh Token yang masih berlaku.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token berhasil diperbarui.',
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refresh(dto);
  }
}
