import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsString({ message: 'Nama lengkap harus berupa string.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  full_name!: string;

  @ValidateIf((o: RegisterDto) => !o.phone_number || !!o.email)
  @IsEmail({}, { message: 'Format email tidak valid.' })
  @IsOptional()
  email?: string;

  @ValidateIf((o: RegisterDto) => !o.email || !!o.phone_number)
  @IsString({ message: 'Nomor telepon harus berupa string.' })
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'Nomor telepon harus valid (9-15 digit, boleh diawali +).',
  })
  @IsOptional()
  phone_number?: string;

  @IsString({ message: 'Password harus berupa string.' })
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password harus merupakan kombinasi huruf dan angka (Rules.md §2.2).',
  })
  password!: string;
}
