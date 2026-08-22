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

export class CreateCategoryDto {
  @IsNotEmpty({ message: 'Nama kategori wajib diisi.' })
  @IsString({ message: 'Nama kategori harus berupa string.' })
  @MinLength(2, { message: 'Nama kategori minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama kategori maksimal 100 karakter.' })
  name!: string;

  /**
   * default_agency_id WAJIB diisi saat create kategori untuk routing otomatis laporan
   * ke instansi terkait saat status laporan verified (Rules.md §1.7 & ERD §2.3).
   */
  @IsNotEmpty({
    message:
      'default_agency_id wajib diisi untuk routing otomatis laporan ke instansi (Rules.md §1.7).',
  })
  @IsUUID('4', { message: 'default_agency_id harus berupa UUID v4 yang valid.' })
  default_agency_id!: string;

  @IsOptional()
  @IsUrl({}, { message: 'Icon URL harus berupa URL yang valid.' })
  icon_url?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Bobot urgensi harus berupa angka desimal.' })
  @Min(0.1, { message: 'Bobot urgensi minimal 0.1.' })
  @Max(10.0, { message: 'Bobot urgensi maksimal 10.0.' })
  urgency_weight?: number;
}
