import { requestOtpSchema, resendOtpSchema } from '../../src/validators/auth.validator.js';

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
      password: 'Password123',
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
    });

    it('should reject a name shorter than 2 characters', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, name: 'J' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('2');
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

    it('should reject a password shorter than 8 characters', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, password: 'Pass12' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('8');
    });

    it('should reject a password without a number', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, password: 'PasswordOnly' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('letter and one number');
    });

    it('should reject a password without a letter', () => {
      const { error } = validate(requestOtpSchema, { ...validPayload, password: '12345678' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('letter and one number');
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
      // Proves stripUnknown:true is what protects the endpoint — not the schema
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
    });

    it('should reject an invalid email format', () => {
      const { error } = validate(resendOtpSchema, { email: 'not-an-email' });
      expect(error).toBeDefined();
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
});
