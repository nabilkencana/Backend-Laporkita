import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsUrl,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Nama kategori fasilitas publik',
    example: 'Jalan Rusak / Berlubang',
    minLength: 2,
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Nama kategori wajib diisi.' })
  @IsString({ message: 'Nama kategori harus berupa string.' })
  @MinLength(2, { message: 'Nama kategori minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama kategori maksimal 100 karakter.' })
  name!: string;

  /**
   * default_agency_id WAJIB diisi saat create kategori untuk routing otomatis laporan
   * ke instansi terkait saat status laporan verified (Rules.md §1.7 & ERD §2.3).
   */
  @ApiProperty({
    description: 'ID instansi default penanggung jawab laporan (UUID v4)',
    example: '22222222-2222-4000-8000-000000000001',
  })
  @IsNotEmpty({
    message:
      'default_agency_id wajib diisi untuk routing otomatis laporan ke instansi (Rules.md §1.7).',
  })
  @IsUUID('4', { message: 'default_agency_id harus berupa UUID v4 yang valid.' })
  default_agency_id!: string;

  @ApiPropertyOptional({
    description: 'URL ikon kategori (SVG/PNG)',
    example: 'https://storage.laporkita.id/icons/road.svg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'Icon URL harus berupa URL yang valid.' })
  icon_url?: string;

  @ApiPropertyOptional({
    description: 'Bobot urgensi kategori untuk smart priority (0.1 - 10.0)',
    example: 1.5,
    default: 1.0,
    minimum: 0.1,
    maximum: 10.0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Bobot urgensi harus berupa angka desimal.' })
  @Min(0.1, { message: 'Bobot urgensi minimal 0.1.' })
  @Max(10.0, { message: 'Bobot urgensi maksimal 10.0.' })
  urgency_weight?: number;
}
