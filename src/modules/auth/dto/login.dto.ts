import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty({ message: 'Email atau nomor telepon wajib diisi.' })
  @IsString({ message: 'Identifier harus berupa string.' })
  identifier!: string;

  @IsNotEmpty({ message: 'Password wajib diisi.' })
  @IsString({ message: 'Password harus berupa string.' })
  password!: string;
}
