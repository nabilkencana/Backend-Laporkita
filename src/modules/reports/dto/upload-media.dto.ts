import { IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MediaType } from '@prisma/client';

export class UploadMediaDto {
  @ApiProperty({
    description: 'Tipe media foto pengerjaan yang diunggah',
    enum: [MediaType.progress_photo, MediaType.completion_photo],
    example: MediaType.progress_photo,
  })
  @IsNotEmpty({ message: 'Tipe media wajib dipilih.' })
  @IsEnum(MediaType, {
    message: 'Tipe media harus salah satu dari: progress_photo, completion_photo.',
  })
  type!: MediaType;
}
