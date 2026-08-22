import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResendOtpDto {
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
}
