import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTPSmsService } from './otp-sms.interface.js';

/**
 * HttpSmsService — implementasi SMS Production menggunakan HTTP Client.
 * Mendukung provider: fonnte (WhatsApp/SMS), zenziva, atau generic gateway.
 *
 * ─── Fonnte Setup ────────────────────────────────────────────────────────────
 * 1. Daftar & login: https://app.fonnte.com
 * 2. Hubungkan device WhatsApp di menu "Devices" → Scan QR
 * 3. Salin Token dari detail device
 * 4. Set di .env:
 *      SMS_PROVIDER=fonnte
 *      SMS_PROVIDER_API_KEY=<token dari dashboard Fonnte>
 *      SMS_PROVIDER_BASE_URL=https://api.fonnte.com/send  (opsional, sudah default)
 *      FONNTE_TYPE=whatsapp   (atau: sms)
 *      FONNTE_COUNTRY_CODE=62 (kode negara Indonesia, tanpa +)
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class HttpSmsService implements OTPSmsService {
  private readonly logger = new Logger(HttpSmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(phoneNumber: string, code: string): Promise<void> {
    const provider = (this.configService.get<string>('SMS_PROVIDER') ?? 'fonnte').toLowerCase();
    const apiKey = this.configService.get<string>('SMS_PROVIDER_API_KEY') ?? '';
    const baseUrl = this.configService.get<string>('SMS_PROVIDER_BASE_URL') ?? '';

    this.logger.log(`Mengirim OTP via [${provider.toUpperCase()}] ke: ${phoneNumber}`);

    const message = `[LaporKita] Kode verifikasi Anda: ${code}\n\nJangan bagikan kode ini kepada siapa pun. Berlaku 5 menit.`;

    try {
      if (provider === 'fonnte') {
        await this.sendViaFonnte(apiKey, baseUrl, phoneNumber, message);
      } else if (provider === 'zenziva') {
        await this.sendViaZenziva(apiKey, baseUrl, phoneNumber, message);
      } else {
        await this.sendViaGenericGateway(apiKey, baseUrl, phoneNumber, code, message);
      }
    } catch (error) {
      this.logger.error(
        `Exception saat memanggil SMS Gateway [${provider}]: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      // Kegagalan SMS tidak membatalkan transaksi register (user sudah terbuat).
      // Error di-log untuk investigasi; retry bisa via resend-otp endpoint.
    }
  }

  // ── Fonnte (WhatsApp API / SMS) ───────────────────────────────────────────
  // Docs: https://fonnte.com/docs
  private async sendViaFonnte(
    token: string,
    baseUrl: string,
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    const url = baseUrl || 'https://api.fonnte.com/send';

    // Normalisasi nomor: Fonnte menerima format 08xxx atau 628xxx
    // Jika nomor diawali +62, hapus + supaya jadi 628xxx (Fonnte format)
    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;

    // typeMessage: 'whatsapp' (default) atau 'sms'
    const typeMessage = this.configService.get<string>('FONNTE_TYPE') ?? 'whatsapp';
    // countryCode: default 62 (Indonesia)
    const countryCode = this.configService.get<string>('FONNTE_COUNTRY_CODE') ?? '62';

    const payload = {
      target: normalizedPhone,
      message,
      countryCode,
      ...(typeMessage === 'sms' ? { typeMessage: 'sms' } : {}),
    };

    this.logger.debug(`Fonnte payload: target=${normalizedPhone}, type=${typeMessage}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: token, // Fonnte: token langsung di Authorization, tanpa "Bearer"
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      this.logger.error(`Fonnte HTTP ${response.status}: ${responseText}`);
      return;
    }

    // Fonnte response sukses: {"status":true,"detail":"...","process":"...","id":...}
    try {
      const json = JSON.parse(responseText) as Record<string, unknown>;
      if (json.status === true) {
        // Log full response untuk debug (bisa dihapus setelah production stabil)
        this.logger.debug(`Fonnte full response: ${responseText}`);
        const msgId: string | number | null =
          typeof json.id === 'string' || typeof json.id === 'number'
            ? json.id
            : typeof json.process === 'string' || typeof json.process === 'number'
              ? json.process
              : null;
        this.logger.log(
          `Fonnte OTP terkirim ✓ ke ${normalizedPhone}. Ref: ${msgId ?? responseText}`,
        );
      } else {
        this.logger.warn(`Fonnte mengembalikan status false: ${responseText}`);
      }
    } catch {
      this.logger.warn(`Fonnte response tidak dapat di-parse sebagai JSON: ${responseText}`);
    }
  }

  // ── Zenziva SMS ───────────────────────────────────────────────────────────
  // Docs: https://www.zenziva.id/apidoc
  private async sendViaZenziva(
    apiKey: string,
    baseUrl: string,
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    const url = baseUrl || 'https://console.zenziva.net/reguler/api/sendsms/';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userkey: this.configService.get<string>('ZENZIVA_USER_KEY') ?? apiKey,
        passkey: this.configService.get<string>('ZENZIVA_PASS_KEY') ?? apiKey,
        to: phoneNumber,
        message,
      }),
    });

    if (!response.ok) {
      this.logger.error(`Zenziva HTTP ${response.status}: ${await response.text()}`);
    } else {
      this.logger.log(`Zenziva OTP terkirim ke ${phoneNumber}`);
    }
  }

  // ── Generic HTTP SMS Gateway ──────────────────────────────────────────────
  private async sendViaGenericGateway(
    apiKey: string,
    baseUrl: string,
    phoneNumber: string,
    code: string,
    message: string,
  ): Promise<void> {
    if (!baseUrl) {
      this.logger.error(
        'SMS_PROVIDER_BASE_URL wajib diisi untuk provider generic. OTP tidak terkirim.',
      );
      return;
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone_number: phoneNumber, otp_code: code, message }),
    });

    if (!response.ok) {
      this.logger.error(`Generic Gateway HTTP ${response.status}: ${await response.text()}`);
    }
  }
}
