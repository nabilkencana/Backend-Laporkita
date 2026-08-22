import { IsString, IsEmail, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * RegisterDto — Fase 3B override resmi dari ANTIGRAVITY_PROMPT_LaporKita_Backend.md:
 * email DAN phone_number KEDUANYA WAJIB diisi (bukan either-or).
 * Alasan: phone_number dipakai untuk OTP verification (Fase 3B) — tanpa
 * phone_number valid, user tidak pernah bisa menerima OTP → akun zombie
 * permanen stuck is_active=false.
 */
export class RegisterDto {
  @ApiProperty({ example: 'Budi Santoso', description: 'Nama lengkap pengguna' })
  @IsNotEmpty({ message: 'Nama lengkap wajib diisi.' })
  @IsString({ message: 'Nama lengkap harus berupa string.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  full_name!: string;

  @ApiProperty({ example: 'budi@example.com', description: 'Alamat email — wajib diisi' })
  @IsNotEmpty({ message: 'Email wajib diisi.' })
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email!: string;

  @ApiProperty({ example: '+6281234567890', description: 'Nomor telepon — wajib diisi untuk OTP' })
  @IsNotEmpty({ message: 'Nomor telepon wajib diisi.' })
  @IsString({ message: 'Nomor telepon harus berupa string.' })
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'Nomor telepon harus valid (9-15 digit, boleh diawali +).',
  })
  phone_number!: string;

  @ApiProperty({
    example: 'Password123',
    description: 'Password min 8 karakter, kombinasi huruf & angka',
  })
  @IsNotEmpty({ message: 'Password wajib diisi.' })
  @IsString({ message: 'Password harus berupa string.' })
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password harus merupakan kombinasi huruf dan angka (Rules.md §2.2).',
  })
  password!: string;
}
