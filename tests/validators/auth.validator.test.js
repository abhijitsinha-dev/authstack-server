import {
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../src/validators/auth.validator.js';

// Helper: replicate the EXACT options your middleware uses
const validate = (schema, payload) =>
  schema.validate(payload, {
    abortEarly: true,
    stripUnknown: true,
    convert: true,
  });

describe('auth.validator', () => {
  describe('requestOtpSchema', () => {
    const validPayload = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password123!',
    };

    it('should accept a fully valid payload', () => {
      const { error, value } = validate(requestOtpSchema, validPayload);
      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
    });

    it('should reject a missing name', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, name: undefined });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('name');
      expect(error.details[0].message).toBe('Name is required.');
    });

    it('should reject an empty name', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, name: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('name');
      expect(error.details[0].message).toBe('Name is required.');
    });

    it('should reject a name shorter than 2 characters', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, name: 'J' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('2');
    });

    // 👇 Proves `.max(50)` actually fires (was previously untested)
    it('should reject a name longer than 50 characters', () => {
      const { error } = validate(requestOtpSchema, {
        ...validPayload,
        name: 'a'.repeat(51),
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('50');
    });

    it('should trim leading/trailing whitespace from the name', () => {
      const { error, value } = validate(requestOtpSchema, {
        ...validPayload,
        name: '  John Doe  ',
      });
      expect(error).toBeUndefined();
      expect(value.name).toBe('John Doe');
    });

    it('should reject an invalid email format', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, email: 'not-an-email' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
    });

    it('should lowercase the email automatically', () => {
      const { error, value } = validate(requestOtpSchema, {
        ...validPayload,
        email: 'JOHN@EXAMPLE.COM',
      });
      expect(error).toBeUndefined();
      expect(value.email).toBe('john@example.com');
    });

    it.each([
      { description: 'shorter than 8 characters', password: 'Pass12!', expectedError: '8' },
      { description: 'without a number', password: 'PasswordOnly!', expectedError: 'one number' },
      {
        description: 'without a lowercase letter',
        password: '12345678!',
        expectedError: 'one lowercase letter',
      },
      {
        description: 'without an uppercase letter',
        password: 'password123!',
        expectedError: 'one uppercase letter',
      },
      {
        description: 'without a symbol',
        password: 'Password123',
        expectedError: 'one symbol',
      },
    ])('should reject a password $description', ({ password, expectedError }) => {
      const { error } = validate(requestOtpSchema, { ...validPayload, password });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain(expectedError);
    });

    it('should strip unknown fields when stripUnknown is enabled', () => {
      const { error, value } = validate(requestOtpSchema, {
        ...validPayload,
        isAdmin: true,
        role: 'admin',
      });
      expect(error).toBeUndefined();
      expect(value.isAdmin).toBeUndefined();
      expect(value.role).toBeUndefined();
    });

    it('should reject unknown fields when stripUnknown is disabled', () => {
      const { error } = requestOtpSchema.validate(
        { ...validPayload, isAdmin: true },
        { abortEarly: true, stripUnknown: false }
      );
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('not allowed');
    });
  });

  describe('resendOtpSchema', () => {
    it('should accept a valid email', () => {
      const { error } = validate(resendOtpSchema, { email: 'john@example.com' });
      expect(error).toBeUndefined();
    });

    it('should reject a missing email', () => {
      const { error } = validate(resendOtpSchema, {});
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
      expect(error.details[0].message).toBe('Email is required.');
    });

    it('should reject an empty email', () => {
      const { error } = validate(resendOtpSchema, { email: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
      expect(error.details[0].message).toBe('Email is required.');
    });

    it('should reject an invalid email format', () => {
      const { error } = validate(resendOtpSchema, { email: 'not-an-email' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toBe('Please provide a valid email address.');
    });

    it('should lowercase the email automatically', () => {
      const { error, value } = validate(resendOtpSchema, { email: 'JOHN@EXAMPLE.COM' });
      expect(error).toBeUndefined();
      expect(value.email).toBe('john@example.com');
    });

    it('should strip unknown fields when stripUnknown is enabled', () => {
      const { error, value } = validate(resendOtpSchema, {
        email: 'john@example.com',
        otp: '123456',
      });
      expect(error).toBeUndefined();
      expect(value.otp).toBeUndefined();
    });
  });

  describe('verifyOtpSchema', () => {
    const validPayload = {
      email: 'john@example.com',
      otp: '123456',
    };

    it('should accept a fully valid payload', () => {
      const { error, value } = validate(verifyOtpSchema, validPayload);
      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
    });

    it('should reject a missing email', () => {
      const { error } = validate(verifyOtpSchema, { ...validPayload, email: undefined });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
    });

    it('should reject an invalid email format', () => {
      const { error } = validate(verifyOtpSchema, { ...validPayload, email: 'not-an-email' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
    });

    it('should reject a missing OTP', () => {
      const { error } = validate(verifyOtpSchema, { ...validPayload, otp: undefined });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('otp');
      expect(error.details[0].message).toBe('OTP is required.');
    });

    it('should reject an empty OTP', () => {
      const { error } = validate(verifyOtpSchema, { ...validPayload, otp: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('otp');
      expect(error.details[0].message).toBe('OTP is required.');
    });

    it('should reject an OTP that is not exactly 6 digits', () => {
      const { error: errorShort } = validate(verifyOtpSchema, { ...validPayload, otp: '123' });
      expect(errorShort).toBeDefined();
      expect(errorShort.details[0].message).toContain('6 digits');

      const { error: errorLong } = validate(verifyOtpSchema, { ...validPayload, otp: '1234567' });
      expect(errorLong).toBeDefined();
      expect(errorLong.details[0].message).toContain('6 digits');
    });

    it('should reject a non-numeric OTP', () => {
      const { error } = validate(verifyOtpSchema, { ...validPayload, otp: '12345a' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('numbers');
    });

    it('should strip unknown fields when stripUnknown is enabled', () => {
      const { error, value } = validate(verifyOtpSchema, {
        ...validPayload,
        isAdmin: true,
      });
      expect(error).toBeUndefined();
      expect(value.isAdmin).toBeUndefined();
    });
  });

  describe('loginSchema', () => {
    const validPayload = { email: 'john@example.com', password: 'Password123!' };

    it('should accept a valid payload', () => {
      const { error } = validate(loginSchema, validPayload);
      expect(error).toBeUndefined();
    });

    // 👇 CRITICAL: login uses loginPasswordField (NOT strongPasswordField).
    // The service layer (loginUser) handles the weak-password rejection as
    // part of its fast-fail path. If validation rejected here instead, an
    // attacker could distinguish "weak password" from "wrong password" by
    // looking at the HTTP status (400 vs 401) — breaking anti-enumeration.
    it('should NOT enforce strong password rules (weak passwords must reach the service)', () => {
      const { error, value } = validate(loginSchema, {
        email: 'john@example.com',
        password: 'weak',
      });
      expect(error).toBeUndefined();
      expect(value.password).toBe('weak');
    });

    it('should reject a missing email', () => {
      const { error } = validate(loginSchema, { ...validPayload, email: undefined });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
    });

    // 👇 Merged the two duplicate "bad email" tests into one.
    // Login deliberately returns a vague message (anti-enumeration) — proving
    // both the path AND the exact string in one place makes the intent obvious.
    it('should return the generic "Invalid email or password." message for bad emails', () => {
      const { error } = validate(loginSchema, { ...validPayload, email: 'not-an-email' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
      expect(error.details[0].message).toBe('Invalid email or password.');
    });

    it('should reject a missing password', () => {
      const { error } = validate(loginSchema, { ...validPayload, password: undefined });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('password');
      expect(error.details[0].message).toBe('Password is required.');
    });

    it('should reject an empty password', () => {
      const { error } = validate(loginSchema, { ...validPayload, password: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('password');
      expect(error.details[0].message).toBe('Password is required.');
    });
  });

  describe('forgotPasswordSchema', () => {
    it('should accept a valid email', () => {
      const { error } = validate(forgotPasswordSchema, { email: 'john@example.com' });
      expect(error).toBeUndefined();
    });

    it('should reject a missing email', () => {
      const { error } = validate(forgotPasswordSchema, {});
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
    });

    it('should reject an invalid email format', () => {
      const { error } = validate(forgotPasswordSchema, { email: 'not-an-email' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
      // Same anti-enumeration-friendly message as the rest of the reset flow
      expect(error.details[0].message).toBe('Please provide a valid email address.');
    });

    it('should lowercase the email automatically', () => {
      const { error, value } = validate(forgotPasswordSchema, { email: 'JOHN@EXAMPLE.COM' });
      expect(error).toBeUndefined();
      expect(value.email).toBe('john@example.com');
    });
  });

  describe('resetPasswordSchema', () => {
    const validPayload = {
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    };

    it('should accept a fully valid payload', () => {
      const { error } = validate(resetPasswordSchema, validPayload);
      expect(error).toBeUndefined();
    });

    it('should reject a missing email', () => {
      const { error } = validate(resetPasswordSchema, { ...validPayload, email: undefined });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
    });

    // 👇 KEY TEST: proves we use emailField, NOT loginEmailField.
    // On password reset, a typo'd email should say "Please provide a valid
    // email address." — not the anti-enumeration "Invalid email or password."
    // message which belongs on the login endpoint only.
    it('should return "Please provide a valid email address." for bad emails (NOT the login message)', () => {
      const { error } = validate(resetPasswordSchema, {
        ...validPayload,
        email: 'not-an-email',
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toBe('Please provide a valid email address.');
    });

    it('should reject a missing OTP', () => {
      const { error } = validate(resetPasswordSchema, { ...validPayload, otp: undefined });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('otp');
    });

    it('should reject an empty OTP', () => {
      const { error } = validate(resetPasswordSchema, { ...validPayload, otp: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('otp');
    });

    it('should reject an OTP that is not exactly 6 digits', () => {
      const { error } = validate(resetPasswordSchema, { ...validPayload, otp: '123' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('6 digits');
    });

    it('should reject a non-numeric OTP', () => {
      const { error } = validate(resetPasswordSchema, { ...validPayload, otp: '12345a' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('numbers');
    });

    it('should reject a weak new password', () => {
      const { error } = validate(resetPasswordSchema, {
        ...validPayload,
        newPassword: 'weak',
        confirmPassword: 'weak',
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('8');
    });

    // 👇 Proves `.max(72)` fires — bcrypt truncates at 72 bytes, so silently
    // allowing longer passwords would create a subtle security gap
    it('should reject a new password longer than 72 characters', () => {
      const longPassword = 'A1!' + 'a'.repeat(70); // 73 chars total
      const { error } = validate(resetPasswordSchema, {
        ...validPayload,
        newPassword: longPassword,
        confirmPassword: longPassword,
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('72');
    });

    it('should reject mismatched confirmPassword', () => {
      const { error } = validate(resetPasswordSchema, {
        ...validPayload,
        newPassword: 'NewPassword123!',
        confirmPassword: 'DifferentPassword456!',
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toBe('Passwords do not match.');
    });

    it('should reject a missing confirmPassword', () => {
      const { error } = validate(resetPasswordSchema, {
        ...validPayload,
        confirmPassword: undefined,
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('confirmPassword');
      expect(error.details[0].message).toBe('Please confirm your password.');
    });

    it('should reject an empty confirmPassword', () => {
      const { error } = validate(resetPasswordSchema, {
        ...validPayload,
        confirmPassword: '',
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('confirmPassword');
      expect(error.details[0].message).toBe('Please confirm your password.');
    });

    it('should strip unknown fields when stripUnknown is enabled', () => {
      const { error, value } = validate(resetPasswordSchema, {
        ...validPayload,
        isAdmin: true,
      });
      expect(error).toBeUndefined();
      expect(value.isAdmin).toBeUndefined();
    });
  });
});
