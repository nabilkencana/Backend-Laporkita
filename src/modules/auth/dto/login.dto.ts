import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Email atau nomor telepon pengguna terdaftar',
    example: 'budi@example.com',
  })
  @IsNotEmpty({ message: 'Email atau nomor telepon wajib diisi.' })
  @IsString({ message: 'Identifier harus berupa string.' })
  identifier!: string;

  @ApiProperty({
    description: 'Kata sandi akun',
    example: 'Password123',
  })
  @IsNotEmpty({ message: 'Password wajib diisi.' })
  @IsString({ message: 'Password harus berupa string.' })
  password!: string;
}
