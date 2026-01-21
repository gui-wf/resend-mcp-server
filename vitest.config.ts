import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files location
    include: ["tests/**/*.test.ts"],

    // 60s timeout for model loading (which can be slow)
    testTimeout: 60000,

    // Global test setup
    setupFiles: ["tests/setup.ts"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/dist/**", "**/node_modules/**"],
      reporter: ["text", "json", "html"],
    },

    // Run tests in sequence by default (parallel can cause issues with model loading)
    sequence: {
      concurrent: false,
    },
  },
});
