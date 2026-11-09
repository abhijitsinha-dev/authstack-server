import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRefreshToken, hashToken } from '../../src/utils/jwt.js';

// Mock the environment variables
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

describe('JWT Utilities', () => {
  describe('hashToken', () => {
    it('should generate a consistent SHA-256 hash', () => {
      const hash1 = hashToken('my-token');
      const hash2 = hashToken('my-token');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid Access Token', () => {
      const token = generateAccessToken('user123', 'session456');
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      expect(decoded.sub).toBe('user123');
      expect(decoded.sid).toBe('session456');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid Refresh Token', () => {
      const token = generateRefreshToken('user123', 'session456');
      const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      expect(decoded.sub).toBe('user123');
      expect(decoded.sid).toBe('session456');
    });
  });
});
