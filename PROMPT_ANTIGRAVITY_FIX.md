# PROMPT ANTIGRAVITY — PERBAIKAN TEMUAN QA BACKEND LAPORKITA

Kamu adalah senior NestJS engineer. Perbaiki 6 temuan QA berikut di project backend
LaporKita secara tuntas dan profesional. Baca konteks, kerjakan semua item, lalu
jalankan verifikasi akhir. JANGAN commit/push. JANGAN mengubah file di luar cakupan
yang disebutkan kecuali benar-benar diperlukan. Ikuti gaya kode yang sudah ada
(komentar Bahasa Indonesia, import pakai akhiran .js, prettier).

## KONTEKS PROJECT
- Stack: NestJS 11, Prisma 7 (PostgreSQL via adapter-pg), BullMQ (Redis), class-validator,
  @nestjs/swagger, @nestjs/throttler, @nestjs/schedule (cron), bcryptjs, passport-jwt.
- Struktur: src/modules/<fitur>/{*.controller.ts, *.service.ts, *.repository.ts, dto/},
  src/common/{filters, guards, decorators, interceptors, pipes}.
- Global setup (src/main.ts): prefix /api + URI versioning v1, ValidationPipe
  (whitelist + forbidNonWhitelisted + transform), HttpExceptionFilter (envelope
  { success, data, meta, error }), ResponseInterceptor, Swagger di /api/docs.
- Envelope error: { success: false, data: null, error: { code, message, details? } }.
  Kode VALIDATION_ERROR diproduksi filter jika BadRequestException.response.message
  berupa ARRAY (hasil ValidationPipe).
- Guard: JwtAuthGuard membaca metadata IS_PUBLIC_KEY dari decorator @Public() —
  endpoint ber-@Public() TIDAK butuh token (src/common/decorators/roles.decorator.ts).
- Role: citizen, operator, policy_maker, admin (enum UserRole, src/prisma/schema.prisma).
- Report model punya field: reporter_id, assigned_agency_id, assigned_officer_id.
- MediaType enum: initial_photo, progress_photo, completion_photo.
- Script verifikasi: npm run lint, npm run build, npm run test.

================================================================================
## PEKERJAAN 1 [HIGH] — Otorisasi Upload Media Laporan (IDOR)
================================================================================
### Masalah
POST /api/v1/reports/:id/media saat ini TANPA cek otorisasi: user citizen mana pun
bisa mengunggah completion_photo/progress_photo ke laporan milik orang lain
(terbukti 201 di QA). Foto "bukti penyelesaian" palsu bisa mempengaruhi keputusan
operator.

### File yang diubah
1. src/modules/reports/reports.service.ts — method uploadMedia() (± baris 476)
2. src/modules/reports/reports.controller.ts — method uploadMedia (baris ~162-170)
3. src/modules/reports/reports.service.spec.ts — tambah unit test regresi

### Kode saat ini (service)
```ts
async uploadMedia(
  reportId: string,
  uploaderId: string,
  dto: UploadMediaDto,
): Promise<{ id: string; url: string; type: MediaType }> {
  validateMediaUrlFormat(dto.url);
  const report = await this.reportsRepository.findById(reportId);
  if (!report) {
    throw new NotFoundException(`Laporan dengan ID '${reportId}' tidak ditemukan.`);
  }
  const media = await this.reportsRepository.addMedia(reportId, uploaderId, dto.type, dto.url);
  return { id: media.id, url: media.url, type: media.type };
}
```

### Kode saat ini (controller)
```ts
@Post(':id/media')
@HttpCode(HttpStatus.CREATED)
async uploadMedia(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser('id') uploaderId: string,
  @Body() dto: UploadMediaDto,
): Promise<{ id: string; url: string; type: MediaType }> {
  return this.reportsService.uploadMedia(reportIdFromParam(id), uploaderId, dto);
}
```

### Perubahan yang diminta
1. Ubah signature service: terima `uploader: AuthenticatedUser` (bukan uploaderId string).
   AuthenticatedUser sudah diimpor di service (dari common/decorators/current-user.decorator).
2. Terapkan aturan otorisasi media (sesuai Rules.md §1.1):
   - `initial_photo`: HANYA pelapor (uploader.id === report.reporter_id). → else ForbiddenException.
   - `progress_photo`: pelapor ATAU (operator/admin yang agency-nya cocok dengan
     report.assigned_agency_id). Catatan fleksibilitas: jika report.assigned_agency_id
     masih null, operator/admin yang sudah login boleh (laporan belum ditugaskan).
   - `completion_photo`: HANYA operator/admin yang agency-nya cocok dengan
     report.assigned_agency_id (admin selalu diizinkan). Jika laporan belum punya
     assigned_agency_id, operator/admin boleh mengunggah (belum ada penanggung jawab).
   - Pesan ForbiddenException pakai format konsisten:
     'FORBIDDEN_MEDIA: Anda tidak memiliki izin mengunggah media <type> untuk laporan ini.'
3. Controller: ganti `@CurrentUser('id') uploaderId: string` menjadi
   `@CurrentUser() user: AuthenticatedUser` dan panggil
   `this.reportsService.uploadMedia(reportIdFromParam(id), user, dto)`.
   (AuthenticatedUser sudah diimpor di controller baris 26-29.)
4. Tambahkan unit test di reports.service.spec.ts (ikuti pola test yang ada):
   - citizen non-pemilik upload completion_photo → ForbiddenException
   - citizen non-pemilik upload progress_photo → ForbiddenException
   - pelapor upload progress_photo ke laporannya sendiri → sukses
   - operator dengan agency cocok upload completion_photo → sukses
   - admin upload completion_photo → sukses
   - laporan tidak ditemukan → NotFoundException (regresi)

### Acceptance criteria
- [ ] citizen A TIDAK bisa upload media apa pun ke laporan milik citizen B (403)
- [ ] pelapor bisa upload progress_photo ke laporannya sendiri (201)
- [ ] operator/admin dengan agency cocok bisa upload completion_photo (201)
- [ ] initial_photo hanya oleh pelapor (403 untuk selain pelapor)
- [ ] semua test lama tetap hijau

================================================================================
## PEKERJAAN 2 [MEDIUM] — GET /agencies Wajib Auth (Inkonsisten dengan Docs)
================================================================================
### Masalah
AgenciesController punya @UseGuards(JwtAuthGuard, RolesGuard) di level class tanpa
@Public() pada GET — padahal GET /categories & GET /reports bersifat publik, dan
Swagger mendokumentasikan agencies sebagai publik. Viewer peta yang belum login
mendapat 401.

### File yang diubah
src/modules/agencies/agencies.controller.ts

### Perubahan yang diminta
1. Import Public dari '../../common/decorators/roles.decorator.js' (sudah ada import Roles
   dari file yang sama — tambahkan Public).
2. Beri @Public() pada method findAll() dan findById() (dua GET). Endpoint mutasi
   (POST/PATCH/DELETE) tetap admin-only — JANGAN diberi @Public().

### Acceptance criteria
- [ ] GET /api/v1/agencies TANPA token → 200 (bukan 401)
- [ ] GET /api/v1/agencies/:id TANPA token → 200 (bukan 401)
- [ ] POST /api/v1/agencies TANPA token tetap 401, dengan citizen tetap 403

================================================================================
## PEKERJAAN 3 [LOW] — Metadata Security Swagger (Gembok 🔒 di UI)
================================================================================
### Masalah
Tidak ada @ApiBearerAuth() sehingga Swagger UI tidak menampilkan indikator auth per
endpoint; tester/juri sulit tahu endpoint mana yang butuh token. Security scheme
sudah didaftarkan dengan nama 'bearer' di main.ts (addBearerAuth(..., 'bearer')),
jadi cukup pakai @ApiBearerAuth() (default name = 'bearer').

### File yang diubah (tambahkan import { ApiBearerAuth } dari '@nestjs/swagger')
1. src/modules/users/users.controller.ts — @ApiBearerAuth() level class (semua protected)
2. src/modules/agencies/agencies.controller.ts — level class (semua protected)
3. src/modules/notifications/notifications.controller.ts — level class
4. src/modules/notifications/route-alert.controller.ts — level class
5. src/modules/policy-simulator/policy-simulator.controller.ts — level class
6. src/modules/prediction/prediction.controller.ts — HANYA method refreshMetrics()
   (GET zones & zone metrics adalah @Public — jangan ditandai auth)
7. src/modules/reports/reports.controller.ts — HANYA method protected:
   submitReport, transitionStatus, supportReport, cancelSupport, addComment,
   validateReport, uploadMedia. JANGAN pada findAll/findById/getComments (publik).

### Acceptance criteria
- [ ] /api/docs: endpoint protected menampilkan gembok, endpoint publik tidak
- [ ] GET /api/v1/docs-json → operasi protected punya "security": [{"bearer": []}]

================================================================================
## PEKERJAAN 4 [LOW] — Pesan Error UUID Invalid Tidak Konsisten
================================================================================
### Masalah
ParseUUIDPipe bawaan membalas "Validation failed (uuid is expected)" (English,
code BAD_REQUEST) — tidak konsisten dengan format VALIDATION_ERROR + Bahasa
Indonesia dari ValidationPipe.

### File yang diubah
1. BUAT FILE BARU: src/common/pipes/uuid-validation.pipe.ts
2. Ganti SEMUA pemakaian ParseUUIDPipe di 7 controller berikut (import + usage):

   - src/modules/reports/reports.controller.ts       (8 pemakaian)
   - src/modules/users/users.controller.ts           (3 pemakaian)
   - src/modules/categories/categories.controller.ts (3 pemakaian)
   - src/modules/agencies/agencies.controller.ts     (3 pemakaian)
   - src/modules/notifications/notifications.controller.ts (1 pemakaian)
   - src/modules/prediction/prediction.controller.ts (1 pemakaian: zoneId)
   - src/modules/policy-simulator/policy-simulator.controller.ts (1 pemakaian)

### Kode pipe baru (ikuti persis — response HARUS object ber-message array agar
### filter memproduksi code VALIDATION_ERROR)
```ts
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
```

Penggunaan: `@Param('id', new UuidValidationPipe())` (tanpa ParseUUIDPipe).
Hapus import ParseUUIDPipe yang tidak terpakai lagi di tiap controller.

### Acceptance criteria
- [ ] GET /api/v1/reports/xyz → 400 dengan code VALIDATION_ERROR dan
      details: ["ID parameter harus berupa UUID yang valid."]
- [ ] semua UUID valid tetap lolos (regresi)
- [ ] lint & build hijau (tidak ada import tak terpakai)

================================================================================
## PEKERJAAN 5 [LOW] — Malformed JSON Membocorkan Pesan Parser Internal
================================================================================
### Masalah
Body `{bad json` → message "Expected property name or '}' in JSON at position 1"
— informasi parser internal ter-expose ke client.

### File yang diubah
src/common/filters/http-exception.filter.ts — di dalam resolveException(),
pada cabang HttpException (status 400), tambahkan deteksi body-parser:
jika exceptionResponse adalah string ATAU message berisi pola parser
(/JSON|Unexpected token|Unexpected end|Expected propert/i), kembalikan:
```ts
{
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
}
```
(tempatkan branch ini SEBELUM mapping generik BadRequestException agar tidak
ketimpa. Jangan mengubah format error lain.)

### Acceptance criteria
- [ ] POST /api/v1/auth/login dengan body `{bad json` → 400, code INVALID_JSON,
      message generik (tidak memuat teks parser)
- [ ] error VALIDATION_ERROR lain tidak berubah

================================================================================
## PEKERJAAN 6 [INFO] — Header Retry-After pada Response 429
================================================================================
### Masalah
Rate limit aktif (429) tetapi tidak ada header Retry-After, client tidak tahu
kapan boleh mencoba lagi.

### File yang diubah
src/common/filters/http-exception.filter.ts — di method catch(), sebelum
response.status(status).json(errorResponse), tambahkan:
```ts
if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
  response.setHeader('Retry-After', '60');
}
```

### Acceptance criteria
- [ ] burst POST /api/v1/reports hingga 429 → respons punya header Retry-After: 60

================================================================================
## VERIFIKASI AKHIR (WAJIB DIJALANKAN SEMUA)
================================================================================
1. npm run lint            → tanpa error
2. npm run build           → sukses
3. npm run test            → semua suite hijau (termasuk test baru uploadMedia)
4. Uji manual cepat (server dev berjalan di :3000):
   - Register 2 citizen (A & B) + login admin
   - A buat laporan → B coba POST /reports/{id}/media type=completion_photo → HARUS 403
   - A upload progress_photo ke laporannya sendiri → 201
   - GET /api/v1/agencies tanpa token → 200
   - GET /api/v1/reports/xyz → 400 VALIDATION_ERROR (pesan lokal)
   - POST /api/v1/auth/login body rusak → 400 INVALID_JSON (pesan generik)
   - GET /api/v1/docs-json → operasi protected punya security bearer

Setelah semua hijau, ringkas perubahan per file (path + apa yang diubah + hasil
verifikasi) dalam satu laporan singkat. JANGAN commit, JANGAN push, JANGAN ubah
versi dependency, JANGAN sentuh schema.prisma (tidak perlu migrasi).
