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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReportStatus } from '@prisma/client';

export class QueryReportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsUUID()
  reporter_id?: string;

  @IsOptional()
  @IsUUID()
  assigned_agency_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest', 'urgency', 'most_supported'])
  sort_by: 'newest' | 'oldest' | 'urgency' | 'most_supported' = 'newest';

  // Bounding box filter (untuk peta publik)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  min_lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  max_lng?: number;

  /**
   * Filter antrian verifikasi manual operator (Rules.md §1.2)
   * Menampilkan laporan pending_verification yang belum lolos AI otomatis
   */
  @IsOptional()
  @Type(() => Boolean)
  needs_manual_review?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  needsManualReview?: boolean;
}
