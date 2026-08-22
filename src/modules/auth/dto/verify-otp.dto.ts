import { IsString, IsNotEmpty, Length, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiPropertyOptional({
    description: 'ID pengguna (UUID)',
    example: '11111111-1111-4000-8000-000000000001',
  })
  @IsOptional()
  @IsString({ message: 'User ID harus berupa string.' })
  user_id?: string;

  @ApiPropertyOptional({
    description: 'Nomor telepon pengguna',
    example: '+6281234567890',
  })
  @IsOptional()
  @IsString({ message: 'Nomor telepon harus berupa string.' })
  phone_number?: string;

  @ApiProperty({
    description: 'Kode OTP 4 digit yang diterima via SMS',
    example: '1234',
  })
  @IsNotEmpty({ message: 'Kode OTP wajib diisi.' })
  @IsString({ message: 'Kode OTP harus berupa string.' })
  @Length(4, 4, { message: 'Kode OTP harus tepat 4 digit.' })
  @Matches(/^[0-9]{4}$/, { message: 'Kode OTP harus berupa 4 digit angka.' })
  otp_code!: string;
}
