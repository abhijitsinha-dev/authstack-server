import { jest } from '@jest/globals';
import { notFoundHandler } from '../../src/controllers/notFound.controller.js';

describe('notFound.controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { originalUrl: '/some/random/path' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it('should return a 404 status and a formatted JSON error message', () => {
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Route /some/random/path not found',
    });
  });

  it('should handle requests with query parameters', () => {
    req.originalUrl = '/missing?foo=bar';
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Route /missing?foo=bar not found',
    });
  });
});
