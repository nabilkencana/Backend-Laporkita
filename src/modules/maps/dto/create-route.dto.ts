import { IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRouteDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka.' })
  @Min(-90)
  @Max(90)
  origin_lat!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka.' })
  @Min(-180)
  @Max(180)
  origin_lng!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka.' })
  @Min(-90)
  @Max(90)
  destination_lat!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka.' })
  @Min(-180)
  @Max(180)
  destination_lng!: number;
}