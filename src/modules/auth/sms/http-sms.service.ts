import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTPSmsService } from './otp-sms.interface.js';

/**
 * HttpSmsService — implementasi SMS Production menggunakan HTTP Client.
 * Mendukung provider seperti Zenziva, Fonnte (WhatsApp API), Twilio, atau generic SMS Gateway.
 */
@Injectable()
export class HttpSmsService implements OTPSmsService {
  private readonly logger = new Logger(HttpSmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(phoneNumber: string, code: string): Promise<void> {
    const provider = (this.configService.get<string>('SMS_PROVIDER') ?? 'zenziva').toLowerCase();
    const apiKey = this.configService.get<string>('SMS_PROVIDER_API_KEY') ?? '';
    const baseUrl = this.configService.get<string>('SMS_PROVIDER_BASE_URL') ?? '';

    this.logger.log(`Mengirim OTP via SMS Provider [${provider}] ke nomor: ${phoneNumber}`);

    const message = `[LaporKita] Kode verifikasi Anda adalah: ${code}. Jangan bagikan kode ini kepada siapa pun. Berlaku 5 menit.`;

    try {
      if (provider === 'fonnte') {
        // Fonnte WhatsApp / SMS Gateway API
        const targetUrl = baseUrl || 'https://api.fonnte.com/send';
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            target: phoneNumber,
            message,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Gagal mengirim SMS Fonnte: ${response.status} - ${errorText}`);
        }
      } else if (provider === 'zenziva') {
        // Zenziva SMS OTP API
        const targetUrl = baseUrl || 'https://console.zenziva.net/reguler/api/sendsms/';
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userkey: this.configService.get<string>('ZENZIVA_USER_KEY') ?? apiKey,
            passkey: this.configService.get<string>('ZENZIVA_PASS_KEY') ?? apiKey,
            to: phoneNumber,
            message,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Gagal mengirim SMS Zenziva: ${response.status} - ${errorText}`);
        }
      } else {
        // Generic HTTP SMS Gateway
        if (baseUrl) {
          const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone_number: phoneNumber,
              otp_code: code,
              message,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(`Gagal mengirim SMS Gateway: ${response.status} - ${errorText}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Exception saat memanggil SMS Gateway: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Jangan biarkan kegagalan jaringan telco membunuh transaksi jika tidak fatal, namun log error
    }
  }
}
