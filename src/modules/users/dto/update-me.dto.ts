import { IsOptional, IsString, MinLength, MaxLength, Matches, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMeDto {
  @ApiPropertyOptional({
    description: 'Nama lengkap baru',
    example: 'Budi Santoso Nugroho',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Nama lengkap harus berupa string.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  full_name?: string;

  @ApiPropertyOptional({
    description: 'Nomor telepon baru format E.164',
    example: '+6281298765432',
  })
  @IsOptional()
  @IsString({ message: 'Nomor telepon harus berupa string.' })
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'Nomor telepon harus valid (9-15 digit, boleh diawali +).',
  })
  phone_number?: string;

  @ApiPropertyOptional({
    description: 'URL foto profil avatar baru',
    example: 'https://storage.laporkita.id/avatars/user-1.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'Avatar URL harus berupa URL yang valid.' })
  avatar_url?: string;
}
