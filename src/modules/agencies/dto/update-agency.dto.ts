import { IsString, IsOptional, IsEnum, IsEmail, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AgencyType } from '@prisma/client';

export class UpdateAgencyDto {
  @ApiPropertyOptional({
    description: 'Nama resmi instansi',
    example: 'Dinas Perhubungan Kota Malang',
    minLength: 2,
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'Nama instansi harus berupa string.' })
  @MinLength(2, { message: 'Nama instansi minimal 2 karakter.' })
  @MaxLength(255, { message: 'Nama instansi maksimal 255 karakter.' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Tipe instansi',
    enum: AgencyType,
    example: AgencyType.dishub,
  })
  @IsOptional()
  @IsEnum(AgencyType, {
    message: 'Tipe instansi harus salah satu dari: dpupr, dishub, diskominfo, lainnya.',
  })
  type?: AgencyType;

  @ApiPropertyOptional({
    description: 'Email kontak resmi instansi',
    example: 'dishub@malangkota.go.id',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Format email kontak tidak valid.' })
  contact_email?: string;
}
