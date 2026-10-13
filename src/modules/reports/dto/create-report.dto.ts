import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReportDto {
  @ApiProperty({
    description: 'ID kategori laporan (UUID v4)',
    example: '33333333-3333-4000-8000-000000000001',
  })
  @IsNotEmpty({ message: 'Kategori laporan wajib dipilih.' })
  @IsUUID(undefined, { message: 'category_id harus berupa UUID yang valid.' })
  category_id!: string;

  @ApiProperty({
    description: 'Koordinat lintang lokasi kerusakan (Pulau Jawa)',
    example: -7.978469,
    minimum: -90,
    maximum: 90,
  })
  @IsNotEmpty({ message: 'Koordinat latitude wajib dikirim.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka desimal.' })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({
    description: 'Koordinat bujur lokasi kerusakan (Pulau Jawa)',
    example: 112.631782,
    minimum: -180,
    maximum: 180,
  })
  @IsNotEmpty({ message: 'Koordinat longitude wajib dikirim.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka desimal.' })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    description: 'Deskripsi alamat fisik lokasi kerusakan',
    example: 'Jl. Ijen No. 12, Klojen, Kota Malang',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Alamat harus berupa string.' })
  @MaxLength(500, { message: 'Alamat maksimal 500 karakter.' })
  address_text?: string;

  @ApiPropertyOptional({
    description: 'Detail penjelasan kerusakan fasilitas publik',
    example:
      'Terdapat lubang jalan berdiameter sekitar 50cm dengan kedalaman 10cm di lajur kiri arah simpang balapan.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Deskripsi harus berupa string.' })
  @MaxLength(500, { message: 'Deskripsi laporan maksimal 500 karakter (Rules.md §2.1).' })
  description?: string;

  /**
   * Idempotency key untuk mencegah laporan ganda akibat retry jaringan (Rules.md §3).
   */
  @ApiPropertyOptional({
    description: 'Kunci idempotensi untuk mencegah duplikasi submit laporan',
    example: 'idem-rep-20260822-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Idempotency key harus berupa string.' })
  @MaxLength(100)
  idempotency_key?: string;
}
