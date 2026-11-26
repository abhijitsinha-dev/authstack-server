import {
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
  loginSchema,
  changePasswordSchema, // 👈 NEW
  requestEmailChangeSchema, // 👈 NEW
  verifyEmailChangeSchema, // 👈 NEW
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
      email: 'john@example.com',
      password: 'Password123!',
    };

    it('should accept a valid payload without a name', () => {
      const { error, value } = validate(requestOtpSchema, validPayload);
      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
    });

    it('should discard name because it is not part of signup input', () => {
      const { error, value } = validate(requestOtpSchema, { ...validPayload, name: 'John Doe' });
      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
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

    // Login uses loginPasswordField (NOT strongPasswordField) so the service
    // layer's fast-fail path is reachable. If validation rejected weak
    // passwords here, an attacker could distinguish "weak password" (400)
    // from "wrong password" (401) — breaking anti-enumeration.
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

  // ─────────────────────────────────────────────
  // NEW: changePasswordSchema
  // ─────────────────────────────────────────────
  describe('changePasswordSchema', () => {
    const validPayload = {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
      confirmPassword: 'NewPassword456!',
    };

    it('should accept a fully valid payload', () => {
      const { error } = validate(changePasswordSchema, validPayload);
      expect(error).toBeUndefined();
    });

    it('should reject a missing currentPassword', () => {
      const { error } = validate(changePasswordSchema, {
        ...validPayload,
        currentPassword: undefined,
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('currentPassword');
      expect(error.details[0].message).toBe('Current password is required.');
    });

    it('should reject an empty currentPassword', () => {
      const { error } = validate(changePasswordSchema, { ...validPayload, currentPassword: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('currentPassword');
      expect(error.details[0].message).toBe('Current password is required.');
    });

    // currentPassword uses plain Joi.string().required() — NOT strongPasswordField.
    // A weak current password must still reach bcrypt.compare; rejecting it here
    // would short-circuit the "is this the actual password" check.
    it('should NOT enforce strong rules on currentPassword (weak must reach the service)', () => {
      const { error } = validate(changePasswordSchema, {
        ...validPayload,
        currentPassword: 'weak',
      });
      expect(error).toBeUndefined();
    });

    it('should reject a weak newPassword', () => {
      const { error } = validate(changePasswordSchema, {
        ...validPayload,
        newPassword: 'weak',
        confirmPassword: 'weak',
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('newPassword');
      expect(error.details[0].message).toContain('8');
    });

    it('should reject a mismatched confirmPassword', () => {
      const { error } = validate(changePasswordSchema, {
        ...validPayload,
        newPassword: 'NewPassword456!',
        confirmPassword: 'DifferentPassword789!',
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('confirmPassword');
      expect(error.details[0].message).toBe('Passwords do not match.');
    });

    it('should reject a missing confirmPassword', () => {
      const { error } = validate(changePasswordSchema, {
        ...validPayload,
        confirmPassword: undefined,
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('confirmPassword');
      expect(error.details[0].message).toBe('Please confirm your new password.');
    });

    it('should reject an empty confirmPassword', () => {
      const { error } = validate(changePasswordSchema, {
        ...validPayload,
        confirmPassword: '',
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('confirmPassword');
      expect(error.details[0].message).toBe('Please confirm your new password.');
    });

    it('should strip unknown fields when stripUnknown is enabled', () => {
      const { error, value } = validate(changePasswordSchema, {
        ...validPayload,
        isAdmin: true,
      });
      expect(error).toBeUndefined();
      expect(value.isAdmin).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // NEW: requestEmailChangeSchema
  // ─────────────────────────────────────────────
  describe('requestEmailChangeSchema', () => {
    const validPayload = {
      newEmail: 'new@example.com',
      currentPassword: 'OldPassword123!',
    };

    it('should accept a fully valid payload', () => {
      const { error, value } = validate(requestEmailChangeSchema, validPayload);
      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
    });

    it('should reject a missing newEmail', () => {
      const { error } = validate(requestEmailChangeSchema, {
        ...validPayload,
        newEmail: undefined,
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('newEmail');
      expect(error.details[0].message).toBe('Email is required.');
    });

    it('should reject an empty newEmail', () => {
      const { error } = validate(requestEmailChangeSchema, { ...validPayload, newEmail: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('newEmail');
      expect(error.details[0].message).toBe('Email is required.');
    });

    it('should reject an invalid newEmail format', () => {
      const { error } = validate(requestEmailChangeSchema, {
        ...validPayload,
        newEmail: 'not-an-email',
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('newEmail');
      expect(error.details[0].message).toBe('Please provide a valid email address.');
    });

    it('should lowercase newEmail automatically', () => {
      const { error, value } = validate(requestEmailChangeSchema, {
        ...validPayload,
        newEmail: 'NEW@EXAMPLE.COM',
      });
      expect(error).toBeUndefined();
      expect(value.newEmail).toBe('new@example.com');
    });

    it('should reject a missing currentPassword', () => {
      const { error } = validate(requestEmailChangeSchema, {
        ...validPayload,
        currentPassword: undefined,
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('currentPassword');
      expect(error.details[0].message).toBe('Current password is required.');
    });

    it('should reject an empty currentPassword', () => {
      const { error } = validate(requestEmailChangeSchema, {
        ...validPayload,
        currentPassword: '',
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('currentPassword');
      expect(error.details[0].message).toBe('Current password is required.');
    });

    // Like changePassword, currentPassword here uses plain Joi.string().required()
    // so the weak-password path reaches bcrypt.compare in the service layer.
    it('should NOT enforce strong rules on currentPassword', () => {
      const { error } = validate(requestEmailChangeSchema, {
        ...validPayload,
        currentPassword: 'weak',
      });
      expect(error).toBeUndefined();
    });

    it('should strip unknown fields when stripUnknown is enabled', () => {
      const { error, value } = validate(requestEmailChangeSchema, {
        ...validPayload,
        otp: '123456',
        isAdmin: true,
      });
      expect(error).toBeUndefined();
      expect(value.otp).toBeUndefined();
      expect(value.isAdmin).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // NEW: verifyEmailChangeSchema
  // ─────────────────────────────────────────────
  describe('verifyEmailChangeSchema', () => {
    const validPayload = {
      newEmail: 'new@example.com',
      otp: '123456',
    };

    it('should accept a fully valid payload', () => {
      const { error, value } = validate(verifyEmailChangeSchema, validPayload);
      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
    });

    it('should reject a missing newEmail', () => {
      const { error } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        newEmail: undefined,
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('newEmail');
    });

    it('should reject an invalid newEmail format', () => {
      const { error } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        newEmail: 'not-an-email',
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('newEmail');
      expect(error.details[0].message).toBe('Please provide a valid email address.');
    });

    it('should lowercase newEmail automatically', () => {
      const { error, value } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        newEmail: 'NEW@EXAMPLE.COM',
      });
      expect(error).toBeUndefined();
      expect(value.newEmail).toBe('new@example.com');
    });

    it('should reject a missing OTP', () => {
      const { error } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        otp: undefined,
      });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('otp');
      expect(error.details[0].message).toBe('OTP is required.');
    });

    it('should reject an empty OTP', () => {
      const { error } = validate(verifyEmailChangeSchema, { ...validPayload, otp: '' });
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('otp');
      expect(error.details[0].message).toBe('OTP is required.');
    });

    it('should reject an OTP that is not exactly 6 digits', () => {
      const { error: errorShort } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        otp: '123',
      });
      expect(errorShort).toBeDefined();
      expect(errorShort.details[0].message).toContain('6 digits');

      const { error: errorLong } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        otp: '1234567',
      });
      expect(errorLong).toBeDefined();
      expect(errorLong.details[0].message).toContain('6 digits');
    });

    it('should reject a non-numeric OTP', () => {
      const { error } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        otp: '12345a',
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('numbers');
    });

    it('should strip unknown fields when stripUnknown is enabled', () => {
      const { error, value } = validate(verifyEmailChangeSchema, {
        ...validPayload,
        currentPassword: 'OldPassword123!',
        isAdmin: true,
      });
      expect(error).toBeUndefined();
      expect(value.currentPassword).toBeUndefined();
      expect(value.isAdmin).toBeUndefined();
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

    it('should reject a new password longer than 72 characters', () => {
      const longPassword = 'A1!' + 'a'.repeat(70);
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
