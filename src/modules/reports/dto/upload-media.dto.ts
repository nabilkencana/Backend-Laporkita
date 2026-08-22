import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { MediaType } from '@prisma/client';

export class UploadMediaDto {
  @IsNotEmpty({ message: 'Tipe media wajib dipilih.' })
  @IsEnum(MediaType, {
    message: 'Tipe media harus salah satu dari: progress_photo, completion_photo.',
  })
  type!: MediaType;

  @IsOptional()
  @IsString({ message: 'URL foto harus berupa string valid.' })
  url?: string;
}
