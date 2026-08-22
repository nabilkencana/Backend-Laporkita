import { IsOptional, IsString, MinLength, MaxLength, Matches, IsUrl } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString({ message: 'Nama lengkap harus berupa string.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  full_name?: string;

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
