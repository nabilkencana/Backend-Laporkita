import { IsString, IsNotEmpty, IsEnum, IsEmail, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AgencyType } from '@prisma/client';

export class CreateAgencyDto {
  @ApiProperty({
    description: 'Nama resmi dinas/instansi',
    example: 'Dinas Pekerjaan Umum dan Penataan Ruang (DPUPR) Kota Malang',
    minLength: 2,
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'Nama instansi wajib diisi.' })
  @IsString({ message: 'Nama instansi harus berupa string.' })
  @MinLength(2, { message: 'Nama instansi minimal 2 karakter.' })
  @MaxLength(255, { message: 'Nama instansi maksimal 255 karakter.' })
  name!: string;

  @ApiProperty({
    description: 'Tipe instansi',
    enum: AgencyType,
    example: AgencyType.dpupr,
  })
  @IsNotEmpty({ message: 'Tipe instansi wajib dipilih.' })
  @IsEnum(AgencyType, {
    message: 'Tipe instansi harus salah satu dari: dpupr, dishub, diskominfo, lainnya.',
  })
  type!: AgencyType;

  @ApiProperty({
    description: 'Alamat email kontak resmi instansi',
    example: 'dpupr@malangkota.go.id',
  })
  @IsNotEmpty({ message: 'Email kontak instansi wajib diisi.' })
  @IsEmail({}, { message: 'Format email kontak tidak valid.' })
  contact_email!: string;
}
