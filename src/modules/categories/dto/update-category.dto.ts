import {
  IsString,
  IsOptional,
  IsUUID,
  IsUrl,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    description: 'Nama kategori fasilitas publik baru',
    example: 'Jalan Rusak Berat',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Nama kategori harus berupa string.' })
  @MinLength(2, { message: 'Nama kategori minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama kategori maksimal 100 karakter.' })
  name?: string;

  @ApiPropertyOptional({
    description: 'ID instansi default baru (UUID v4)',
    example: '22222222-2222-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'default_agency_id harus berupa UUID v4 yang valid.' })
  default_agency_id?: string;

  @ApiPropertyOptional({
    description: 'URL ikon kategori baru',
    example: 'https://storage.laporkita.id/icons/road-danger.svg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'Icon URL harus berupa URL yang valid.' })
  icon_url?: string;

  @ApiPropertyOptional({
    description: 'Bobot urgensi baru (0.1 - 10.0)',
    example: 2.0,
    minimum: 0.1,
    maximum: 10.0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Bobot urgensi harus berupa angka desimal.' })
  @Min(0.1, { message: 'Bobot urgensi minimal 0.1.' })
  @Max(10.0, { message: 'Bobot urgensi maksimal 10.0.' })
  urgency_weight?: number;
}
