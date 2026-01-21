/**
 * Global test setup for vitest.
 * Sets up the test environment and optionally suppresses logs.
 */

// Set NODE_ENV to test
process.env.NODE_ENV = "test";

// Optional: Suppress [docs-search] logs during tests
// Uncomment the following to silence logs:
// const originalConsoleError = console.error;
// console.error = (...args: unknown[]) => {
//   const message = args[0];
//   if (typeof message === "string" && message.includes("[docs-search]")) {
//     return; // Suppress docs-search logs
//   }
//   originalConsoleError.apply(console, args);
// };

// Log test environment initialization
console.error("[test-setup] Test environment initialized");
