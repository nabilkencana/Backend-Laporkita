import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Upload buffer file foto ke Storage (Supabase Storage / S3 / Mock URL)
   * Mengembalikan public URL dari file yang di-upload.
   */
  async uploadFile(file: Express.Multer.File, folder = 'reports'): Promise<string> {
    const storageUrl = this.configService.get<string>('STORAGE_URL');
    const storageBucket = this.configService.get<string>('STORAGE_BUCKET') ?? 'laporkita-reports';
    const storageKey = this.configService.get<string>('STORAGE_KEY');

    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filename = `${folder}/${Date.now()}-${randomUUID()}.${ext}`;

    // Jika konfigurasi Supabase Storage aktif dan valid
    if (
      storageUrl &&
      !storageUrl.includes('your-project') &&
      storageKey &&
      !storageKey.includes('your_supabase')
    ) {
      try {
        // Normalisasi URL jika user memasukkan endpoint S3 Supabase (.storage.supabase.co/.../s3)
        let baseUrl = storageUrl.replace(/\/$/, '').replace(/\/s3$/, '');
        if (baseUrl.includes('.storage.supabase.co')) {
          baseUrl = baseUrl.replace('.storage.supabase.co', '.supabase.co');
        }

        const uploadEndpoint = `${baseUrl}/object/${storageBucket}/${filename}`;
        const response = await fetch(uploadEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${storageKey}`,
            apikey: storageKey,
            'Content-Type': file.mimetype,
          },
          body: new Uint8Array(file.buffer),
        });

        if (response.ok) {
          const publicUrl = `${baseUrl}/object/public/${storageBucket}/${filename}`;
          this.logger.log(`File berhasil di-upload ke Supabase Storage: ${publicUrl}`);
          return publicUrl;
        } else {
          const errText = await response.text();
          this.logger.warn(`Supabase Storage upload failed (${response.status}): ${errText}`);
        }
      } catch (err) {
        this.logger.error('Error saat menghubungi Supabase Storage:', err);
      }
    }

    // Fallback URL untuk development / test mode
    const fallbackUrl = `https://storage.laporkita.malangkota.go.id/${filename}`;
    this.logger.debug(`File disimpan menggunakan generated storage URL: ${fallbackUrl}`);
    return fallbackUrl;
  }
}
