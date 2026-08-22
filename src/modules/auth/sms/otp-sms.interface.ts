export interface OTPSmsService {
  /**
   * Mengirim kode OTP 4-digit ke nomor telepon tujuan.
   * @param phoneNumber Nomor telepon tujuan (format E.164 atau lokal, misal +628xxx)
   * @param code Kode OTP 4-digit
   */
  send(phoneNumber: string, code: string): Promise<void>;
}

export const OTP_SMS_SERVICE = 'OTP_SMS_SERVICE';
