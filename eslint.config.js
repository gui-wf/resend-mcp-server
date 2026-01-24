import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // TypeScript-specific rules
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",

      // Critical project rules (from CLAUDE.md)
      // NOTE: stdout is reserved for MCP protocol, only console.error allowed
      "no-console": ["error", { allow: ["error"] }],

      // General best practices
      "no-unused-vars": "off", // Handled by @typescript-eslint
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.js", "*.cjs", "*.mjs"],
  },
);
