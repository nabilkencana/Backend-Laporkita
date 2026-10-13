import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePolicySimulationDto {
  @ApiProperty({
    description: 'Deskripsi intervensi kebijakan tata ruang perkotaan',
    example:
      'Pemasangan 20 unit biopori dan perbaikan saluran drainase primer di kawasan Lowokwaru.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Prompt simulasi kebijakan tidak boleh kosong.' })
  @MaxLength(2000, { message: 'Prompt simulasi maksimal 2000 karakter.' })
  prompt_text!: string;

  @ApiPropertyOptional({
    description: 'ID zona wilayah spesifik (UUID v4), opsional',
    example: '55555555-5555-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'zone_id harus berformat UUID v4 valid.' })
  zone_id?: string;
}
