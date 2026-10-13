import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Isi teks komentar warga atau petugas terhadap laporan',
    example: 'Apakah perbaikan jalan ini sudah dijadwalkan oleh dinas terkait?',
    maxLength: 300,
  })
  @IsNotEmpty({ message: 'Konten komentar wajib diisi.' })
  @IsString({ message: 'Konten komentar harus berupa string.' })
  @MaxLength(300, { message: 'Komentar maksimal 300 karakter (Rules.md §2.3).' })
  content!: string;
}
