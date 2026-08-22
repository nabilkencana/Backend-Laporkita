import { IsNotEmpty, IsEnum, IsUrl } from 'class-validator';
import { MediaType } from '@prisma/client';

export class UploadMediaDto {
  @IsNotEmpty({ message: 'Tipe media wajib dipilih.' })
  @IsEnum(MediaType, {
    message: 'Tipe media harus salah satu dari: progress_photo, completion_photo.',
  })
  type!: MediaType;

  @IsNotEmpty({ message: 'URL foto wajib diisi.' })
  @IsUrl({}, { message: 'URL foto harus berupa URL valid.' })
  url!: string;
}
