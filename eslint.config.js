import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import security from 'eslint-plugin-security'; // 👈 Added
import sonarjs from 'eslint-plugin-sonarjs'; // 👈 Added

export default defineConfig([
  globalIgnores(['node_modules/**', '.vercel/**', 'dist/**', 'coverage/**']),

  // Base rules for all JS files
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  // 👇 Added: Security and SonarJS recommended rules
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...security.configs.recommended,
    ...sonarjs.configs.recommended,
  },

  // Test files specific rules
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },

  // Must be LAST — disables ESLint formatting rules that fight Prettier
  eslintConfigPrettier,
]);
