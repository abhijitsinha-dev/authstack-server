/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
const config = {
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  // 👇 Exclude bootstrap files and config from coverage.
  // These files are wiring/infrastructure code — best verified by running the app,
  // not by unit tests. Testable logic lives in services/, utils/, middlewares/.
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/tests/',
    '/src/server.js', // Local dev entrypoint (bootstrap)
    '/api/index.js', // Vercel serverless entrypoint
    '/worker/index.js', // BullMQ worker bootstrap
    '/src/config/', // Logger, DB, Rate Limiter, Swagger config
    '/src/routes/', // Routes are exercised via supertest integration tests
  ],

  // The test environment that will be used for testing (Backend = node)
  testEnvironment: 'node',

  // 🚨 CRITICAL FOR ESM: Stop Jest from transpiling ESM to CJS
  transform: {},

  // The glob patterns Jest uses to detect test files
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

export default config;
