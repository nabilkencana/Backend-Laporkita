import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsEnum,
  IsNumber,
  IsString,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { ReportStatus } from '@prisma/client';

function parseOptionalQueryBoolean({ obj, key }: { obj: Record<string, unknown>; key: string }) {
  const raw = obj?.[key];
  if (raw === 'true' || raw === true || raw === '1') return true;
  if (raw === 'false' || raw === false || raw === '0') return false;
  return undefined;
}

export class QueryReportsDto {
  @ApiPropertyOptional({
    description: 'Batas jumlah laporan per halaman (1-100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor ID laporan untuk pagination cursor-based (UUID v4)',
    example: '44444444-4444-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan status laporan',
    enum: ReportStatus,
    example: ReportStatus.verified,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID kategori (UUID v4)',
    example: '33333333-3333-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID()
  category_id?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID pelapor (UUID v4)',
    example: '11111111-1111-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID()
  reporter_id?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID dinas yang ditugaskan (UUID v4)',
    example: '22222222-2222-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID()
  assigned_agency_id?: string;

  @ApiPropertyOptional({
    description: 'Metode pengurutan hasil laporan',
    enum: ['newest', 'oldest', 'urgency', 'most_supported'],
    example: 'newest',
    default: 'newest',
  })
  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest', 'urgency', 'most_supported'])
  sort_by: 'newest' | 'oldest' | 'urgency' | 'most_supported' = 'newest';

  // Bounding box filter (untuk peta publik)
  @ApiPropertyOptional({
    description: 'Batas minimum latitude bounding box',
    example: -7.99,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_lat?: number;

  @ApiPropertyOptional({
    description: 'Batas maksimum latitude bounding box',
    example: -7.95,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_lat?: number;

  @ApiPropertyOptional({
    description: 'Batas minimum longitude bounding box',
    example: 112.6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_lng?: number;

  @ApiPropertyOptional({
    description: 'Batas maksimum longitude bounding box',
    example: 112.65,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_lng?: number;

  /**
   * Filter antrian verifikasi manual operator (Rules.md §1.2)
   * Menampilkan laporan pending_verification yang belum lolos AI otomatis
   */
  @ApiPropertyOptional({
    description: 'Filter khusus operator untuk laporan yang membutuhkan review manual AI',
    example: true,
  })
  @IsOptional()
  @Transform(parseOptionalQueryBoolean)
  @IsBoolean()
  needs_manual_review?: boolean;

  @ApiPropertyOptional({
    description: 'Alias camelCase untuk needs_manual_review',
    example: true,
  })
  @IsOptional()
  @Transform(parseOptionalQueryBoolean)
  @IsBoolean()
  needsManualReview?: boolean;
}
