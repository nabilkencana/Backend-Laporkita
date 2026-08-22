import { IsString, IsNotEmpty, IsEnum, IsEmail, MinLength, MaxLength } from 'class-validator';
import { AgencyType } from '@prisma/client';

export class CreateAgencyDto {
  @IsNotEmpty({ message: 'Nama instansi wajib diisi.' })
  @IsString({ message: 'Nama instansi harus berupa string.' })
  @MinLength(2, { message: 'Nama instansi minimal 2 karakter.' })
  @MaxLength(255, { message: 'Nama instansi maksimal 255 karakter.' })
  name!: string;

  @IsNotEmpty({ message: 'Tipe instansi wajib dipilih.' })
  @IsEnum(AgencyType, {
    message: 'Tipe instansi harus salah satu dari: dpupr, dishub, diskominfo, lainnya.',
  })
  type!: AgencyType;

  @IsNotEmpty({ message: 'Email kontak instansi wajib diisi.' })
  @IsEmail({}, { message: 'Format email kontak tidak valid.' })
  contact_email!: string;
}
