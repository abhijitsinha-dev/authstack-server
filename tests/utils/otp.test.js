import bcrypt from 'bcryptjs';
import { generateHashedOtp } from '../../src/utils/otp.js';

describe('OTP Utilities', () => {
  it('should generate a 6-digit OTP and a valid bcrypt hash', async () => {
    const { otp, hashedOtp } = await generateHashedOtp();

    // 1. Check the OTP format (6 numeric digits)
    expect(otp).toMatch(/^\d{6}$/);

    // 2. Check that the hash is a bcrypt string
    expect(hashedOtp).toMatch(/^\$2[ayb]\$.{56}$/);

    // 3. Verify the plain OTP matches the hash
    const isMatch = await bcrypt.compare(otp, hashedOtp);
    expect(isMatch).toBe(true);
  });
});
