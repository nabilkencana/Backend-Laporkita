import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsUrl,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class AdminUpdateUserDto {
  @ApiPropertyOptional({
    description: 'Nama lengkap pengguna',
    example: 'Siti Aminah',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Nama lengkap harus berupa string.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  full_name?: string;

  @ApiPropertyOptional({
    description: 'Peran pengguna dalam sistem',
    enum: UserRole,
    example: UserRole.operator,
  })
  @IsOptional()
  @IsEnum(UserRole, {
    message: 'Role harus salah satu dari: citizen, operator, policy_maker, admin.',
  })
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'ID instansi jika role operator (UUID v4)',
    example: '22222222-2222-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Agency ID harus berupa UUID v4 yang valid.' })
  agency_id?: string | null;

  @ApiPropertyOptional({
    description: 'Nomor telepon pengguna',
    example: '+6281345678901',
  })
  @IsOptional()
  @IsString({ message: 'Nomor telepon harus berupa string.' })
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'Nomor telepon harus valid (9-15 digit, boleh diawali +).',
  })
  phone_number?: string;

  @ApiPropertyOptional({
    description: 'URL foto avatar',
    example: 'https://storage.laporkita.id/avatars/siti.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'Avatar URL harus berupa URL yang valid.' })
  avatar_url?: string;
}
