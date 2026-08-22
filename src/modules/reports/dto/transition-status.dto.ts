import { IsNotEmpty, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class TransitionStatusDto {
  @IsNotEmpty({ message: 'Target status wajib diisi.' })
  @IsEnum(ReportStatus, {
    message:
      'Status harus salah satu dari: pending_verification, verified, rejected, assigned, in_progress, completed, resolved, disputed.',
  })
  status!: ReportStatus;

  @IsOptional()
  @IsString({ message: 'Catatan harus berupa string.' })
  @MaxLength(1000, { message: 'Catatan maksimal 1000 karakter.' })
  note?: string;
}
