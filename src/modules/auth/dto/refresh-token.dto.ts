import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token JWT yang masih valid',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiY2l0aXplbiIsImlhdCI6MTY5MjY5NzYwMCwiZXhwIjoxNjkyNzg0MDAwfQ.signature',
  })
  @IsNotEmpty({ message: 'Refresh token wajib dikirim.' })
  @IsString({ message: 'Refresh token harus berupa string.' })
  refresh_token!: string;
}
