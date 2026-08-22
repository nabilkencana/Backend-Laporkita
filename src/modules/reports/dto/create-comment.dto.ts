import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsNotEmpty({ message: 'Konten komentar wajib diisi.' })
  @IsString({ message: 'Konten komentar harus berupa string.' })
  @MaxLength(300, { message: 'Komentar maksimal 300 karakter (Rules.md §2.3).' })
  content!: string;
}
