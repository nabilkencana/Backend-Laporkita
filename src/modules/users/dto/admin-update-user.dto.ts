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
import { UserRole } from '@prisma/client';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Nama lengkap harus berupa string.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  full_name?: string;

  @IsOptional()
  @IsEnum(UserRole, {
    message: 'Role harus salah satu dari: citizen, operator, policy_maker, admin.',
  })
  role?: UserRole;

  @IsOptional()
  @IsUUID('4', { message: 'Agency ID harus berupa UUID v4 yang valid.' })
  agency_id?: string | null;

  @IsOptional()
  @IsString({ message: 'Nomor telepon harus berupa string.' })
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'Nomor telepon harus valid (9-15 digit, boleh diawali +).',
  })
  phone_number?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar URL harus berupa URL yang valid.' })
  avatar_url?: string;
}
