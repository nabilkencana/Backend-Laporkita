import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RouteAlertSubscribeDto {
  @ApiProperty({
    description: 'FCM (Firebase Cloud Messaging) Device Token pengguna',
    example: 'fcm_token_device_abc123xyz456...',
  })
  @IsString()
  @IsNotEmpty({ message: 'device_token FCM tidak boleh kosong.' })
  device_token!: string;

  @ApiPropertyOptional({
    description: 'Koordinat lintang terkini pengguna untuk geofencing',
    example: -7.978469,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'last_lat harus berupa angka desimal valid.' })
  @Min(-90)
  @Max(90)
  last_lat?: number;

  @ApiPropertyOptional({
    description: 'Koordinat bujur terkini pengguna untuk geofencing',
    example: 112.631782,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'last_long harus berupa angka desimal valid.' })
  @Min(-180)
  @Max(180)
  last_long?: number;
}
