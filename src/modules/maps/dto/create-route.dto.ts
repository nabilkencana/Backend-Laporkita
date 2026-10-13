import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateRouteDto {
  @ApiProperty({
    description: 'Latitude titik awal perjalanan (Pulau Jawa)',
    example: -7.978469,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka.' })
  @Min(-90)
  @Max(90)
  origin_lat!: number;

  @ApiProperty({
    description: 'Longitude titik awal perjalanan (Pulau Jawa)',
    example: 112.631782,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka.' })
  @Min(-180)
  @Max(180)
  origin_lng!: number;

  @ApiProperty({
    description: 'Latitude titik tujuan perjalanan (Pulau Jawa)',
    example: -7.942493,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Latitude harus berupa angka.' })
  @Min(-90)
  @Max(90)
  destination_lat!: number;

  @ApiProperty({
    description: 'Longitude titik tujuan perjalanan (Pulau Jawa)',
    example: 112.615668,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'Longitude harus berupa angka.' })
  @Min(-180)
  @Max(180)
  destination_lng!: number;
}