import { Injectable, Logger } from '@nestjs/common';
import { OTPSmsService } from './otp-sms.interface.js';

/**
 * MockSmsService — implementasi SMS untuk development & demo.
 * Tidak melakukan HTTP request asli atau memakan biaya telco.
 * Kode OTP di-log secara transparan ke server console.
 */
@Injectable()
export class MockSmsService implements OTPSmsService {
  private readonly logger = new Logger('MockSmsService');

  send(phoneNumber: string, code: string): Promise<void> {
    this.logger.log(`[MOCK SMS] to ${phoneNumber}: your OTP is ${code}`);
    return Promise.resolve();
  }
}
