/**
 * Tool Registry for Dynamic MCP Tool Discovery
 *
 * Manages tool loading/unloading by tier and scope, enabling dynamic tool discovery
 * and permission-based access control.
 *
 * @module services/tool-registry
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolScope, ToolTier } from "../config/environment.js";

// NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[tool-registry] ${message}`);

/**
 * Re-export tier and scope types for convenience.
 */
export type { ToolTier, ToolScope };

/**
 * MCP tool input schema (JSON Schema format).
 */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Tool annotations for MCP clients.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * MCP tool definition returned to clients.
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  annotations?: ToolAnnotations;
}

/**
 * Tool response format from execute function.
 * Re-exports SDK's CallToolResult for proper type compatibility.
 */
export type ToolResponse = CallToolResult;

/**
 * Internal tool definition with metadata.
 */
export interface ToolDefinition {
  /** Unique tool name (e.g., "send_email") */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input validation */
  inputSchema: ToolInputSchema;
  /** Optional MCP annotations */
  annotations?: ToolAnnotations;
  /** Tool tier for loading priority */
  tier: Exclude<ToolTier, "all">;
  /** Required scopes for this tool */
  scopes: ToolScope[];
  /** Execute function for the tool */
  execute: (args: unknown) => Promise<ToolResponse>;
}

/**
 * Registry statistics for debugging.
 */
export interface RegistryStats {
  /** Total registered tools */
  totalRegistered: number;
  /** Currently enabled tools */
  totalEnabled: number;
  /** Tools by tier */
  byTier: {
    core: number;
    secondary: number;
    tertiary: number;
  };
  /** Enabled tools by tier */
  enabledByTier: {
    core: number;
    secondary: number;
    tertiary: number;
  };
  /** List of enabled tool names */
  enabledTools: string[];
}

// ============================================================================
// Module-Level State
// ============================================================================

/**
 * All registered tools, indexed by name.
 */
const registeredTools = new Map<string, ToolDefinition>();

/**
 * Currently enabled tool names.
 */
const enabledTools = new Set<string>();

/**
 * MCP Server reference for notifications.
 */
let serverInstance: Server | null = null;

/**
 * Tools organized by tier for efficient loading.
 */
const toolsByTier: Record<Exclude<ToolTier, "all">, string[]> = {
  core: [],
  secondary: [],
  tertiary: [],
};

// NOTE: Tool tier arrays define which tools belong to each tier
// These are populated by registerTool() calls during initialization

/**
 * Core tools - essential functionality (always available).
 */
export const CORE_TOOLS = [
  "send_email",
  "get_email",
  "list_emails",
  "list_domains",
  "search_resend_documentation",
];

/**
 * Secondary tools - commonly used features.
 */
export const SECONDARY_TOOLS = [
  // Domain
  "get_domain",
  "create_domain",
  "update_domain",
  "verify_domain",
  // Email
  "update_email",
  "cancel_email",
  // Contact
  "list_contacts",
  "create_contact",
  "get_contact",
  "update_contact",
  // Template
  "list_templates",
  "create_template",
  "get_template",
  "update_template",
  "publish_template",
  "duplicate_template",
  // Webhook
  "list_webhooks",
  "create_webhook",
  "get_webhook",
  "update_webhook",
  // Audience
  "list_audiences",
  "create_audience",
  "get_audience",
];

/**
 * Tertiary tools - advanced/admin features.
 */
export const TERTIARY_TOOLS = [
  "delete_domain",
  "update_domain",
  "list_contacts",
  "create_contact",
  "get_contact",
  "update_contact",
  "delete_contact",
  "list_audiences",
  "create_audience",
  "get_audience",
  "delete_audience",
  "list_api_keys",
  "create_api_key",
  "delete_api_key",
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the tool registry with an MCP server instance.
 *
 * @param server - MCP Server instance for notifications
 * @param tools - Initial tools to register
 *
 * @example
 * ```typescript
 * const server = new Server({ name: "resend-mcp" }, { capabilities: { tools: {} } });
 * initializeRegistry(server, [sendEmailTool, listDomainsTool]);
 * ```
 */
export function initializeRegistry(
  server: Server,
  tools: ToolDefinition[] = []
): void {
  serverInstance = server;

  // Register all provided tools
  for (const tool of tools) {
    registerTool(tool);
  }

  log(`Registry initialized with ${tools.length} tools`);
}

/**
 * Register a tool in the registry.
 *
 * @param tool - Tool definition to register
 */
export function registerTool(tool: ToolDefinition): void {
  if (registeredTools.has(tool.name)) {
    log(`Warning: Overwriting existing tool '${tool.name}'`);
  }

  registeredTools.set(tool.name, tool);
  toolsByTier[tool.tier].push(tool.name);

  log(`Registered tool: ${tool.name} (tier: ${tool.tier})`);
}

/**
 * Unregister a tool from the registry.
 *
 * @param name - Tool name to unregister
 */
export function unregisterTool(name: string): void {
  const tool = registeredTools.get(name);
  if (!tool) {
    return;
  }

  registeredTools.delete(name);
  enabledTools.delete(name);

  // Remove from tier list
  const tierTools = toolsByTier[tool.tier];
  const index = tierTools.indexOf(name);
  if (index >= 0) {
    tierTools.splice(index, 1);
  }

  log(`Unregistered tool: ${name}`);
}

/**
 * Load all tools of a specific tier (and lower tiers).
 *
 * @param tier - Tier to load (includes all lower tiers)
 *
 * @example
 * ```typescript
 * loadTier("secondary"); // Loads core + secondary tools
 * ```
 */
export async function loadTier(tier: Exclude<ToolTier, "all">): Promise<void> {
  const previousCount = enabledTools.size;

  // Always include core tools
  for (const name of toolsByTier.core) {
    if (registeredTools.has(name)) {
      enabledTools.add(name);
    }
  }

  // Include secondary tools if tier is secondary or tertiary
  if (tier === "secondary" || tier === "tertiary") {
    for (const name of toolsByTier.secondary) {
      if (registeredTools.has(name)) {
        enabledTools.add(name);
      }
    }
  }

  // Include tertiary tools if tier is tertiary
  if (tier === "tertiary") {
    for (const name of toolsByTier.tertiary) {
      if (registeredTools.has(name)) {
        enabledTools.add(name);
      }
    }
  }

  const newCount = enabledTools.size;
  log(`Loaded tier '${tier}': ${newCount} tools enabled (was ${previousCount})`);

  // Notify server of tool list change
  await notifyToolsChanged();
}

/**
 * Unload all tools of a specific tier (keeps lower tiers).
 *
 * @param tier - Tier to unload
 *
 * @example
 * ```typescript
 * unloadTier("tertiary"); // Removes only tertiary tools
 * ```
 */
export async function unloadTier(tier: Exclude<ToolTier, "all">): Promise<void> {
  const previousCount = enabledTools.size;

  // Unload specified tier
  for (const name of toolsByTier[tier]) {
    enabledTools.delete(name);
  }

  // If unloading secondary, also unload tertiary
  if (tier === "secondary") {
    for (const name of toolsByTier.tertiary) {
      enabledTools.delete(name);
    }
  }

  // If unloading core, unload everything
  if (tier === "core") {
    for (const name of toolsByTier.secondary) {
      enabledTools.delete(name);
    }
    for (const name of toolsByTier.tertiary) {
      enabledTools.delete(name);
    }
  }

  const newCount = enabledTools.size;
  log(`Unloaded tier '${tier}': ${newCount} tools enabled (was ${previousCount})`);

  // Notify server of tool list change
  await notifyToolsChanged();
}

/**
 * Load tools by scope(s).
 *
 * @param scopes - Scopes to enable
 *
 * @example
 * ```typescript
 * loadByScope(["read", "write"]); // Enable tools with read or write scope
 * ```
 */
export async function loadByScope(scopes: ToolScope[]): Promise<void> {
  const previousCount = enabledTools.size;
  const scopeSet = new Set(scopes);

  // Enable tools that have at least one matching scope
  for (const [name, tool] of registeredTools) {
    const hasMatchingScope = tool.scopes.some((s) => scopeSet.has(s));
    if (hasMatchingScope) {
      enabledTools.add(name);
    }
  }

  const newCount = enabledTools.size;
  log(
    `Loaded scopes [${scopes.join(", ")}]: ${newCount} tools enabled (was ${previousCount})`
  );

  // Notify server of tool list change
  await notifyToolsChanged();
}

/**
 * Unload tools by scope(s).
 *
 * @param scopes - Scopes to disable
 */
export async function unloadByScope(scopes: ToolScope[]): Promise<void> {
  const previousCount = enabledTools.size;
  const scopeSet = new Set(scopes);

  // Disable tools that have ALL scopes in the provided list
  for (const [name, tool] of registeredTools) {
    const allScopesMatch = tool.scopes.every((s) => scopeSet.has(s));
    if (allScopesMatch) {
      enabledTools.delete(name);
    }
  }

  const newCount = enabledTools.size;
  log(
    `Unloaded scopes [${scopes.join(", ")}]: ${newCount} tools enabled (was ${previousCount})`
  );

  // Notify server of tool list change
  await notifyToolsChanged();
}

/**
 * Get all currently enabled tools as MCP tool definitions.
 *
 * @returns Array of MCP tool definitions
 */
export function getEnabledTools(): MCPToolDefinition[] {
  const tools: MCPToolDefinition[] = [];

  for (const name of enabledTools) {
    const tool = registeredTools.get(name);
    if (tool) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      });
    }
  }

  return tools;
}

/**
 * Check if a tool is currently enabled.
 *
 * @param name - Tool name to check
 * @returns True if tool is enabled
 */
export function isToolEnabled(name: string): boolean {
  return enabledTools.has(name);
}

/**
 * Get a tool definition by name.
 *
 * @param name - Tool name
 * @returns Tool definition or undefined
 */
export function getTool(name: string): ToolDefinition | undefined {
  return registeredTools.get(name);
}

/**
 * Get a tool's execute function if the tool is enabled.
 *
 * @param name - Tool name
 * @returns Execute function or undefined
 */
export function getToolExecutor(
  name: string
): ((args: unknown) => Promise<ToolResponse>) | undefined {
  if (!enabledTools.has(name)) {
    return undefined;
  }
  return registeredTools.get(name)?.execute;
}

/**
 * Get registry statistics for debugging.
 *
 * @returns Registry statistics
 */
export function getRegistryStats(): RegistryStats {
  const stats: RegistryStats = {
    totalRegistered: registeredTools.size,
    totalEnabled: enabledTools.size,
    byTier: {
      core: toolsByTier.core.length,
      secondary: toolsByTier.secondary.length,
      tertiary: toolsByTier.tertiary.length,
    },
    enabledByTier: {
      core: 0,
      secondary: 0,
      tertiary: 0,
    },
    enabledTools: [],
  };

  // Count enabled by tier
  for (const name of enabledTools) {
    const tool = registeredTools.get(name);
    if (tool) {
      stats.enabledByTier[tool.tier]++;
      stats.enabledTools.push(name);
    }
  }

  return stats;
}

/**
 * Reset the registry to initial state.
 * Useful for testing or reconfiguration.
 */
export function resetRegistry(): void {
  registeredTools.clear();
  enabledTools.clear();
  toolsByTier.core = [];
  toolsByTier.secondary = [];
  toolsByTier.tertiary = [];
  serverInstance = null;
  log("Registry reset");
}

/**
 * Enable a specific tool by name.
 *
 * @param name - Tool name to enable
 * @returns True if tool was enabled
 */
export async function enableTool(name: string): Promise<boolean> {
  if (!registeredTools.has(name)) {
    log(`Cannot enable unknown tool: ${name}`);
    return false;
  }

  if (enabledTools.has(name)) {
    return true; // Already enabled
  }

  enabledTools.add(name);
  log(`Enabled tool: ${name}`);

  await notifyToolsChanged();
  return true;
}

/**
 * Disable a specific tool by name.
 *
 * @param name - Tool name to disable
 * @returns True if tool was disabled
 */
export async function disableTool(name: string): Promise<boolean> {
  if (!enabledTools.has(name)) {
    return true; // Already disabled
  }

  enabledTools.delete(name);
  log(`Disabled tool: ${name}`);

  await notifyToolsChanged();
  return true;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Send notification that tool list has changed.
 * MCP clients should re-fetch the tool list.
 */
async function notifyToolsChanged(): Promise<void> {
  if (!serverInstance) {
    log("Warning: No server instance for notification");
    return;
  }

  try {
    // NOTE: MCP SDK may require specific notification format
    // The notification name follows MCP spec: "notifications/tools/list_changed"
    await serverInstance.notification({
      method: "notifications/tools/list_changed",
    });
    log("Sent tools/list_changed notification");
  } catch (error) {
    // Notification failures are non-fatal
    const message = error instanceof Error ? error.message : String(error);
    log(`Warning: Failed to send notification: ${message}`);
  }
}
