import { IsOptional, IsInt, Min, Max, IsUUID, IsEnum, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';

export class QueryUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  search?: string;
}
