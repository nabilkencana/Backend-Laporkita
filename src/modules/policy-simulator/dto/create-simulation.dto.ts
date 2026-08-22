import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class CreatePolicySimulationDto {
  @IsString()
  @IsNotEmpty({ message: 'Prompt simulasi kebijakan tidak boleh kosong.' })
  @MaxLength(2000, { message: 'Prompt simulasi maksimal 2000 karakter.' })
  prompt_text!: string;

  @IsOptional()
  @IsUUID('4', { message: 'zone_id harus berformat UUID v4 valid.' })
  zone_id?: string;
}
