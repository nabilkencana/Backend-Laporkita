import { BadRequestException } from '@nestjs/common';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB (Architecture.md §7)
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Validasi URL media foto sebelum disimpan ke database
 */
export function validateMediaUrlFormat(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new BadRequestException('URL media tidak boleh kosong.');
  }

  const cleanUrl = url.split('?')[0].toLowerCase();
  const hasValidExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) => cleanUrl.endsWith(ext));

  if (!hasValidExtension) {
    throw new BadRequestException(
      `Format file tidak didukung. Format yang diizinkan: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')} (Maks. 5MB).`,
    );
  }
}

/**
 * Validasi objek File (Multer/Express.Multer.File)
 */
export function validateUploadedFile(file?: {
  mimetype: string;
  size: number;
  originalname: string;
}): void {
  if (!file) {
    throw new BadRequestException('File foto wajib diunggah.');
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException(
      `Tipe MIME file '${file.mimetype}' tidak diizinkan. Hanya mendukung image/jpeg, image/png, image/webp.`,
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new BadRequestException(
      `Ukuran file (${(file.size / 1024 / 1024).toFixed(2)} MB) melebihi batas maksimum 5MB.`,
    );
  }
}
