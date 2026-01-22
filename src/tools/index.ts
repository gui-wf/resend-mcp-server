/**
 * Tool Definitions for MCP Server
 *
 * Central factory for creating ToolDefinition objects with proper
 * tier and scope assignments per tool-curation.md.
 *
 * @module tools
 */

import { z } from "zod";
import { Resend } from "resend";
import type { ToolDefinition, ToolResponse } from "../services/tool-registry.js";
import {
  formatResendError,
  createToolResponse,
  createValidationError,
} from "../utils/mcp-errors.js";
import { withRateLimitAndRetry } from "../services/rate-limiter.js";
import {
  getSearchDocsDefinition,
  executeSearchDocs,
} from "./docs/index.js";

// ============================================================================
// Zod Schemas
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
// Tool Factories
// ============================================================================

/**
 * Create send_email tool definition
 */
function createSendEmailTool(resend: Resend): ToolDefinition {
  return {
    name: "send_email",
    description:
      "Send an email via Resend API. The 'from' address must be from a verified domain. " +
      "Supports HTML or plain text content, CC/BCC recipients, custom headers, and tags.",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Sender email address (must be from verified domain)",
        },
        to: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
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
    annotations: {
      title: "Send Email",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "core",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
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
    },
  };
}

/**
 * Create get_email tool definition
 */
function createGetEmailTool(resend: Resend): ToolDefinition {
  return {
    name: "get_email",
    description: "Retrieve details of a previously sent email by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The email ID returned from send_email",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Email",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "core",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
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
    },
  };
}

/**
 * Create list_emails tool definition
 */
function createListEmailsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_emails",
    description:
      "List emails that have been sent. Supports pagination with cursor-based navigation.",
    inputSchema: {
      type: "object",
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
    annotations: {
      title: "List Emails",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "core",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
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
    },
  };
}

/**
 * Create list_domains tool definition
 */
function createListDomainsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_domains",
    description: "List all domains associated with the account, including verification status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Domains",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "core",
    scopes: ["read"],
    execute: async (): Promise<ToolResponse> => {
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
    },
  };
}

/**
 * Create get_domain tool definition
 */
function createGetDomainTool(resend: Resend): ToolDefinition {
  return {
    name: "get_domain",
    description: "Get details of a specific domain including DNS records and verification status.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The domain ID",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Domain",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
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
    },
  };
}

/**
 * Create search_resend_documentation tool definition
 */
function createSearchDocsTool(): ToolDefinition {
  const docsDefinition = getSearchDocsDefinition();

  return {
    name: docsDefinition.name,
    description: docsDefinition.description,
    inputSchema: docsDefinition.inputSchema as ToolDefinition["inputSchema"],
    annotations: docsDefinition.annotations,
    tier: "core",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      return executeSearchDocs(args);
    },
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create all tool definitions with Resend client.
 * Returns array of ToolDefinition objects ready for registry.
 *
 * @param resend - Resend client instance
 * @returns Array of tool definitions
 */
export function createToolDefinitions(resend: Resend): ToolDefinition[] {
  return [
    createSendEmailTool(resend),
    createGetEmailTool(resend),
    createListEmailsTool(resend),
    createListDomainsTool(resend),
    createGetDomainTool(resend),
    createSearchDocsTool(),
  ];
}

/**
 * Get tool names by tier.
 * Useful for verification and debugging.
 */
export function getToolNamesByTier(): Record<string, string[]> {
  return {
    core: ["send_email", "get_email", "list_emails", "list_domains", "search_resend_documentation"],
    secondary: ["get_domain"],
    tertiary: [],
  };
}
