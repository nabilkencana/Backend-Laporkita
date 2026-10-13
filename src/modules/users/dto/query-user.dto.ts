import { IsOptional, IsInt, Min, Max, IsUUID, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';

export class QueryUserDto {
  @ApiPropertyOptional({
    description: 'Jumlah data per halaman (1-100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor ID pengguna untuk pagination (UUID v4)',
    example: '11111111-1111-4000-8000-000000000002',
  })
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan role pengguna',
    enum: UserRole,
    example: UserRole.citizen,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Kata kunci pencarian nama atau email',
    example: 'Budi',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
