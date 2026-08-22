import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * F4-1: Pipe validasi file upload sesuai Rules.md §2.1 & Architecture.md §7
 *
 * Validasi:
 * 1. MIME type dari MAGIC BYTES (bukan header browser yang bisa di-spoof)
 *    - JPEG: FF D8 FF
 *    - PNG:  89 50 4E 47
 *    - Tolak: webp, gif, svg, dll
 * 2. Ukuran maksimal 8MB
 * 3. Resolusi minimal 480p (width atau height >= 480px)
 */

export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB sesuai Rules.md §2.1
export const MIN_DIMENSION_PX = 480; // 480p minimum

// Magic bytes untuk deteksi tipe file yang sebenarnya
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
};

export function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;
  for (const [mime, magic] of Object.entries(MAGIC_BYTES)) {
    const matches = magic.every((byte, i) => buffer[i] === byte);
    if (matches) return mime;
  }
  return null;
}

export interface FileValidationOptions {
  optional?: boolean;
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly options: FileValidationOptions = {}) {}

  async transform(file: Express.Multer.File | undefined): Promise<Express.Multer.File | undefined> {
    if (!file) {
      if (this.options.optional) {
        return undefined;
      }
      throw new BadRequestException('File foto wajib diunggah (field: photo).');
    }

    // 1. Cek ukuran SEBELUM decode image
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Ukuran file (${(file.size / 1024 / 1024).toFixed(2)} MB) melebihi batas maksimum 8MB (Rules.md §2.1).`,
      );
    }

    // 2. Deteksi MIME dari magic bytes
    const detectedMime = detectMimeFromBuffer(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException(
        'Tipe file tidak diizinkan. Hanya JPEG dan PNG yang diterima (Rules.md §2.1). ' +
          'Periksa bahwa file bukan WebP, GIF, atau file berekstensi berbeda dari isinya.',
      );
    }

    // 3. Cek resolusi minimum 480p menggunakan sharp
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('File gambar tidak dapat dibaca atau corrupt.');
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width < MIN_DIMENSION_PX && height < MIN_DIMENSION_PX) {
      throw new BadRequestException(
        `Resolusi gambar (${width}×${height}px) terlalu kecil. Minimal salah satu dimensi harus >= 480px (Rules.md §2.1).`,
      );
    }

    // Timpa mimetype dengan hasil deteksi magic bytes yang akurat
    return { ...file, mimetype: detectedMime };
  }
}
