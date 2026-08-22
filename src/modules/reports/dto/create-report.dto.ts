import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReportDto {
  @IsNotEmpty({ message: 'Kategori laporan wajib dipilih.' })
  @IsUUID(undefined, { message: 'category_id harus berupa UUID yang valid.' })
  category_id!: string;

  /**
   * Foto wajib JPEG/PNG max 8MB min 480p (Rules.md §2.1).
   * URL hasil upload dari device/storage client.
   */
  @IsNotEmpty({ message: 'Foto laporan wajib dilampirkan.' })
  @IsUrl({}, { message: 'URL foto harus berupa URL valid.' })
  photo_url!: string;

  @IsNotEmpty({ message: 'Koordinat latitude wajib dikirim.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka desimal.' })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNotEmpty({ message: 'Koordinat longitude wajib dikirim.' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka desimal.' })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsString({ message: 'Alamat harus berupa string.' })
  @MaxLength(500, { message: 'Alamat maksimal 500 karakter.' })
  address_text?: string;

  @IsOptional()
  @IsString({ message: 'Deskripsi harus berupa string.' })
  @MaxLength(500, { message: 'Deskripsi laporan maksimal 500 karakter (Rules.md §2.1).' })
  description?: string;

  /**
   * Idempotency key untuk mencegah laporan ganda akibat retry jaringan (Rules.md §3).
   */
  @IsOptional()
  @IsString({ message: 'Idempotency key harus berupa string.' })
  @MaxLength(100)
  idempotency_key?: string;
}
