import { IsNotEmpty, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus } from '@prisma/client';

export class TransitionStatusDto {
  @ApiProperty({
    description: 'Status target laporan sesuai state machine',
    enum: ReportStatus,
    example: ReportStatus.verified,
  })
  @IsNotEmpty({ message: 'Target status wajib diisi.' })
  @IsEnum(ReportStatus, {
    message:
      'Status harus salah satu dari: pending_verification, verified, rejected, assigned, in_progress, completed, resolved, disputed.',
  })
  status!: ReportStatus;

  @ApiPropertyOptional({
    description: 'Catatan transisi status oleh operator/petugas',
    example:
      'Laporan diverifikasi oleh tim survei lapangan DPUPR dan dijadwalkan untuk penambalan aspal.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: 'Catatan harus berupa string.' })
  @MaxLength(1000, { message: 'Catatan maksimal 1000 karakter.' })
  note?: string;

  @ApiPropertyOptional({
    description: 'ID instansi tujuan penugasan laporan (UUID v4)',
    example: 'a1000000-0000-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'assigned_agency_id harus berupa UUID v4 yang valid.' })
  assigned_agency_id?: string;
}
