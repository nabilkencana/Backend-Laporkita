import { IsNotEmpty, IsBoolean, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ValidateReportDto {
  @ApiProperty({
    description:
      'Hasil validasi fisik di lapangan (true = perbaikan selesai/sesuai, false = dispute/belum tuntas)',
    example: true,
  })
  @IsNotEmpty({ message: 'is_valid wajib diisi (true = sesuai, false = dispute).' })
  @IsBoolean({ message: 'is_valid harus bernilai boolean (true/false).' })
  is_valid!: boolean;

  @ApiPropertyOptional({
    description: 'Catatan hasil validasi fisik warga',
    example: 'Aspal sudah ditambal dengan mulus dan jalan dapat dilalui dengan lancar.',
  })
  @IsOptional()
  @IsString({ message: 'Catatan validasi harus berupa string.' })
  note?: string;

  /**
   * Koordinat user saat ini (untuk verifikasi radius 100m jika bukan pelapor asli, Rules.md §1.5)
   */
  @ApiPropertyOptional({
    description:
      'Koordinat lintang warga saat validasi (untuk verifikasi radius 100m jika bukan pelapor asli)',
    example: -7.978465,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka.' })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Koordinat bujur warga saat validasi',
    example: 112.63178,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka.' })
  @Min(-180)
  @Max(180)
  longitude?: number;
}
