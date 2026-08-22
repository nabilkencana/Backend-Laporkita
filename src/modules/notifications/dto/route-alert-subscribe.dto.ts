import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RouteAlertSubscribeDto {
  @IsString()
  @IsNotEmpty({ message: 'device_token FCM tidak boleh kosong.' })
  device_token!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'last_lat harus berupa angka desimal valid.' })
  @Min(-90)
  @Max(90)
  last_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'last_long harus berupa angka desimal valid.' })
  @Min(-180)
  @Max(180)
  last_long?: number;
}
