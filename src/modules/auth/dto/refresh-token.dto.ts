import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty({ message: 'Refresh token wajib dikirim.' })
  @IsString({ message: 'Refresh token harus berupa string.' })
  refresh_token!: string;
}
