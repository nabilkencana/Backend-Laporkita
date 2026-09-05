import { IsArray, IsNumber, IsOptional, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class RoutePointDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'lat harus berupa angka.' })
  @Min(-90, { message: 'lat minimal -90.' })
  @Max(90, { message: 'lat maksimal 90.' })
  lat!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'lng harus berupa angka.' })
  @Min(-180, { message: 'lng minimal -180.' })
  @Max(180, { message: 'lng maksimal 180.' })
  lng!: number;
}

export class ReportsAlongRouteDto {
  @IsArray({ message: 'route_points harus berupa array.' })
  @ValidateNested({ each: true })
  @Type(() => RoutePointDto)
  route_points!: RoutePointDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'radius_meters harus berupa angka.' })
  @Min(50, { message: 'radius_meters minimal 50 meter.' })
  @Max(2000, { message: 'radius_meters maksimal 2000 meter.' })
  radius_meters?: number = 300;
}