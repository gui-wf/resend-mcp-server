/**
 * MCP Error Handling Utilities
 *
 * Provides standardized error formatting and response creation for MCP tools.
 * Converts Resend API errors to structured MCP-compliant responses.
 *
 * @module utils/mcp-errors
 */

// NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[mcp-errors] ${message}`);

/**
 * Error codes for MCP responses.
 * Maps to HTTP status codes and Resend API error types.
 */
export type MCPErrorCode =
  | "VALIDATION_ERROR" // 400 - Bad request, invalid parameters
  | "AUTHENTICATION_ERROR" // 401 - Invalid or missing API key
  | "PERMISSION_ERROR" // 403 - Insufficient permissions
  | "NOT_FOUND_ERROR" // 404 - Resource not found
  | "RATE_LIMIT_ERROR" // 429 - Too many requests
  | "INTERNAL_ERROR" // 500 - Server error
  | "SERVICE_UNAVAILABLE" // 503 - Service temporarily unavailable
  | "UNKNOWN_ERROR"; // Unknown error type

/**
 * Structured error response for MCP tools.
 * Provides detailed error information with actionable hints.
 */
export interface MCPErrorResponse {
  /** Error indicator (always true for error responses) */
  error: true;
  /** Machine-readable error code */
  code: MCPErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details (e.g., validation errors) */
  details?: Record<string, unknown>;
  /** Helpful hint for resolving the error */
  hint?: string;
}

/**
 * Successful response wrapper for MCP tools.
 */
export interface MCPSuccessResponse<T> {
  /** Success indicator */
  success: true;
  /** Response data */
  data: T;
}

/**
 * MCP tool response format.
 * Uses index signature to allow additional properties for SDK compatibility.
 */
export interface MCPToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Map HTTP status codes to MCP error codes.
 */
const HTTP_TO_ERROR_CODE: Record<number, MCPErrorCode> = {
  400: "VALIDATION_ERROR",
  401: "AUTHENTICATION_ERROR",
  403: "PERMISSION_ERROR",
  404: "NOT_FOUND_ERROR",
  429: "RATE_LIMIT_ERROR",
  500: "INTERNAL_ERROR",
  502: "SERVICE_UNAVAILABLE",
  503: "SERVICE_UNAVAILABLE",
  504: "SERVICE_UNAVAILABLE",
};

/**
 * Helpful hints for common error scenarios.
 */
const ERROR_HINTS: Record<MCPErrorCode, string> = {
  VALIDATION_ERROR:
    "Check that all required parameters are provided and have valid values. " +
    "Email addresses must be valid, and sender domains must be verified.",
  AUTHENTICATION_ERROR:
    "Your API key may be invalid or expired. " +
    "Get a new key from https://resend.com/api-keys and update RESEND_API_KEY.",
  PERMISSION_ERROR:
    "Your API key may not have permission for this operation. " +
    "Check your key's permissions in the Resend dashboard.",
  NOT_FOUND_ERROR:
    "The requested resource (email, domain, contact, etc.) was not found. " +
    "Verify the ID is correct and the resource exists.",
  RATE_LIMIT_ERROR:
    "Too many requests. The server will automatically retry with backoff. " +
    "If this persists, consider reducing request frequency.",
  INTERNAL_ERROR:
    "The Resend API encountered an internal error. " +
    "Try again later or contact Resend support if the issue persists.",
  SERVICE_UNAVAILABLE:
    "The Resend API is temporarily unavailable. " +
    "Check https://status.resend.com for service status.",
  UNKNOWN_ERROR:
    "An unexpected error occurred. Check the error details and server logs.",
};

/**
 * Extract HTTP status code from an error object.
 *
 * @param error - Error object to extract status from
 * @returns HTTP status code or undefined
 */
function extractStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  // Check common status properties
  const errorObj = error as Record<string, unknown>;
  const possibleProps = ["status", "statusCode", "code", "response"];

  for (const prop of possibleProps) {
    const value = errorObj[prop];
    if (typeof value === "number" && value >= 100 && value < 600) {
      return value;
    }
    // Check nested response object
    if (prop === "response" && typeof value === "object" && value !== null) {
      const responseObj = value as Record<string, unknown>;
      if (typeof responseObj.status === "number") {
        return responseObj.status;
      }
    }
  }

  // Try to extract from error message
  const message = errorObj.message;
  if (typeof message === "string") {
    const match = message.match(/\b(4\d{2}|5\d{2})\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
}

/**
 * Extract error message from various error formats.
 *
 * @param error - Error object to extract message from
 * @returns Error message string
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;
    // Check common message properties
    if (typeof errorObj.message === "string") {
      return errorObj.message;
    }
    if (typeof errorObj.error === "string") {
      return errorObj.error;
    }
    // Check Resend API error format
    if (typeof errorObj.name === "string" && typeof errorObj.message === "string") {
      return `${errorObj.name}: ${errorObj.message}`;
    }
  }
  return "Unknown error occurred";
}

/**
 * Extract additional details from error object.
 *
 * @param error - Error object to extract details from
 * @returns Details object or undefined
 */
function extractErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const errorObj = error as Record<string, unknown>;
  const details: Record<string, unknown> = {};

  // Include validation errors if present
  if (errorObj.errors && Array.isArray(errorObj.errors)) {
    details.validationErrors = errorObj.errors;
  }

  // Include Zod validation errors
  if (errorObj.issues && Array.isArray(errorObj.issues)) {
    details.validationErrors = errorObj.issues.map(
      (issue: Record<string, unknown>) => ({
        path: issue.path,
        message: issue.message,
      })
    );
  }

  // Include error name/type
  if (errorObj.name && typeof errorObj.name === "string") {
    details.type = errorObj.name;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Format a Resend API error into a structured MCP error response.
 *
 * @param error - Error from Resend API or internal processing
 * @returns Structured MCP error response
 *
 * @example
 * ```typescript
 * try {
 *   await resendClient.emails.send(params);
 * } catch (error) {
 *   const errorResponse = formatResendError(error);
 *   return createToolResponse(errorResponse);
 * }
 * ```
 */
export function formatResendError(error: unknown): MCPErrorResponse {
  const statusCode = extractStatusCode(error);
  const message = extractErrorMessage(error);
  const details = extractErrorDetails(error);

  // Determine error code from status or message
  let code: MCPErrorCode = "UNKNOWN_ERROR";

  if (statusCode && HTTP_TO_ERROR_CODE[statusCode]) {
    code = HTTP_TO_ERROR_CODE[statusCode];
  } else if (message.toLowerCase().includes("rate limit")) {
    code = "RATE_LIMIT_ERROR";
  } else if (
    message.toLowerCase().includes("unauthorized") ||
    message.toLowerCase().includes("invalid api key")
  ) {
    code = "AUTHENTICATION_ERROR";
  } else if (message.toLowerCase().includes("not found")) {
    code = "NOT_FOUND_ERROR";
  } else if (
    message.toLowerCase().includes("validation") ||
    message.toLowerCase().includes("invalid")
  ) {
    code = "VALIDATION_ERROR";
  }

  const errorResponse: MCPErrorResponse = {
    error: true,
    code,
    message,
    hint: ERROR_HINTS[code],
  };

  if (details) {
    errorResponse.details = details;
  }

  // Log error for debugging
  log(`Error: [${code}] ${message}`);

  return errorResponse;
}

/**
 * Create an MCP-compliant tool response from a result or error.
 *
 * @param result - Success data, error object, or MCPErrorResponse
 * @returns MCP tool response with proper formatting
 *
 * @example
 * ```typescript
 * // Success response
 * const result = await resendClient.emails.send(params);
 * return createToolResponse({ success: true, data: result });
 *
 * // Error response
 * const errorResponse = formatResendError(error);
 * return createToolResponse(errorResponse);
 * ```
 */
export function createToolResponse<T>(
  result: MCPErrorResponse | MCPSuccessResponse<T> | T
): MCPToolResponse {
  // Check if it's an error response
  if (isErrorResponse(result)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: true,
    };
  }

  // Check if it's a success wrapper
  if (isSuccessResponse(result)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.data, null, 2),
        },
      ],
    };
  }

  // Raw data - wrap in success response
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Type guard for MCPErrorResponse.
 */
function isErrorResponse(value: unknown): value is MCPErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as MCPErrorResponse).error === true &&
    typeof (value as MCPErrorResponse).code === "string"
  );
}

/**
 * Type guard for MCPSuccessResponse.
 */
function isSuccessResponse<T>(value: unknown): value is MCPSuccessResponse<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as MCPSuccessResponse<T>).success === true &&
    "data" in (value as MCPSuccessResponse<T>)
  );
}

/**
 * Create a validation error response.
 *
 * @param message - Error message
 * @param details - Validation error details
 * @returns MCP error response
 */
export function createValidationError(
  message: string,
  details?: Record<string, unknown>
): MCPErrorResponse {
  return {
    error: true,
    code: "VALIDATION_ERROR",
    message,
    details,
    hint: ERROR_HINTS.VALIDATION_ERROR,
  };
}

/**
 * Create a not found error response.
 *
 * @param resourceType - Type of resource (e.g., "email", "domain")
 * @param resourceId - ID of the resource
 * @returns MCP error response
 */
export function createNotFoundError(
  resourceType: string,
  resourceId: string
): MCPErrorResponse {
  return {
    error: true,
    code: "NOT_FOUND_ERROR",
    message: `${resourceType} not found: ${resourceId}`,
    details: { resourceType, resourceId },
    hint: ERROR_HINTS.NOT_FOUND_ERROR,
  };
}

/**
 * Create an internal error response.
 *
 * @param message - Error message
 * @returns MCP error response
 */
export function createInternalError(message: string): MCPErrorResponse {
  return {
    error: true,
    code: "INTERNAL_ERROR",
    message,
    hint: ERROR_HINTS.INTERNAL_ERROR,
  };
}
