import { IsArray, IsNumber, IsOptional, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RoutePointDto {
  @ApiProperty({
    description: 'Latitude titik waypoint rute (Pulau Jawa)',
    example: -7.978469,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'lat harus berupa angka.' })
  @Min(-90, { message: 'lat minimal -90.' })
  @Max(90, { message: 'lat maksimal 90.' })
  lat!: number;

  @ApiProperty({
    description: 'Longitude titik waypoint rute (Pulau Jawa)',
    example: 112.631782,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'lng harus berupa angka.' })
  @Min(-180, { message: 'lng minimal -180.' })
  @Max(180, { message: 'lng maksimal 180.' })
  lng!: number;
}

export class ReportsAlongRouteDto {
  @ApiProperty({
    description: 'Daftar koordinat titik jalur perjalanan',
    type: [RoutePointDto],
    example: [
      { lat: -7.978469, lng: 112.631782 },
      { lat: -7.975, lng: 112.635 },
    ],
  })
  @IsArray({ message: 'route_points harus berupa array.' })
  @ValidateNested({ each: true })
  @Type(() => RoutePointDto)
  route_points!: RoutePointDto[];

  @ApiPropertyOptional({
    description: 'Radius deteksi laporan dari jalur dalam meter (50-2000m)',
    example: 300,
    default: 300,
    minimum: 50,
    maximum: 2000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'radius_meters harus berupa angka.' })
  @Min(50, { message: 'radius_meters minimal 50 meter.' })
  @Max(2000, { message: 'radius_meters maksimal 2000 meter.' })
  radius_meters?: number = 300;
}