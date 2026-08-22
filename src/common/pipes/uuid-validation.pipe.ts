import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

/**
 * UuidValidationPipe — validasi param UUID dengan pesan lokal yang konsisten
 * dengan format VALIDATION_ERROR (Rules.md §3).
 */
@Injectable()
export class UuidValidationPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) {
      throw new BadRequestException({
        message: ['ID parameter harus berupa UUID yang valid.'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }
    return value;
  }
}
