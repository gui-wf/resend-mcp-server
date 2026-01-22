/**
 * Rate Limiter for Resend API
 *
 * Provides rate limiting with queue-based processing and exponential backoff retry
 * to ensure compliance with Resend API rate limits.
 *
 * @module services/rate-limiter
 */

// NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[rate-limiter] ${message}`);

/**
 * Default minimum interval between API calls in milliseconds.
 * Resend free tier allows 2 requests/second, so 500ms provides safety margin.
 */
export const RATE_LIMIT_INTERVAL_MS = 500;

/**
 * Default maximum number of retries for rate-limited requests.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Base delay for exponential backoff in milliseconds.
 */
const BASE_BACKOFF_MS = 1000;

/**
 * Maximum delay for exponential backoff in milliseconds.
 */
const MAX_BACKOFF_MS = 32000;

/**
 * Item in the rate limit queue.
 */
interface QueueItem<T> {
  /** The function to execute */
  fn: () => Promise<T>;
  /** Resolve function for the promise */
  resolve: (value: T) => void;
  /** Reject function for the promise */
  reject: (error: Error) => void;
}

/**
 * Module-level state for the rate limiter.
 */
let lastCallTime = 0;
let rateLimitIntervalMs = RATE_LIMIT_INTERVAL_MS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queue: QueueItem<any>[] = [];
let isProcessing = false;
let debugMode = false;

/**
 * Configure the rate limiter settings.
 *
 * @param options - Configuration options
 */
export function configureRateLimiter(options: {
  intervalMs?: number;
  debug?: boolean;
}): void {
  if (options.intervalMs !== undefined) {
    rateLimitIntervalMs = Math.max(0, options.intervalMs);
    log(`Rate limit interval set to ${rateLimitIntervalMs}ms`);
  }
  if (options.debug !== undefined) {
    debugMode = options.debug;
  }
}

/**
 * Get the current rate limiter configuration.
 *
 * @returns Current configuration
 */
export function getRateLimiterConfig(): {
  intervalMs: number;
  queueLength: number;
  isProcessing: boolean;
} {
  return {
    intervalMs: rateLimitIntervalMs,
    queueLength: queue.length,
    isProcessing,
  };
}

/**
 * Sleep for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process the next item in the queue.
 * Ensures sequential execution with minimum interval between calls.
 */
async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;

  while (queue.length > 0) {
    const item = queue.shift()!;

    // Calculate time to wait before next call
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    const waitTime = Math.max(0, rateLimitIntervalMs - timeSinceLastCall);

    if (waitTime > 0) {
      if (debugMode) {
        log(`Waiting ${waitTime}ms before next API call`);
      }
      await sleep(waitTime);
    }

    // Execute the function
    try {
      lastCallTime = Date.now();
      const result = await item.fn();
      item.resolve(result);
    } catch (error) {
      item.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  isProcessing = false;
}

/**
 * Execute a function with rate limiting.
 * Queues the function and processes it when the rate limit allows.
 *
 * @param fn - Async function to execute
 * @returns Promise resolving to the function result
 *
 * @example
 * ```typescript
 * const result = await withRateLimit(() => resendClient.emails.send(params));
 * ```
 */
export function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });

    // Start processing if not already running
    // NOTE: Using void to explicitly ignore the promise (fire and forget)
    void processQueue();
  });
}

/**
 * Check if an error is a rate limit error (HTTP 429).
 *
 * @param error - Error to check
 * @returns True if the error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    // Check error message for 429 status
    if (error.message.includes("429") || error.message.includes("rate limit")) {
      return true;
    }
    // Check if error has a status property
    const errorWithStatus = error as Error & { status?: number; statusCode?: number };
    return errorWithStatus.status === 429 || errorWithStatus.statusCode === 429;
  }
  return false;
}

/**
 * Extract Retry-After value from error response.
 * Supports both seconds (integer) and HTTP-date formats.
 *
 * @param error - Error that may contain Retry-After header
 * @returns Delay in milliseconds, or undefined if not present
 */
function extractRetryAfter(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const errorObj = error as Record<string, unknown>;

  // Check for headers object (common in HTTP client errors)
  const headers = errorObj.headers as Record<string, string> | undefined;
  const retryAfterValue =
    headers?.["retry-after"] ||
    headers?.["Retry-After"] ||
    (errorObj.retryAfter as string | number | undefined);

  if (retryAfterValue === undefined) {
    return undefined;
  }

  // If it's a number, treat as seconds
  if (typeof retryAfterValue === "number") {
    return retryAfterValue * 1000;
  }

  // Try to parse as integer (seconds)
  const seconds = parseInt(retryAfterValue, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try to parse as HTTP-date
  const date = new Date(retryAfterValue);
  if (!isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : undefined;
  }

  return undefined;
}

/**
 * Calculate exponential backoff delay.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
function calculateBackoff(attempt: number): number {
  // Exponential backoff: base * 2^attempt with jitter
  const exponentialDelay = BASE_BACKOFF_MS * Math.pow(2, attempt);
  // Add random jitter (0-25% of delay)
  const jitter = Math.random() * 0.25 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, MAX_BACKOFF_MS);
}

/**
 * Execute a function with automatic retry on rate limit errors.
 * Uses exponential backoff with jitter.
 *
 * @param fn - Async function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise resolving to the function result
 * @throws Error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => resendClient.emails.send(params),
 *   3
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on rate limit errors
      if (!isRateLimitError(error)) {
        throw lastError;
      }

      // Check if we have retries left
      if (attempt < maxRetries) {
        // Prefer Retry-After header if present, otherwise use exponential backoff
        const retryAfterDelay = extractRetryAfter(error);
        const delay = retryAfterDelay ?? calculateBackoff(attempt);
        const delaySource = retryAfterDelay ? "Retry-After header" : "exponential backoff";
        log(
          `Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), ` +
            `retrying in ${Math.round(delay)}ms (${delaySource})`
        );
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `Rate limit exceeded after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`
  );
}

/**
 * Execute a function with both rate limiting and retry logic.
 * This is the recommended function for most Resend API calls.
 *
 * @param fn - Async function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise resolving to the function result
 *
 * @example
 * ```typescript
 * const result = await withRateLimitAndRetry(
 *   () => resendClient.emails.send(params),
 *   3
 * );
 * ```
 */
export async function withRateLimitAndRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<T> {
  return withRateLimit(() => withRetry(fn, maxRetries));
}

/**
 * Reset the rate limiter state.
 * Useful for testing or reconfiguration.
 */
export function resetRateLimiter(): void {
  lastCallTime = 0;
  queue.length = 0;
  isProcessing = false;
  rateLimitIntervalMs = RATE_LIMIT_INTERVAL_MS;
  debugMode = false;
  log("Rate limiter reset");
}
