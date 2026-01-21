/**
 * Structured error definitions for the documentation search tool.
 * Provides consistent error codes, messages, hints, and recoverability flags.
 */

/**
 * Error codes for documentation search failures.
 */
export enum DocsErrorCode {
  /** Embeddings file not found at expected path */
  EMBEDDINGS_NOT_FOUND = "EMBEDDINGS_NOT_FOUND",
  /** Embeddings file exists but is corrupted or malformed */
  EMBEDDINGS_CORRUPT = "EMBEDDINGS_CORRUPT",
  /** Embeddings file version does not match expected schema version */
  EMBEDDINGS_VERSION_MISMATCH = "EMBEDDINGS_VERSION_MISMATCH",
  /** Failed to load the embedding model */
  MODEL_LOAD_FAILURE = "MODEL_LOAD_FAILURE",
  /** Network request timed out */
  NETWORK_TIMEOUT = "NETWORK_TIMEOUT",
  /** Vector dimensions do not match between query and stored embeddings */
  DIMENSION_MISMATCH = "DIMENSION_MISMATCH",
  /** General search failure */
  SEARCH_FAILED = "SEARCH_FAILED",
  /** Embeddings are stale and should be regenerated */
  EMBEDDINGS_STALE = "EMBEDDINGS_STALE",
}

/**
 * Structured error with code, message, hint, and recoverability.
 */
export interface DocsError {
  /** Machine-readable error code */
  code: DocsErrorCode;
  /** Human-readable error message */
  message: string;
  /** Actionable hint for resolving the error */
  hint: string;
  /** Whether the error is potentially recoverable with retry */
  recoverable: boolean;
}

/**
 * Error definitions with their hints and recoverability.
 */
const ERROR_DEFINITIONS: Record<DocsErrorCode, Omit<DocsError, "code" | "message">> = {
  [DocsErrorCode.EMBEDDINGS_NOT_FOUND]: {
    hint: "Run 'npm run build:embeddings' to generate the embeddings index.",
    recoverable: false,
  },
  [DocsErrorCode.EMBEDDINGS_CORRUPT]: {
    hint: "Run 'npm run build:embeddings:force' to regenerate the embeddings index.",
    recoverable: false,
  },
  [DocsErrorCode.EMBEDDINGS_VERSION_MISMATCH]: {
    hint: "Run 'npm run build:embeddings:force' to regenerate with the current schema version.",
    recoverable: false,
  },
  [DocsErrorCode.MODEL_LOAD_FAILURE]: {
    hint: "Check network connectivity. The model is downloaded on first use. Retry may help.",
    recoverable: true,
  },
  [DocsErrorCode.NETWORK_TIMEOUT]: {
    hint: "Network request timed out. Check your connection and retry.",
    recoverable: true,
  },
  [DocsErrorCode.DIMENSION_MISMATCH]: {
    hint: "Embeddings were generated with a different model. Run 'npm run build:embeddings:force' to regenerate.",
    recoverable: false,
  },
  [DocsErrorCode.SEARCH_FAILED]: {
    hint: "Check server logs for details. If the issue persists, try regenerating embeddings.",
    recoverable: true,
  },
  [DocsErrorCode.EMBEDDINGS_STALE]: {
    hint: "Embeddings are outdated. Run 'npm run build:embeddings' to update.",
    recoverable: false,
  },
};

/**
 * Create a structured DocsError from an error code and message.
 *
 * @param code - The error code
 * @param message - Custom error message describing the specific failure
 * @returns A structured DocsError object
 */
export function createDocsError(code: DocsErrorCode, message: string): DocsError {
  const definition = ERROR_DEFINITIONS[code];
  return {
    code,
    message,
    hint: definition.hint,
    recoverable: definition.recoverable,
  };
}

/**
 * Type guard to check if an error is a DocsError.
 *
 * @param error - The error to check
 * @returns True if the error is a DocsError
 */
export function isDocsError(error: unknown): error is DocsError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "hint" in error &&
    "recoverable" in error &&
    Object.values(DocsErrorCode).includes((error as DocsError).code)
  );
}

/**
 * Convert an unknown error to a DocsError.
 * Attempts to classify the error based on its message.
 *
 * @param error - The error to convert
 * @returns A structured DocsError
 */
export function toDocsError(error: unknown): DocsError {
  // Already a DocsError
  if (isDocsError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  // Classify based on message content
  if (message.includes("ENOENT") || message.includes("not found")) {
    return createDocsError(DocsErrorCode.EMBEDDINGS_NOT_FOUND, message);
  }

  if (message.includes("Invalid embeddings format") || message.includes("JSON")) {
    return createDocsError(DocsErrorCode.EMBEDDINGS_CORRUPT, message);
  }

  if (message.includes("version") || message.includes("schema")) {
    return createDocsError(DocsErrorCode.EMBEDDINGS_VERSION_MISMATCH, message);
  }

  if (message.includes("dimension") || message.includes("Vector dimension mismatch")) {
    return createDocsError(DocsErrorCode.DIMENSION_MISMATCH, message);
  }

  if (message.includes("model") || message.includes("pipeline") || message.includes("transformers")) {
    return createDocsError(DocsErrorCode.MODEL_LOAD_FAILURE, message);
  }

  if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
    return createDocsError(DocsErrorCode.NETWORK_TIMEOUT, message);
  }

  // Default to generic search failure
  return createDocsError(DocsErrorCode.SEARCH_FAILED, message);
}

/**
 * Format a DocsError for MCP response output.
 *
 * @param error - The DocsError to format
 * @returns Formatted error object suitable for JSON serialization
 */
export function formatErrorResponse(error: DocsError): {
  error: true;
  code: string;
  message: string;
  hint: string;
  recoverable: boolean;
} {
  return {
    error: true,
    code: error.code,
    message: error.message,
    hint: error.hint,
    recoverable: error.recoverable,
  };
}
