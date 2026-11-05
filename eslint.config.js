import js from "@eslint/js";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // 1. Ignore build/tooling directories
  globalIgnores(["node_modules/**", ".vercel/**", "dist/**", "coverage/**"]),

  // 2. Base rules for all JS files in the server package
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      // Force use of winston logger — no raw console output anywhere
      "no-console": "error",

      // A few sensible extras (optional — remove if you don't want them)
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
    },
  },

  // 3. Must be LAST — disables ESLint formatting rules that fight Prettier
  eslintConfigPrettier,
]);
