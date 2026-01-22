/**
 * Environment Configuration
 *
 * Validates and provides access to environment variables with Zod schemas.
 * Supports API key validation, scopes, tiers, and debug settings.
 *
 * @module config/environment
 */

import { z } from "zod";

// NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[config] ${message}`);

/**
 * Tool tiers for dynamic loading.
 */
export type ToolTier = "core" | "secondary" | "tertiary" | "all";

/**
 * Tool scopes for permission-based access.
 */
export type ToolScope = "read" | "write" | "admin";

/**
 * Environment configuration schema.
 *
 * Validates:
 * - RESEND_API_KEY: Required, must start with "re_"
 * - RESEND_MCP_SCOPES: Optional comma-separated list of scopes
 * - RESEND_MCP_DEFAULT_TIER: Optional tier setting (core|secondary|tertiary|all)
 * - RESEND_RATE_LIMIT_MS: Optional rate limit interval
 * - RESEND_DEBUG: Optional debug flag
 */
const envSchema = z.object({
  /**
   * Resend API key. Required and must start with "re_".
   * Get your key from: https://resend.com/api-keys
   */
  RESEND_API_KEY: z
    .string({
      required_error: "RESEND_API_KEY is required. Get your key from https://resend.com/api-keys",
    })
    .min(1, "RESEND_API_KEY cannot be empty")
    .refine((key) => key.startsWith("re_"), {
      message: "RESEND_API_KEY must start with 're_'",
    }),

  /**
   * Comma-separated list of enabled scopes.
   * Valid values: read, write, admin
   * Example: "read,write"
   */
  RESEND_MCP_SCOPES: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const scopes = val
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      return scopes.length > 0 ? scopes : undefined;
    })
    .pipe(
      z
        .array(z.enum(["read", "write", "admin"]))
        .optional()
    ),

  /**
   * Default tool tier to load on startup.
   * - core: Essential tools only (send_email, list_domains)
   * - secondary: Core + additional tools (templates, contacts)
   * - tertiary: All available tools
   * - all: Alias for tertiary
   */
  RESEND_MCP_DEFAULT_TIER: z
    .enum(["core", "secondary", "tertiary", "all"])
    .default("core")
    .transform((tier) => (tier === "all" ? "tertiary" : tier)),

  /**
   * Rate limit interval in milliseconds.
   * Default: 500ms (2 requests/second)
   */
  RESEND_RATE_LIMIT_MS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 500;
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? 500 : Math.max(0, parsed);
    }),

  /**
   * Enable debug logging.
   * Set to "true", "1", or "yes" to enable.
   */
  RESEND_DEBUG: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return false;
      return ["true", "1", "yes"].includes(val.toLowerCase());
    }),
});

/**
 * Inferred type from the environment schema.
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parsed configuration object.
 * Provides typed access to validated environment variables.
 */
export interface Config {
  /** Resend API key */
  apiKey: string;
  /** Enabled scopes (undefined means all scopes) */
  scopes: ToolScope[] | undefined;
  /** Default tool tier */
  defaultTier: Exclude<ToolTier, "all">;
  /** Rate limit interval in milliseconds */
  rateLimitMs: number;
  /** Debug mode enabled */
  debug: boolean;
}

/**
 * Module-level configuration cache.
 */
let cachedConfig: Config | null = null;

/**
 * Load and validate configuration from environment variables.
 * Caches the result for subsequent calls.
 *
 * @throws Error if required environment variables are missing or invalid
 * @returns Validated configuration object
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * console.error(`Using API key: ${config.apiKey.slice(0, 6)}...`);
 * ```
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");

    log("Configuration validation failed:");
    log(errors);

    // Provide helpful hints for common issues
    if (result.error.errors.some((e) => e.path.includes("RESEND_API_KEY"))) {
      log("");
      log("Hint: Set your Resend API key:");
      log('  export RESEND_API_KEY="re_your_api_key_here"');
      log("  Get your key from: https://resend.com/api-keys");
    }

    throw new Error(`Environment configuration invalid:\n${errors}`);
  }

  const env = result.data;

  cachedConfig = {
    apiKey: env.RESEND_API_KEY,
    scopes: env.RESEND_MCP_SCOPES as ToolScope[] | undefined,
    defaultTier: env.RESEND_MCP_DEFAULT_TIER as Exclude<ToolTier, "all">,
    rateLimitMs: env.RESEND_RATE_LIMIT_MS,
    debug: env.RESEND_DEBUG,
  };

  if (cachedConfig.debug) {
    log("Configuration loaded:");
    log(`  API Key: ${cachedConfig.apiKey.slice(0, 6)}...`);
    log(`  Scopes: ${cachedConfig.scopes?.join(", ") || "all"}`);
    log(`  Default Tier: ${cachedConfig.defaultTier}`);
    log(`  Rate Limit: ${cachedConfig.rateLimitMs}ms`);
    log(`  Debug: ${cachedConfig.debug}`);
  }

  return cachedConfig;
}

/**
 * Get the current configuration.
 * Returns cached config or loads it if not yet loaded.
 *
 * @throws Error if configuration is invalid
 * @returns Validated configuration object
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * if (config.debug) {
 *   console.error("Debug mode enabled");
 * }
 * ```
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

/**
 * Check if configuration has been loaded.
 *
 * @returns True if configuration is loaded
 */
export function isConfigLoaded(): boolean {
  return cachedConfig !== null;
}

/**
 * Reset the configuration cache.
 * Forces reload on next getConfig() or loadConfig() call.
 * Useful for testing or reconfiguration.
 */
export function resetConfig(): void {
  cachedConfig = null;
  log("Configuration cache cleared");
}

/**
 * Validate that a specific scope is enabled.
 *
 * @param scope - Scope to check
 * @returns True if scope is enabled (or if no scopes are configured)
 */
export function isScopeEnabled(scope: ToolScope): boolean {
  const config = getConfig();
  // If no scopes configured, all scopes are enabled
  if (!config.scopes) {
    return true;
  }
  return config.scopes.includes(scope);
}

/**
 * Get enabled scopes, or all scopes if none configured.
 *
 * @returns Array of enabled scopes
 */
export function getEnabledScopes(): ToolScope[] {
  const config = getConfig();
  return config.scopes || ["read", "write", "admin"];
}
