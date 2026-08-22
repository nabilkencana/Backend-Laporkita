import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Error response envelope — sesuai Rules.md §3.
 */
interface ErrorResponse {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * HttpExceptionFilter — global exception filter yang menangkap SEMUA error
 * dan membungkusnya ke format standar Rules.md §3:
 *   { success: false, data: null, error: { code, message } }
 *
 * Menangani:
 * - HttpException (termasuk ValidationPipe errors dari class-validator)
 * - PrismaClientKnownRequestError (constraint violations, record not found)
 * - Error tidak terduga (fallback 500)
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, errorResponse } = this.resolveException(exception);

    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      response.setHeader('Retry-After', '60');
    }

    // Log error — 500 sebagai error, sisanya sebagai warn
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} → ${status} (${errorResponse.error.code})`,
      );
    }

    response.status(status).json(errorResponse);
  }

  private resolveException(exception: unknown): {
    status: number;
    errorResponse: ErrorResponse;
  } {
    // ── HttpException (NestJS built-in, termasuk ValidationPipe) ──────────
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Deteksi parsing error dari body-parser (Pekerjaan 5)
      if (status === Number(HttpStatus.BAD_REQUEST)) {
        const rawMsg =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : typeof exceptionResponse === 'object' &&
                exceptionResponse !== null &&
                'message' in exceptionResponse
              ? String((exceptionResponse as Record<string, unknown>).message)
              : exception.message;

        if (/JSON|Unexpected token|Unexpected end|Expected propert/i.test(rawMsg)) {
          return {
            status: HttpStatus.BAD_REQUEST,
            errorResponse: {
              success: false,
              data: null,
              error: {
                code: 'INVALID_JSON',
                message: 'Format body JSON tidak valid.',
                details: ['Request body harus berupa JSON yang valid.'],
              },
            },
          };
        }
      }

      // ValidationPipe menghasilkan BadRequestException dengan array pesan
      if (
        status === Number(HttpStatus.BAD_REQUEST) &&
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse &&
        Array.isArray(exceptionResponse.message)
      ) {
        const validationMessages = (exceptionResponse as { message: string[] }).message;
        return {
          status,
          errorResponse: {
            success: false,
            data: null,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Input tidak valid. Periksa field yang dikirim.',
              details: validationMessages,
            },
          },
        };
      }

      // HttpException generik — map ke error code yang readable
      const code = this.httpStatusToCode(status);
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : typeof exceptionResponse === 'object' &&
              exceptionResponse !== null &&
              'message' in exceptionResponse
            ? String(exceptionResponse.message)
            : exception.message;

      return {
        status,
        errorResponse: {
          success: false,
          data: null,
          error: { code, message },
        },
      };
    }

    // ── Prisma Known Request Errors ────────────────────────────────────────
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    // ── Prisma Validation Error (skema mismatch) ───────────────────────────
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error('Prisma validation error', exception.message);
      return {
        status: HttpStatus.BAD_REQUEST,
        errorResponse: {
          success: false,
          data: null,
          error: {
            code: 'INVALID_DATA',
            message: 'Data tidak sesuai skema database.',
          },
        },
      };
    }

    // ── Unhandled / Unknown error (fallback 500) ───────────────────────────
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorResponse: {
        success: false,
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Terjadi kesalahan internal. Silakan coba lagi.',
        },
      },
    };
  }

  private resolvePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    errorResponse: ErrorResponse;
  } {
    switch (error.code) {
      // Unique constraint violation — misal duplikasi email, support dua kali
      case 'P2002': {
        const fields = (error.meta?.target as string[])?.join(', ') ?? 'field';
        return {
          status: HttpStatus.CONFLICT,
          errorResponse: {
            success: false,
            data: null,
            error: {
              code: 'CONFLICT',
              message: `Data sudah ada: ${fields} harus unik.`,
            },
          },
        };
      }
      // Record not found (deleteMany/update pada data yang tidak ada)
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          errorResponse: {
            success: false,
            data: null,
            error: {
              code: 'NOT_FOUND',
              message: 'Data tidak ditemukan.',
            },
          },
        };
      // Foreign key constraint violation
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          errorResponse: {
            success: false,
            data: null,
            error: {
              code: 'INVALID_REFERENCE',
              message: 'Referensi ke data terkait tidak valid.',
            },
          },
        };
      default:
        this.logger.error(`Prisma error ${error.code}`, error.message);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          errorResponse: {
            success: false,
            data: null,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Terjadi kesalahan database.',
            },
          },
        };
    }
  }

  private httpStatusToCode(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? `HTTP_${status}`;
  }
}
