import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Shape response sukses sesuai Rules.md §3:
 *   { success: true, data, meta, error: null }
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: PaginationMeta | null;
  error: null;
}

/**
 * Metadata pagination — cursor-based sesuai Rules.md §3 (cursor pagination).
 * Service yang mengembalikan data paginated WAJIB membungkus response dengan
 * interface PaginatedResult<T> (lihat di bawah) agar interceptor mendeteksinya.
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  /** Cursor untuk request halaman berikutnya */
  nextCursor: string | null;
  hasPrevious: boolean;
}

/**
 * Kontrak yang harus diimplementasi service yang mengembalikan data paginated.
 * Controller yang memanggil service paginated TIDAK perlu melakukan apa-apa —
 * interceptor otomatis mendeteksi shape ini.
 *
 * Contoh penggunaan di service:
 *   return { data: reports, meta: { total, limit, nextCursor, hasPrevious } };
 */
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * isPaginatedResult — type guard untuk membedakan response paginated vs reguler.
 */
function isPaginatedResult(value: unknown): value is PaginatedResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    Array.isArray((value as PaginatedResult<unknown>).data)
  );
}

/**
 * ResponseInterceptor — global interceptor yang otomatis membungkus semua
 * response sukses ke format envelope Rules.md §3:
 *   { success: true, data: ..., meta: ..., error: null }
 *
 * Tidak perlu diaplikasikan per-controller — sudah diregister di main.ts.
 *
 * Logika pembungkusan:
 * - Jika service return { data: T[], meta: PaginationMeta } → unwrap keduanya
 * - Jika service return apapun lainnya → jadikan `data`, meta = null
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (isPaginatedResult(value)) {
          return {
            success: true as const,
            data: value.data as T,
            meta: value.meta,
            error: null,
          };
        }

        return {
          success: true as const,
          data: value as T,
          meta: null,
          error: null,
        };
      }),
    );
  }
}
