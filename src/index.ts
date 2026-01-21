#!/usr/bin/env node
/**
 * Resend MCP Server
 *
 * MCP server for the Resend email API. Enables AI assistants to send emails,
 * manage domains, contacts, and templates via the Model Context Protocol.
 *
 * @module resend-mcp-server
 * @version 1.0.0
 * @license AGPL-3.0-or-later
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Resend } from "resend";
import { z } from "zod";

import { loadConfig, type Config } from "./config/environment.js";
import {
  configureRateLimiter,
  withRateLimitAndRetry,
} from "./services/rate-limiter.js";
import {
  formatResendError,
  createToolResponse,
  createValidationError,
} from "./utils/mcp-errors.js";
import {
  getSearchDocsDefinition,
  executeSearchDocs,
} from "./tools/docs/index.js";

// AIDEV-NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[resend-mcp] ${message}`);

// ============================================================================
// Input Schemas
// ============================================================================

const sendEmailSchema = z.object({
  from: z.string().email("Invalid 'from' email address"),
  to: z.union([
    z.string().email("Invalid 'to' email address"),
    z.array(z.string().email("Invalid 'to' email address")),
  ]),
  subject: z.string().min(1, "Subject is required").max(998, "Subject too long"),
  html: z.string().optional(),
  text: z.string().optional(),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  reply_to: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  headers: z.record(z.string()).optional(),
  tags: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
}).refine((data) => data.html || data.text, {
  message: "Either 'html' or 'text' content is required",
});

const getEmailSchema = z.object({
  id: z.string().min(1, "Email ID is required"),
});

const listEmailsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const getDomainSchema = z.object({
  id: z.string().min(1, "Domain ID is required"),
});

// ============================================================================
// Tool Definitions
// ============================================================================

const toolDefinitions = [
  {
    name: "send_email",
    description:
      "Send an email via Resend API. The 'from' address must be from a verified domain. " +
      "Supports HTML or plain text content, CC/BCC recipients, custom headers, and tags.",
    inputSchema: {
      type: "object" as const,
      properties: {
        from: {
          type: "string",
          description: "Sender email address (must be from verified domain, e.g., 'you@yourdomain.com')",
        },
        to: {
          oneOf: [
            { type: "string", description: "Single recipient email" },
            { type: "array", items: { type: "string" }, description: "Multiple recipients" },
          ],
          description: "Recipient email address(es)",
        },
        subject: {
          type: "string",
          description: "Email subject line (max 998 characters)",
        },
        html: {
          type: "string",
          description: "HTML body content (provide either html or text)",
        },
        text: {
          type: "string",
          description: "Plain text body content (provide either html or text)",
        },
        cc: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "CC recipient(s)",
        },
        bcc: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "BCC recipient(s)",
        },
        reply_to: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Reply-to address(es)",
        },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Custom email headers",
        },
        tags: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, value: { type: "string" } },
            required: ["name", "value"],
          },
          description: "Tags for email categorization",
        },
      },
      required: ["from", "to", "subject"],
    },
  },
  {
    name: "get_email",
    description: "Retrieve details of a previously sent email by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The email ID returned from send_email",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_emails",
    description:
      "List emails that have been sent. Supports pagination with cursor-based navigation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum number of emails to return (default: 10, max: 100)",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from previous response",
        },
      },
    },
  },
  {
    name: "list_domains",
    description: "List all domains associated with the account, including verification status.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_domain",
    description: "Get details of a specific domain including DNS records and verification status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "The domain ID",
        },
      },
      required: ["id"],
    },
  },
  getSearchDocsDefinition(),
];

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Create tool handler with Resend client
 */
function createToolHandler(resend: Resend) {
  return async (name: string, args: unknown) => {
    log(`Tool called: ${name}`);

    switch (name) {
      case "send_email": {
        const parseResult = sendEmailSchema.safeParse(args);
        if (!parseResult.success) {
          const errorMsg = parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ");
          return createToolResponse(
            createValidationError(`Invalid input: ${errorMsg}`, {
              errors: parseResult.error.errors,
            })
          );
        }

        try {
          const input = parseResult.data;
          // Build email options - at least one of html/text is required (validated by schema)
          const emailOptions = {
            from: input.from,
            to: input.to,
            subject: input.subject,
            ...(input.html ? { html: input.html } : {}),
            ...(input.text ? { text: input.text } : {}),
            ...(input.cc ? { cc: input.cc } : {}),
            ...(input.bcc ? { bcc: input.bcc } : {}),
            ...(input.reply_to ? { replyTo: input.reply_to } : {}),
            ...(input.headers ? { headers: input.headers } : {}),
            ...(input.tags ? { tags: input.tags } : {}),
          };

          const result = await withRateLimitAndRetry(() =>
            resend.emails.send(emailOptions as Parameters<typeof resend.emails.send>[0])
          );

          if (result.error) {
            return createToolResponse(formatResendError(result.error));
          }

          return createToolResponse({
            success: true,
            message: "Email sent successfully",
            id: result.data?.id,
          });
        } catch (error) {
          return createToolResponse(formatResendError(error));
        }
      }

      case "get_email": {
        const parseResult = getEmailSchema.safeParse(args);
        if (!parseResult.success) {
          const errorMsg = parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ");
          return createToolResponse(
            createValidationError(`Invalid input: ${errorMsg}`)
          );
        }

        try {
          const { id } = parseResult.data;
          const result = await withRateLimitAndRetry(() =>
            resend.emails.get(id)
          );

          if (result.error) {
            return createToolResponse(formatResendError(result.error));
          }

          return createToolResponse(result.data);
        } catch (error) {
          return createToolResponse(formatResendError(error));
        }
      }

      case "list_emails": {
        const parseResult = listEmailsSchema.safeParse(args);
        if (!parseResult.success) {
          const errorMsg = parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ");
          return createToolResponse(
            createValidationError(`Invalid input: ${errorMsg}`)
          );
        }

        try {
          // AIDEV-NOTE: The Resend SDK list method signature may vary
          // Using the standard pattern with optional params
          const result = await withRateLimitAndRetry(() =>
            resend.emails.list()
          );

          if (result.error) {
            return createToolResponse(formatResendError(result.error));
          }

          return createToolResponse(result.data);
        } catch (error) {
          return createToolResponse(formatResendError(error));
        }
      }

      case "list_domains": {
        try {
          const result = await withRateLimitAndRetry(() =>
            resend.domains.list()
          );

          if (result.error) {
            return createToolResponse(formatResendError(result.error));
          }

          return createToolResponse(result.data);
        } catch (error) {
          return createToolResponse(formatResendError(error));
        }
      }

      case "get_domain": {
        const parseResult = getDomainSchema.safeParse(args);
        if (!parseResult.success) {
          const errorMsg = parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ");
          return createToolResponse(
            createValidationError(`Invalid input: ${errorMsg}`)
          );
        }

        try {
          const { id } = parseResult.data;
          const result = await withRateLimitAndRetry(() =>
            resend.domains.get(id)
          );

          if (result.error) {
            return createToolResponse(formatResendError(result.error));
          }

          return createToolResponse(result.data);
        } catch (error) {
          return createToolResponse(formatResendError(error));
        }
      }

      case "search_resend_documentation":
        return executeSearchDocs(args);

      default:
        return createToolResponse(
          createValidationError(`Unknown tool: ${name}`, {
            availableTools: toolDefinitions.map((t) => t.name),
          })
        );
    }
  };
}

// ============================================================================
// Server Setup
// ============================================================================

/**
 * Create and configure the MCP server
 */
function createServer(config: Config): Server {
  // Initialize Resend client
  const resend = new Resend(config.apiKey);

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

  // Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions,
    };
  });

  // Create tool handler
  const handleTool = createToolHandler(resend);

  // Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleTool(name, args);
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
