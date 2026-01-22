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
// Zod Schemas - Core Tools
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
// Zod Schemas - Secondary Tools (Domain)
// ============================================================================

const createDomainSchema = z.object({
  name: z.string().min(1, "Domain name is required"),
  region: z.enum(["us-east-1", "eu-west-1", "sa-east-1", "ap-northeast-1"]).optional(),
});

const updateDomainSchema = z.object({
  id: z.string().min(1, "Domain ID is required"),
  openTracking: z.boolean().optional(),
  clickTracking: z.boolean().optional(),
  tls: z.enum(["enforced", "opportunistic"]).optional(),
});

const verifyDomainSchema = z.object({
  id: z.string().min(1, "Domain ID is required"),
});

// ============================================================================
// Zod Schemas - Secondary Tools (Email)
// ============================================================================

const updateEmailSchema = z.object({
  id: z.string().min(1, "Email ID is required"),
  scheduledAt: z.string().min(1, "Scheduled time is required"),
});

const cancelEmailSchema = z.object({
  id: z.string().min(1, "Email ID is required"),
});

// ============================================================================
// Zod Schemas - Secondary Tools (Contact)
// ============================================================================

const listContactsSchema = z.object({
  audienceId: z.string().min(1, "Audience ID is required"),
});

const createContactSchema = z.object({
  audienceId: z.string().min(1, "Audience ID is required"),
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  unsubscribed: z.boolean().optional(),
});

const getContactSchema = z.object({
  audienceId: z.string().min(1, "Audience ID is required"),
  id: z.string().min(1, "Contact ID is required"),
});

const updateContactSchema = z.object({
  audienceId: z.string().min(1, "Audience ID is required"),
  id: z.string().min(1, "Contact ID is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  unsubscribed: z.boolean().optional(),
});

// ============================================================================
// Zod Schemas - Secondary Tools (Template)
// ============================================================================

const listTemplatesSchema = z.object({});

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  subject: z.string().min(1, "Subject is required"),
  html: z.string().min(1, "HTML content is required"),
});

const getTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
});

const updateTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  name: z.string().optional(),
  subject: z.string().optional(),
  html: z.string().optional(),
});

const publishTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
});

const duplicateTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
});

// ============================================================================
// Zod Schemas - Secondary Tools (Webhook)
// ============================================================================

const webhookEventsSchema = z.array(z.enum([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
]));

const listWebhooksSchema = z.object({});

const createWebhookSchema = z.object({
  endpoint: z.string().url("Invalid webhook URL"),
  events: webhookEventsSchema.min(1, "At least one event is required"),
});

const getWebhookSchema = z.object({
  id: z.string().min(1, "Webhook ID is required"),
});

const updateWebhookSchema = z.object({
  id: z.string().min(1, "Webhook ID is required"),
  endpoint: z.string().url("Invalid webhook URL").optional(),
  events: webhookEventsSchema.optional(),
  enabled: z.boolean().optional(),
});

// ============================================================================
// Zod Schemas - Secondary Tools (Audience)
// ============================================================================

const listAudiencesSchema = z.object({});

const createAudienceSchema = z.object({
  name: z.string().min(1, "Audience name is required"),
});

const getAudienceSchema = z.object({
  id: z.string().min(1, "Audience ID is required"),
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Destructive)
// ============================================================================

const deleteDomainSchema = z.object({
  id: z.string().min(1, "Domain ID is required"),
});

const deleteContactSchema = z.object({
  audienceId: z.string().min(1, "Audience ID is required"),
  id: z.string().optional(),
  email: z.string().email().optional(),
}).refine((data) => data.id || data.email, {
  message: "Either 'id' or 'email' is required",
});

const deleteTemplateSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
});

const deleteTopicSchema = z.object({
  id: z.string().min(1, "Topic ID is required"),
});

const deleteWebhookSchema = z.object({
  id: z.string().min(1, "Webhook ID is required"),
});

const deleteSegmentSchema = z.object({
  id: z.string().min(1, "Segment ID is required"),
});

const deleteBroadcastSchema = z.object({
  id: z.string().min(1, "Broadcast ID is required"),
});

const deleteContactPropertySchema = z.object({
  id: z.string().min(1, "Contact property ID is required"),
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Batch)
// ============================================================================

const sendBatchEmailsSchema = z.object({
  emails: z.array(z.object({
    from: z.string().min(1, "From address is required"),
    to: z.union([z.string().email(), z.array(z.string().email())]),
    subject: z.string().min(1).max(998),
    html: z.string().optional(),
    text: z.string().optional(),
    cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    reply_to: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    headers: z.record(z.string()).optional(),
    tags: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    scheduled_at: z.string().optional(),
  })).min(1).max(100, "Maximum 100 emails per batch"),
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Broadcast)
// ============================================================================

const listBroadcastsSchema = z.object({});

const createBroadcastSchema = z.object({
  name: z.string().optional(),
  segmentId: z.string().min(1, "Segment ID is required"),
  from: z.string().min(1, "From address is required"),
  subject: z.string().min(1, "Subject is required"),
  html: z.string().optional(),
  text: z.string().optional(),
  replyTo: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  previewText: z.string().optional(),
}).refine((data) => data.html || data.text, {
  message: "Either 'html' or 'text' content is required",
});

const getBroadcastSchema = z.object({
  id: z.string().min(1, "Broadcast ID is required"),
});

const updateBroadcastSchema = z.object({
  id: z.string().min(1, "Broadcast ID is required"),
  name: z.string().optional(),
  from: z.string().optional(),
  subject: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  replyTo: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  previewText: z.string().optional(),
});

const sendBroadcastSchema = z.object({
  id: z.string().min(1, "Broadcast ID is required"),
  scheduledAt: z.string().optional(),
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Segment)
// ============================================================================

const listSegmentsSchema = z.object({});

const createSegmentSchema = z.object({
  name: z.string().min(1, "Segment name is required"),
});

const getSegmentSchema = z.object({
  id: z.string().min(1, "Segment ID is required"),
});

const addContactToSegmentSchema = z.object({
  segmentId: z.string().min(1, "Segment ID is required"),
  contactId: z.string().optional(),
  email: z.string().email().optional(),
}).refine((data) => data.contactId || data.email, {
  message: "Either 'contactId' or 'email' is required",
});

const removeContactFromSegmentSchema = z.object({
  segmentId: z.string().min(1, "Segment ID is required"),
  contactId: z.string().optional(),
  email: z.string().email().optional(),
}).refine((data) => data.contactId || data.email, {
  message: "Either 'contactId' or 'email' is required",
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Contact Property)
// ============================================================================

const listContactPropertiesSchema = z.object({});

const createContactPropertySchema = z.object({
  key: z.string().min(1, "Property key is required"),
  type: z.enum(["string", "number"]),
  fallbackValue: z.union([z.string(), z.number()]).nullable().optional(),
});

const getContactPropertySchema = z.object({
  id: z.string().min(1, "Contact property ID is required"),
});

const updateContactPropertySchema = z.object({
  id: z.string().min(1, "Contact property ID is required"),
  fallbackValue: z.union([z.string(), z.number()]).nullable().optional(),
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Inbound Email)
// ============================================================================

const listReceivedEmailsSchema = z.object({});

const getReceivedEmailSchema = z.object({
  id: z.string().min(1, "Email ID is required"),
});

const listReceivedEmailAttachmentsSchema = z.object({
  emailId: z.string().min(1, "Email ID is required"),
});

const getReceivedEmailAttachmentSchema = z.object({
  emailId: z.string().min(1, "Email ID is required"),
  id: z.string().min(1, "Attachment ID is required"),
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Sent Email Attachments)
// ============================================================================

const listEmailAttachmentsSchema = z.object({
  emailId: z.string().min(1, "Email ID is required"),
});

const getEmailAttachmentSchema = z.object({
  emailId: z.string().min(1, "Email ID is required"),
  id: z.string().min(1, "Attachment ID is required"),
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Topic Advanced)
// ============================================================================

const getTopicSchema = z.object({
  id: z.string().min(1, "Topic ID is required"),
});

const updateTopicSchema = z.object({
  id: z.string().min(1, "Topic ID is required"),
  name: z.string().optional(),
  description: z.string().optional(),
});

const getContactTopicsSchema = z.object({
  id: z.string().optional(),
  email: z.string().email().optional(),
}).refine((data) => data.id || data.email, {
  message: "Either 'id' or 'email' is required",
});

const updateContactTopicsSchema = z.object({
  id: z.string().optional(),
  email: z.string().email().optional(),
  topics: z.array(z.object({
    id: z.string(),
    subscription: z.enum(["opt_in", "opt_out"]),
  })),
}).refine((data) => data.id || data.email, {
  message: "Either 'id' or 'email' is required",
});

// ============================================================================
// Zod Schemas - Tertiary Tools (Contact Segments)
// ============================================================================

const listContactSegmentsSchema = z.object({
  contactId: z.string().min(1),
  email: z.never().optional(),
}).or(z.object({
  contactId: z.never().optional(),
  email: z.string().email(),
}));

// ============================================================================
// Helper: Validation Error Handler
// ============================================================================

function handleValidationError(parseResult: z.SafeParseError<unknown>): ToolResponse {
  const errorMsg = parseResult.error.errors
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("; ");
  return createToolResponse(
    createValidationError(`Invalid input: ${errorMsg}`, {
      errors: parseResult.error.errors,
    })
  );
}

// ============================================================================
// Tool Factories - Core Tools
// ============================================================================

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
        return handleValidationError(parseResult);
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
        return handleValidationError(parseResult);
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
        return handleValidationError(parseResult);
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
        return handleValidationError(parseResult);
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
// Tool Factories - Secondary Tools (Domain)
// ============================================================================

function createCreateDomainTool(resend: Resend): ToolDefinition {
  return {
    name: "create_domain",
    description: "Add a new domain for sending emails. After creation, configure DNS records to verify the domain.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The domain name to add (e.g., 'example.com')",
        },
        region: {
          type: "string",
          enum: ["us-east-1", "eu-west-1", "sa-east-1", "ap-northeast-1"],
          description: "AWS region for sending (default: us-east-1)",
        },
      },
      required: ["name"],
    },
    annotations: {
      title: "Create Domain",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createDomainSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.domains.create(input)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Domain created. Configure DNS records to verify.",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createUpdateDomainTool(resend: Resend): ToolDefinition {
  return {
    name: "update_domain",
    description: "Update domain settings like tracking options and TLS enforcement.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The domain ID",
        },
        openTracking: {
          type: "boolean",
          description: "Enable open tracking",
        },
        clickTracking: {
          type: "boolean",
          description: "Enable click tracking",
        },
        tls: {
          type: "string",
          enum: ["enforced", "opportunistic"],
          description: "TLS setting for email delivery",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Update Domain",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateDomainSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, ...updateData } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.domains.update({ id, ...updateData })
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Domain updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createVerifyDomainTool(resend: Resend): ToolDefinition {
  return {
    name: "verify_domain",
    description: "Trigger DNS verification for a domain. Ensure DNS records are configured first.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The domain ID to verify",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Verify Domain",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = verifyDomainSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.domains.verify(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Domain verification initiated",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Secondary Tools (Email)
// ============================================================================

function createUpdateEmailTool(resend: Resend): ToolDefinition {
  return {
    name: "update_email",
    description: "Update a scheduled email's send time. Only works for emails that haven't been sent yet.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The email ID",
        },
        scheduledAt: {
          type: "string",
          description: "New scheduled time (ISO 8601 format)",
        },
      },
      required: ["id", "scheduledAt"],
    },
    annotations: {
      title: "Update Email",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateEmailSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, scheduledAt } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.emails.update({ id, scheduledAt })
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Email schedule updated",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createCancelEmailTool(resend: Resend): ToolDefinition {
  return {
    name: "cancel_email",
    description: "Cancel a scheduled email. Only works for emails that haven't been sent yet.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The email ID to cancel",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Cancel Email",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = cancelEmailSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.emails.cancel(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Email cancelled successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Secondary Tools (Contact)
// ============================================================================

function createListContactsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_contacts",
    description: "List all contacts in an audience.",
    inputSchema: {
      type: "object",
      properties: {
        audienceId: {
          type: "string",
          description: "The audience ID to list contacts from",
        },
      },
      required: ["audienceId"],
    },
    annotations: {
      title: "List Contacts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listContactsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { audienceId } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.list({ audienceId })
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

function createCreateContactTool(resend: Resend): ToolDefinition {
  return {
    name: "create_contact",
    description: "Add a new contact to an audience.",
    inputSchema: {
      type: "object",
      properties: {
        audienceId: {
          type: "string",
          description: "The audience ID to add the contact to",
        },
        email: {
          type: "string",
          description: "Contact email address",
        },
        firstName: {
          type: "string",
          description: "Contact first name",
        },
        lastName: {
          type: "string",
          description: "Contact last name",
        },
        unsubscribed: {
          type: "boolean",
          description: "Whether the contact is unsubscribed",
        },
      },
      required: ["audienceId", "email"],
    },
    annotations: {
      title: "Create Contact",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createContactSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.create(input)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact created successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetContactTool(resend: Resend): ToolDefinition {
  return {
    name: "get_contact",
    description: "Get details of a specific contact.",
    inputSchema: {
      type: "object",
      properties: {
        audienceId: {
          type: "string",
          description: "The audience ID",
        },
        id: {
          type: "string",
          description: "The contact ID",
        },
      },
      required: ["audienceId", "id"],
    },
    annotations: {
      title: "Get Contact",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getContactSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { audienceId, id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.get({ audienceId, id })
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

function createUpdateContactTool(resend: Resend): ToolDefinition {
  return {
    name: "update_contact",
    description: "Update a contact's information.",
    inputSchema: {
      type: "object",
      properties: {
        audienceId: {
          type: "string",
          description: "The audience ID",
        },
        id: {
          type: "string",
          description: "The contact ID",
        },
        firstName: {
          type: "string",
          description: "Contact first name",
        },
        lastName: {
          type: "string",
          description: "Contact last name",
        },
        unsubscribed: {
          type: "boolean",
          description: "Whether the contact is unsubscribed",
        },
      },
      required: ["audienceId", "id"],
    },
    annotations: {
      title: "Update Contact",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateContactSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.update(input)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Secondary Tools (Template)
// ============================================================================

function createListTemplatesTool(resend: Resend): ToolDefinition {
  return {
    name: "list_templates",
    description: "List all email templates.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Templates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listTemplatesSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const result = await withRateLimitAndRetry(() =>
          resend.templates.list()
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

function createCreateTemplateTool(resend: Resend): ToolDefinition {
  return {
    name: "create_template",
    description: "Create a new email template with HTML content.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Template name",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        html: {
          type: "string",
          description: "HTML content of the template",
        },
      },
      required: ["name", "subject", "html"],
    },
    annotations: {
      title: "Create Template",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createTemplateSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          Promise.resolve(resend.templates.create(input))
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Template created successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetTemplateTool(resend: Resend): ToolDefinition {
  return {
    name: "get_template",
    description: "Get details of a specific email template.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The template ID",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Template",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getTemplateSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.templates.get(id)
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

function createUpdateTemplateTool(resend: Resend): ToolDefinition {
  return {
    name: "update_template",
    description: "Update an existing email template.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The template ID",
        },
        name: {
          type: "string",
          description: "New template name",
        },
        subject: {
          type: "string",
          description: "New email subject line",
        },
        html: {
          type: "string",
          description: "New HTML content",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Update Template",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateTemplateSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, ...updateData } = parseResult.data;
        // NOTE: Resend SDK templates.update takes (id, payload) as separate args
        const result = await withRateLimitAndRetry(() =>
          Promise.resolve(resend.templates.update(id, updateData))
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Template updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createPublishTemplateTool(resend: Resend): ToolDefinition {
  return {
    name: "publish_template",
    description: "Publish a template to make it available for use.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The template ID to publish",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Publish Template",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = publishTemplateSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.templates.publish(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Template published successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDuplicateTemplateTool(resend: Resend): ToolDefinition {
  return {
    name: "duplicate_template",
    description: "Create a copy of an existing template.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The template ID to duplicate",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Duplicate Template",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = duplicateTemplateSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          Promise.resolve(resend.templates.duplicate(id))
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Template duplicated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Secondary Tools (Webhook)
// ============================================================================

function createListWebhooksTool(resend: Resend): ToolDefinition {
  return {
    name: "list_webhooks",
    description: "List all webhooks configured for the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Webhooks",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listWebhooksSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const result = await withRateLimitAndRetry(() =>
          resend.webhooks.list()
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

function createCreateWebhookTool(resend: Resend): ToolDefinition {
  return {
    name: "create_webhook",
    description: "Create a new webhook to receive event notifications.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          description: "The URL to receive webhook events",
        },
        events: {
          type: "array",
          items: {
            type: "string",
            enum: ["email.sent", "email.delivered", "email.delivery_delayed", "email.complained", "email.bounced", "email.opened", "email.clicked"],
          },
          description: "Events to subscribe to",
        },
      },
      required: ["endpoint", "events"],
    },
    annotations: {
      title: "Create Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createWebhookSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.webhooks.create({ endpoint: input.endpoint, events: input.events as Parameters<typeof resend.webhooks.create>[0]["events"] })
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Webhook created successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetWebhookTool(resend: Resend): ToolDefinition {
  return {
    name: "get_webhook",
    description: "Get details of a specific webhook.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The webhook ID",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Webhook",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getWebhookSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.webhooks.get(id)
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

function createUpdateWebhookTool(resend: Resend): ToolDefinition {
  return {
    name: "update_webhook",
    description: "Update a webhook's configuration.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The webhook ID",
        },
        endpoint: {
          type: "string",
          description: "New endpoint URL",
        },
        events: {
          type: "array",
          items: {
            type: "string",
            enum: ["email.sent", "email.delivered", "email.delivery_delayed", "email.complained", "email.bounced", "email.opened", "email.clicked"],
          },
          description: "New events to subscribe to",
        },
        enabled: {
          type: "boolean",
          description: "Whether the webhook is enabled",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Update Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateWebhookSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, ...updateData } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.webhooks.update(id, updateData as Parameters<typeof resend.webhooks.update>[1])
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Webhook updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Secondary Tools (Audience)
// ============================================================================

function createListAudiencesTool(resend: Resend): ToolDefinition {
  return {
    name: "list_audiences",
    description: "List all audiences (contact lists) in the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Audiences",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listAudiencesSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const result = await withRateLimitAndRetry(() =>
          resend.audiences.list()
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

function createCreateAudienceTool(resend: Resend): ToolDefinition {
  return {
    name: "create_audience",
    description: "Create a new audience (contact list).",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The audience name",
        },
      },
      required: ["name"],
    },
    annotations: {
      title: "Create Audience",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createAudienceSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.audiences.create(input)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Audience created successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetAudienceTool(resend: Resend): ToolDefinition {
  return {
    name: "get_audience",
    description: "Get details of a specific audience.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The audience ID",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Audience",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "secondary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getAudienceSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.audiences.get(id)
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

// ============================================================================
// Tool Factories - Tertiary Tools (Destructive)
// ============================================================================

function createDeleteDomainTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_domain",
    description: "Delete a domain from your account. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The domain ID to delete",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Delete Domain",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteDomainSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.domains.remove(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Domain deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDeleteContactTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_contact",
    description: "Delete a contact from an audience. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        audienceId: {
          type: "string",
          description: "The audience ID containing the contact",
        },
        id: {
          type: "string",
          description: "The contact ID to delete (use either id or email)",
        },
        email: {
          type: "string",
          description: "The contact email to delete (use either id or email)",
        },
      },
      required: ["audienceId"],
    },
    annotations: {
      title: "Delete Contact",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteContactSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { audienceId, id, email } = parseResult.data;
        // SDK requires either id or email, not both
        const payload = id
          ? { audienceId, id } as const
          : { audienceId, email: email! } as const;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.remove(payload)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDeleteTemplateTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_template",
    description: "Delete an email template. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The template ID to delete",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Delete Template",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteTemplateSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.templates.remove(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Template deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDeleteTopicTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_topic",
    description: "Delete a topic. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The topic ID to delete",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Delete Topic",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteTopicSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.topics.remove(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Topic deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDeleteWebhookTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_webhook",
    description: "Delete a webhook. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The webhook ID to delete",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Delete Webhook",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteWebhookSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.webhooks.remove(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Webhook deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDeleteSegmentTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_segment",
    description: "Delete a segment. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The segment ID to delete",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Delete Segment",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteSegmentSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.segments.remove(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Segment deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDeleteBroadcastTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_broadcast",
    description: "Delete a broadcast. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The broadcast ID to delete",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Delete Broadcast",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteBroadcastSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.broadcasts.remove(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Broadcast deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createDeleteContactPropertyTool(resend: Resend): ToolDefinition {
  return {
    name: "delete_contact_property",
    description: "Delete a contact property. This is a destructive operation.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The contact property ID to delete",
        },
      },
      required: ["id"],
    },
    annotations: {
      title: "Delete Contact Property",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["admin"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = deleteContactPropertySchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contactProperties.remove(id)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact property deleted successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Tertiary Tools (Batch)
// ============================================================================

function createSendBatchEmailsTool(resend: Resend): ToolDefinition {
  return {
    name: "send_batch_emails",
    description: "Send up to 100 emails in a single batch request.",
    inputSchema: {
      type: "object",
      properties: {
        emails: {
          type: "array",
          description: "Array of email objects (max 100)",
          items: {
            type: "object",
            properties: {
              from: { type: "string", description: "Sender email address" },
              to: { type: ["string", "array"], description: "Recipient(s)" },
              subject: { type: "string", description: "Email subject" },
              html: { type: "string", description: "HTML content" },
              text: { type: "string", description: "Plain text content" },
              cc: { type: ["string", "array"], description: "CC recipient(s)" },
              bcc: { type: ["string", "array"], description: "BCC recipient(s)" },
              reply_to: { type: ["string", "array"], description: "Reply-to address(es)" },
              headers: { type: "object", description: "Custom headers" },
              tags: { type: "array", description: "Email tags" },
              scheduled_at: { type: "string", description: "Scheduled send time (ISO 8601)" },
            },
            required: ["from", "to", "subject"],
          },
        },
      },
      required: ["emails"],
    },
    annotations: {
      title: "Send Batch Emails",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = sendBatchEmailsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { emails } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.batch.send(emails as Parameters<typeof resend.batch.send>[0])
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: `Batch sent: ${emails.length} emails`,
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Tertiary Tools (Broadcast)
// ============================================================================

function createListBroadcastsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_broadcasts",
    description: "List all broadcasts in the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Broadcasts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listBroadcastsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const result = await withRateLimitAndRetry(() =>
          resend.broadcasts.list()
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

function createCreateBroadcastTool(resend: Resend): ToolDefinition {
  return {
    name: "create_broadcast",
    description: "Create a new broadcast for a segment.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Broadcast name" },
        segmentId: { type: "string", description: "Target segment ID" },
        from: { type: "string", description: "Sender email address" },
        subject: { type: "string", description: "Email subject" },
        html: { type: "string", description: "HTML content" },
        text: { type: "string", description: "Plain text content" },
        replyTo: { type: ["string", "array"], description: "Reply-to address(es)" },
        previewText: { type: "string", description: "Preview text" },
      },
      required: ["segmentId", "from", "subject"],
    },
    annotations: {
      title: "Create Broadcast",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createBroadcastSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.broadcasts.create(input as Parameters<typeof resend.broadcasts.create>[0])
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Broadcast created successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetBroadcastTool(resend: Resend): ToolDefinition {
  return {
    name: "get_broadcast",
    description: "Get details of a specific broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The broadcast ID" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Broadcast",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getBroadcastSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.broadcasts.get(id)
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

function createUpdateBroadcastTool(resend: Resend): ToolDefinition {
  return {
    name: "update_broadcast",
    description: "Update an existing broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The broadcast ID" },
        name: { type: "string", description: "Broadcast name" },
        from: { type: "string", description: "Sender email address" },
        subject: { type: "string", description: "Email subject" },
        html: { type: "string", description: "HTML content" },
        text: { type: "string", description: "Plain text content" },
        replyTo: { type: ["string", "array"], description: "Reply-to address(es)" },
        previewText: { type: "string", description: "Preview text" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Update Broadcast",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateBroadcastSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, ...updateData } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.broadcasts.update(id, updateData as Parameters<typeof resend.broadcasts.update>[1])
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Broadcast updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createSendBroadcastTool(resend: Resend): ToolDefinition {
  return {
    name: "send_broadcast",
    description: "Send a broadcast immediately or schedule it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The broadcast ID to send" },
        scheduledAt: { type: "string", description: "Schedule time (ISO 8601)" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Send Broadcast",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = sendBroadcastSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, scheduledAt } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.broadcasts.send(id, scheduledAt ? { scheduledAt } : undefined)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Broadcast sent successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Tertiary Tools (Segment)
// ============================================================================

function createListSegmentsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_segments",
    description: "List all segments in the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Segments",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listSegmentsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const result = await withRateLimitAndRetry(() =>
          resend.segments.list()
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

function createCreateSegmentTool(resend: Resend): ToolDefinition {
  return {
    name: "create_segment",
    description: "Create a new segment.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Segment name" },
      },
      required: ["name"],
    },
    annotations: {
      title: "Create Segment",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createSegmentSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.segments.create(input)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Segment created successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetSegmentTool(resend: Resend): ToolDefinition {
  return {
    name: "get_segment",
    description: "Get details of a specific segment.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The segment ID" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Segment",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getSegmentSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.segments.get(id)
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

function createAddContactToSegmentTool(resend: Resend): ToolDefinition {
  return {
    name: "add_contact_to_segment",
    description: "Add a contact to a segment.",
    inputSchema: {
      type: "object",
      properties: {
        segmentId: { type: "string", description: "The segment ID" },
        contactId: { type: "string", description: "The contact ID (use contactId or email)" },
        email: { type: "string", description: "The contact email (use contactId or email)" },
      },
      required: ["segmentId"],
    },
    annotations: {
      title: "Add Contact to Segment",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = addContactToSegmentSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { segmentId, contactId, email } = parseResult.data;
        // SDK requires either contactId or email, not both
        const payload = contactId
          ? { segmentId, contactId } as const
          : { segmentId, email: email! } as const;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.segments.add(payload)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact added to segment successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createRemoveContactFromSegmentTool(resend: Resend): ToolDefinition {
  return {
    name: "remove_contact_from_segment",
    description: "Remove a contact from a segment.",
    inputSchema: {
      type: "object",
      properties: {
        segmentId: { type: "string", description: "The segment ID" },
        contactId: { type: "string", description: "The contact ID (use contactId or email)" },
        email: { type: "string", description: "The contact email (use contactId or email)" },
      },
      required: ["segmentId"],
    },
    annotations: {
      title: "Remove Contact from Segment",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = removeContactFromSegmentSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { segmentId, contactId, email } = parseResult.data;
        // SDK requires either contactId or email, not both
        const payload = contactId
          ? { segmentId, contactId } as const
          : { segmentId, email: email! } as const;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.segments.remove(payload)
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact removed from segment successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Tertiary Tools (Contact Property)
// ============================================================================

function createListContactPropertiesTool(resend: Resend): ToolDefinition {
  return {
    name: "list_contact_properties",
    description: "List all contact properties.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Contact Properties",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listContactPropertiesSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const result = await withRateLimitAndRetry(() =>
          resend.contactProperties.list()
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

function createCreateContactPropertyTool(resend: Resend): ToolDefinition {
  return {
    name: "create_contact_property",
    description: "Create a new contact property.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Property key" },
        type: { type: "string", enum: ["string", "number"], description: "Property type" },
        fallbackValue: { type: ["string", "number", "null"], description: "Default value" },
      },
      required: ["key", "type"],
    },
    annotations: {
      title: "Create Contact Property",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = createContactPropertySchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const input = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contactProperties.create(input as Parameters<typeof resend.contactProperties.create>[0])
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact property created successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetContactPropertyTool(resend: Resend): ToolDefinition {
  return {
    name: "get_contact_property",
    description: "Get details of a specific contact property.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The contact property ID" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Contact Property",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getContactPropertySchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contactProperties.get(id)
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

function createUpdateContactPropertyTool(resend: Resend): ToolDefinition {
  return {
    name: "update_contact_property",
    description: "Update a contact property.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The contact property ID" },
        fallbackValue: { type: ["string", "number", "null"], description: "New default value" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Update Contact Property",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateContactPropertySchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, ...updateData } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contactProperties.update({ id, ...updateData } as Parameters<typeof resend.contactProperties.update>[0])
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact property updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Tertiary Tools (Inbound Email)
// ============================================================================

function createListReceivedEmailsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_received_emails",
    description: "List all received (inbound) emails.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: "List Received Emails",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listReceivedEmailsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const result = await withRateLimitAndRetry(() =>
          resend.emails.receiving.list()
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

function createGetReceivedEmailTool(resend: Resend): ToolDefinition {
  return {
    name: "get_received_email",
    description: "Get details of a specific received email.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The received email ID" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Received Email",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getReceivedEmailSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.emails.receiving.get(id)
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

function createListReceivedEmailAttachmentsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_received_email_attachments",
    description: "List attachments of a received email.",
    inputSchema: {
      type: "object",
      properties: {
        emailId: { type: "string", description: "The received email ID" },
      },
      required: ["emailId"],
    },
    annotations: {
      title: "List Received Email Attachments",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listReceivedEmailAttachmentsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { emailId } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.emails.receiving.attachments.list({ emailId })
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

function createGetReceivedEmailAttachmentTool(resend: Resend): ToolDefinition {
  return {
    name: "get_received_email_attachment",
    description: "Get a specific attachment from a received email.",
    inputSchema: {
      type: "object",
      properties: {
        emailId: { type: "string", description: "The received email ID" },
        id: { type: "string", description: "The attachment ID" },
      },
      required: ["emailId", "id"],
    },
    annotations: {
      title: "Get Received Email Attachment",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getReceivedEmailAttachmentSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { emailId, id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.emails.receiving.attachments.get({ emailId, id })
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

// ============================================================================
// Tool Factories - Tertiary Tools (Sent Email Attachments)
// ============================================================================

function createListEmailAttachmentsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_email_attachments",
    description: "List attachments of a sent email.",
    inputSchema: {
      type: "object",
      properties: {
        emailId: { type: "string", description: "The sent email ID" },
      },
      required: ["emailId"],
    },
    annotations: {
      title: "List Email Attachments",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listEmailAttachmentsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { emailId } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.emails.attachments.list({ emailId })
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

function createGetEmailAttachmentTool(resend: Resend): ToolDefinition {
  return {
    name: "get_email_attachment",
    description: "Get a specific attachment from a sent email.",
    inputSchema: {
      type: "object",
      properties: {
        emailId: { type: "string", description: "The sent email ID" },
        id: { type: "string", description: "The attachment ID" },
      },
      required: ["emailId", "id"],
    },
    annotations: {
      title: "Get Email Attachment",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getEmailAttachmentSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { emailId, id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.emails.attachments.get({ emailId, id })
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

// ============================================================================
// Tool Factories - Tertiary Tools (Topic Advanced)
// ============================================================================

function createGetTopicTool(resend: Resend): ToolDefinition {
  return {
    name: "get_topic",
    description: "Get details of a specific topic.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The topic ID" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Get Topic",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getTopicSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.topics.get(id)
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

function createUpdateTopicTool(resend: Resend): ToolDefinition {
  return {
    name: "update_topic",
    description: "Update a topic.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The topic ID" },
        name: { type: "string", description: "New topic name" },
        description: { type: "string", description: "New topic description" },
      },
      required: ["id"],
    },
    annotations: {
      title: "Update Topic",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateTopicSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, ...updateData } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.topics.update({ id, ...updateData })
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Topic updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

function createGetContactTopicsTool(resend: Resend): ToolDefinition {
  return {
    name: "get_contact_topics",
    description: "Get topic subscriptions for a contact.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The contact ID (use id or email)" },
        email: { type: "string", description: "The contact email (use id or email)" },
      },
    },
    annotations: {
      title: "Get Contact Topics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = getContactTopicsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, email } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.topics.list({ id, email })
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

function createUpdateContactTopicsTool(resend: Resend): ToolDefinition {
  return {
    name: "update_contact_topics",
    description: "Update topic subscriptions for a contact.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The contact ID (use id or email)" },
        email: { type: "string", description: "The contact email (use id or email)" },
        topics: {
          type: "array",
          description: "Topic subscriptions to update",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Topic ID" },
              subscription: { type: "string", enum: ["opt_in", "opt_out"], description: "Subscription status" },
            },
            required: ["id", "subscription"],
          },
        },
      },
      required: ["topics"],
    },
    annotations: {
      title: "Update Contact Topics",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["write"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = updateContactTopicsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const { id, email, topics } = parseResult.data;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.topics.update({ id, email, topics })
        );

        if (result.error) {
          return createToolResponse(formatResendError(result.error));
        }

        return createToolResponse({
          success: true,
          message: "Contact topics updated successfully",
          ...result.data,
        });
      } catch (error) {
        return createToolResponse(formatResendError(error));
      }
    },
  };
}

// ============================================================================
// Tool Factories - Tertiary Tools (Contact Segments)
// ============================================================================

function createListContactSegmentsTool(resend: Resend): ToolDefinition {
  return {
    name: "list_contact_segments",
    description: "List segments that a contact belongs to.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "The contact ID (use contactId or email)" },
        email: { type: "string", description: "The contact email (use contactId or email)" },
      },
    },
    annotations: {
      title: "List Contact Segments",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    tier: "tertiary",
    scopes: ["read"],
    execute: async (args: unknown): Promise<ToolResponse> => {
      const parseResult = listContactSegmentsSchema.safeParse(args);
      if (!parseResult.success) {
        return handleValidationError(parseResult);
      }

      try {
        const data = parseResult.data;
        // SDK expects contactId or email, not both
        const payload = "contactId" in data && data.contactId
          ? { contactId: data.contactId } as const
          : { email: data.email! } as const;
        const result = await withRateLimitAndRetry(() =>
          resend.contacts.segments.list(payload)
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
    // Core tools
    createSendEmailTool(resend),
    createGetEmailTool(resend),
    createListEmailsTool(resend),
    createListDomainsTool(resend),
    createSearchDocsTool(),
    // Secondary - Domain
    createGetDomainTool(resend),
    createCreateDomainTool(resend),
    createUpdateDomainTool(resend),
    createVerifyDomainTool(resend),
    // Secondary - Email
    createUpdateEmailTool(resend),
    createCancelEmailTool(resend),
    // Secondary - Contact
    createListContactsTool(resend),
    createCreateContactTool(resend),
    createGetContactTool(resend),
    createUpdateContactTool(resend),
    // Secondary - Template
    createListTemplatesTool(resend),
    createCreateTemplateTool(resend),
    createGetTemplateTool(resend),
    createUpdateTemplateTool(resend),
    createPublishTemplateTool(resend),
    createDuplicateTemplateTool(resend),
    // Secondary - Webhook
    createListWebhooksTool(resend),
    createCreateWebhookTool(resend),
    createGetWebhookTool(resend),
    createUpdateWebhookTool(resend),
    // Secondary - Audience
    createListAudiencesTool(resend),
    createCreateAudienceTool(resend),
    createGetAudienceTool(resend),
    // Tertiary - Destructive
    createDeleteDomainTool(resend),
    createDeleteContactTool(resend),
    createDeleteTemplateTool(resend),
    createDeleteTopicTool(resend),
    createDeleteWebhookTool(resend),
    createDeleteSegmentTool(resend),
    createDeleteBroadcastTool(resend),
    createDeleteContactPropertyTool(resend),
    // Tertiary - Batch
    createSendBatchEmailsTool(resend),
    // Tertiary - Broadcast
    createListBroadcastsTool(resend),
    createCreateBroadcastTool(resend),
    createGetBroadcastTool(resend),
    createUpdateBroadcastTool(resend),
    createSendBroadcastTool(resend),
    // Tertiary - Segment
    createListSegmentsTool(resend),
    createCreateSegmentTool(resend),
    createGetSegmentTool(resend),
    createAddContactToSegmentTool(resend),
    createRemoveContactFromSegmentTool(resend),
    // Tertiary - Contact Property
    createListContactPropertiesTool(resend),
    createCreateContactPropertyTool(resend),
    createGetContactPropertyTool(resend),
    createUpdateContactPropertyTool(resend),
    // Tertiary - Inbound Email
    createListReceivedEmailsTool(resend),
    createGetReceivedEmailTool(resend),
    createListReceivedEmailAttachmentsTool(resend),
    createGetReceivedEmailAttachmentTool(resend),
    // Tertiary - Sent Email Attachments
    createListEmailAttachmentsTool(resend),
    createGetEmailAttachmentTool(resend),
    // Tertiary - Topic Advanced
    createGetTopicTool(resend),
    createUpdateTopicTool(resend),
    createGetContactTopicsTool(resend),
    createUpdateContactTopicsTool(resend),
    // Tertiary - Contact Segments
    createListContactSegmentsTool(resend),
  ];
}

/**
 * Get tool names by tier.
 * Useful for verification and debugging.
 */
export function getToolNamesByTier(): Record<string, string[]> {
  return {
    core: [
      "send_email",
      "get_email",
      "list_emails",
      "list_domains",
      "search_resend_documentation",
    ],
    secondary: [
      "get_domain",
      "create_domain",
      "update_domain",
      "verify_domain",
      "update_email",
      "cancel_email",
      "list_contacts",
      "create_contact",
      "get_contact",
      "update_contact",
      "list_templates",
      "create_template",
      "get_template",
      "update_template",
      "publish_template",
      "duplicate_template",
      "list_webhooks",
      "create_webhook",
      "get_webhook",
      "update_webhook",
      "list_audiences",
      "create_audience",
      "get_audience",
    ],
    tertiary: [
      // Destructive
      "delete_domain",
      "delete_contact",
      "delete_template",
      "delete_topic",
      "delete_webhook",
      "delete_segment",
      "delete_broadcast",
      "delete_contact_property",
      // Batch
      "send_batch_emails",
      // Broadcast
      "list_broadcasts",
      "create_broadcast",
      "get_broadcast",
      "update_broadcast",
      "send_broadcast",
      // Segment
      "list_segments",
      "create_segment",
      "get_segment",
      "add_contact_to_segment",
      "remove_contact_from_segment",
      // Contact Property
      "list_contact_properties",
      "create_contact_property",
      "get_contact_property",
      "update_contact_property",
      // Inbound Email
      "list_received_emails",
      "get_received_email",
      "list_received_email_attachments",
      "get_received_email_attachment",
      // Sent Email Attachments
      "list_email_attachments",
      "get_email_attachment",
      // Topic Advanced
      "get_topic",
      "update_topic",
      "get_contact_topics",
      "update_contact_topics",
      // Contact Segments
      "list_contact_segments",
    ],
  };
}
