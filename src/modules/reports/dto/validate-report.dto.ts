import { IsNotEmpty, IsBoolean, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ValidateReportDto {
  @IsNotEmpty({ message: 'is_valid wajib diisi (true = sesuai, false = dispute).' })
  @IsBoolean({ message: 'is_valid harus bernilai boolean (true/false).' })
  is_valid!: boolean;

  @IsOptional()
  @IsString({ message: 'Catatan validasi harus berupa string.' })
  note?: string;

  /**
   * Koordinat user saat ini (untuk verifikasi radius 100m jika bukan pelapor asli, Rules.md §1.5)
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka.' })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka.' })
  @Min(-180)
  @Max(180)
  longitude?: number;
}
