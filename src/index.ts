#!/usr/bin/env node
/**
 * Resend MCP Server
 *
 * MCP server for the Resend email API. Enables AI assistants to send emails,
 * manage domains, contacts, and templates via the Model Context Protocol.
 *
 * This is a placeholder implementation for Phase 1 (Foundation & Setup).
 * The actual server implementation will be generated using Speakeasy in Phase 2.
 *
 * @module resend-mcp-server
 * @version 0.1.0
 * @license AGPL-3.0-or-later
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getSearchDocsDefinition,
  executeSearchDocs,
} from "./tools/docs/index.js";

// AIDEV-NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[resend-mcp] ${message}`);

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    log("ERROR: RESEND_API_KEY environment variable is required");
    log("Get your API key from: https://resend.com/api-keys");
    process.exit(1);
  }

  if (!apiKey.startsWith("re_")) {
    log("WARNING: RESEND_API_KEY should start with 're_'");
  }
}

/**
 * Create and configure the MCP server
 */
function createServer(): Server {
  const server = new Server(
    {
      name: "resend-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "send_email",
          description: "Send an email via Resend API. Requires verified sender domain.",
          inputSchema: {
            type: "object" as const,
            properties: {
              to: {
                type: "string",
                description: "Recipient email address",
              },
              subject: {
                type: "string",
                description: "Email subject line",
              },
              html: {
                type: "string",
                description: "HTML body content",
              },
              from: {
                type: "string",
                description: "Sender email (must be from verified domain)",
              },
            },
            required: ["to", "subject", "html", "from"],
          },
        },
        {
          name: "list_domains",
          description: "List all verified domains for the authenticated user",
          inputSchema: {
            type: "object" as const,
            properties: {},
            required: [],
          },
        },
        getSearchDocsDefinition(),
      ],
    };
  });

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    log(`Tool called: ${name}`);

    // AIDEV-TODO: Replace with actual Resend API calls after Speakeasy generation
    switch (name) {
      case "send_email":
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "placeholder",
                message: "Phase 1 placeholder - Speakeasy generation pending",
                tool: "send_email",
                args,
              }),
            },
          ],
        };

      case "list_domains":
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "placeholder",
                message: "Phase 1 placeholder - Speakeasy generation pending",
                tool: "list_domains",
              }),
            },
          ],
        };

      case "search_resend_documentation":
        return executeSearchDocs(args);

      default:
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Unknown tool",
                message: `Tool '${name}' is not implemented`,
              }),
            },
          ],
          isError: true,
        };
    }
  });

  return server;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  log("Starting Resend MCP Server (Phase 1 Placeholder)");

  // Validate environment
  validateEnvironment();

  // Create server
  const server = createServer();

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
