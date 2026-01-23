#!/usr/bin/env node
/**
 * Resend MCP Server
 *
 * MCP server for the Resend email API. Enables AI assistants to send emails,
 * manage domains, contacts, and templates via the Model Context Protocol.
 *
 * @module resend-mcp-server
 * @version 1.0.0
 * @license GPL-3.0-or-later
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Resend } from "resend";

import { loadConfig, type Config } from "./config/environment.js";
import { configureRateLimiter } from "./services/rate-limiter.js";
import {
  initializeRegistry,
  loadTier,
  getEnabledTools,
  getToolExecutor,
  getRegistryStats,
} from "./services/tool-registry.js";
import { createToolDefinitions } from "./tools/index.js";
import { createToolResponse, createValidationError } from "./utils/mcp-errors.js";

// NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[resend-mcp] ${message}`);

// ============================================================================
// Server Setup
// ============================================================================

/**
 * Create and configure the MCP server
 */
function createServer(config: Config): Server {
  // Initialize Resend client only if API key is provided
  const resend = config.hasApiKey ? new Resend(config.apiKey) : null;

  // Configure rate limiter
  configureRateLimiter({
    intervalMs: config.rateLimitMs,
    debug: config.debug,
  });

  const server = new Server(
    {
      name: "resend-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    }
  );

  // Create tool definitions - pass resend client or null for docs-only mode
  const allTools = createToolDefinitions(resend);

  // Initialize the tool registry
  initializeRegistry(server, allTools);

  // Register tools/list handler - returns only enabled tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = getEnabledTools();
    log(`Returning ${tools.length} enabled tools`);
    return { tools };
  });

  // Register tools/call handler - executes enabled tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log(`Tool called: ${name}`);

    // Get executor for enabled tool
    const executor = getToolExecutor(name);
    if (!executor) {
      // Check if tool exists but is disabled
      const stats = getRegistryStats();
      const isRegistered = stats.totalRegistered > 0;

      if (isRegistered && !stats.enabledTools.includes(name)) {
        return createToolResponse(
          createValidationError(`Tool '${name}' is not enabled in the current tier`, {
            enabledTools: stats.enabledTools,
            hint: "Use a higher tier to enable more tools",
          })
        );
      }

      return createToolResponse(
        createValidationError(`Unknown tool: ${name}`, {
          availableTools: stats.enabledTools,
        })
      );
    }

    // Execute the tool
    return executor(args);
  });

  return server;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main entry point
 */
async function main(): Promise<void> {
  log("Starting Resend MCP Server v1.0.0");

  // Load and validate configuration
  let config: Config;
  try {
    config = loadConfig();
    log(`Configuration loaded (tier: ${config.defaultTier}, rate limit: ${config.rateLimitMs}ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Configuration error: ${message}`);
    process.exit(1);
  }

  // Create server
  const server = createServer(config);

  // Load tools for the configured tier
  await loadTier(config.defaultTier);

  // Log registry stats
  const stats = getRegistryStats();
  log(`Tools loaded: ${stats.totalEnabled}/${stats.totalRegistered} (tier: ${config.defaultTier})`);
  log(`Enabled tools: ${stats.enabledTools.join(", ")}`);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log("Server connected and ready");
}

// Run the server
main().catch((error) => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});
