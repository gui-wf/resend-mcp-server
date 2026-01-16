# Resend MCP Server - Implementation Plan

## Executive Summary

This document outlines the complete approach for building a comprehensive MCP Server that wraps the Resend API, enabling AI assistants like Claude Code to manage email operations, templates, domains, contacts, and more through natural language.

---

## Part 1: Research Findings

### 1.1 MCP Security Features for Sensitive Data

**Key Finding: MCP has annotation mechanisms, but they are advisory only.**

#### What MCP Provides:

1. **Audience Annotations** (Stable)
   ```typescript
   {
     type: "text",
     text: "Sensitive content",
     annotations: {
       audience: ["user"],  // Hint: show only to user, not LLM
       priority: 1
     }
   }
   ```
   - Values: `["user"]`, `["assistant"]`, `["user", "assistant"]`
   - **Critical limitation**: These are hints only - clients can ignore them

2. **Tool Annotations** (Stable)
   ```typescript
   {
     name: "delete_domain",
     annotations: {
       readOnlyHint: false,
       destructiveHint: true,
       idempotentHint: false,
       openWorldHint: true
     }
   }
   ```
   - Help clients display appropriate warnings
   - Not enforced by the protocol

3. **URL Mode Elicitation** (Stable, 2025-11-25 spec)
   - **Only mechanism that truly bypasses the LLM**
   - Redirects users to external HTTPS pages for credential entry
   - Credentials never pass through MCP client or LLM context
   - **Recommendation**: Use for API key setup if implementing OAuth flows

4. **Proposed Security Annotations** (RFC, not yet standard)
   - `sensitiveHint`: low/medium/high sensitivity levels
   - `privateHint`: internal/organizational data
   - `maliciousActivityHint`: detected threats
   - Status: Under discussion in [Issue #711](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/711)

#### What Claude Code Supports:

| Feature | Support Level |
|---------|--------------|
| Tool annotations (`readOnlyHint`, etc.) | Yes (display hints) |
| Content `audience` annotations | Yes (advisory) |
| Direct-to-user display bypassing LLM | **No** |
| Sensitive data special handling | Environment variables only |
| Elicitation (URL mode) | **No** |

**Practical Implication**:
- We cannot prevent sensitive data from reaching the LLM via annotations alone
- Must implement server-side masking/redaction for secrets
- API keys should be handled via environment variables, never returned in responses

---

### 1.2 Resend API Analysis

**API Summary:**
- **Base URL**: `https://api.resend.com`
- **Version**: 1.1.0
- **Auth**: Bearer token (`re_xxxxxxxxx`)
- **Rate Limit**: 2 req/sec (upgradeable)

**Complete Tool Inventory (68 tools across 12 categories):**

| Category | Read | Write | Delete | Total |
|----------|------|-------|--------|-------|
| Emails | 4 | 4 | 0 | 8 |
| Received Emails | 4 | 0 | 0 | 4 |
| Domains | 2 | 3 | 1 | 6 |
| API Keys (Sensitive) | 1 | 1 | 1 | 3 |
| Templates | 2 | 4 | 1 | 7 |
| Audiences | 2 | 1 | 1 | 4 |
| Contacts | 4 | 4 | 3 | 11 |
| Segments | 2 | 1 | 1 | 4 |
| Topics | 2 | 2 | 1 | 5 |
| Contact Properties | 2 | 2 | 1 | 5 |
| Broadcasts | 2 | 3 | 1 | 6 |
| Webhooks (Sensitive) | 2 | 2 | 1 | 5 |
| **TOTAL** | **29** | **27** | **12** | **68** |

**Sensitive Operations Requiring Special Handling:**

1. **HIGH Sensitivity**:
   - `POST /api-keys` - Returns token only once (never retrievable again)
   - `POST /webhooks` - Returns `signing_secret`
   - `GET /webhooks/{id}` - Contains `signing_secret`

2. **Destructive Operations** (require confirmation):
   - All DELETE endpoints
   - `POST /broadcasts/{id}/send` (irreversible)

---

### 1.3 Licensing Recommendation

**Recommendation: AGPL v3 with Dual-Licensing Option**

| Your Goal | How AGPL Achieves It |
|-----------|---------------------|
| Keep project open source | OSI-approved ✓ |
| Prevent "clone and claim" | Copyleft + network clause forces disclosure |
| Use in your own commercial services | As copyright holder, you're exempt |
| Maintain attribution | Required by license |

**Why not MIT?**
- Anyone can fork, make proprietary changes, and compete without contributing back
- Only requires attribution in copyright notice

**Why not GPL v3?**
- SaaS loophole: Running modified code as a service doesn't trigger copyleft
- MCP servers typically run as services

**AGPL Benefits:**
- Network clause closes the SaaS loophole
- If someone modifies and deploys, they must share source
- You retain full commercial rights as copyright holder

**Implementation:**
```
LICENSE: AGPL-3.0-or-later

For commercial licensing inquiries: [your email]
```

**Important for Contributors:**
- Require a Contributor License Agreement (CLA) for external contributions
- This preserves your ability to dual-license

---

### 1.4 Resend Terms of Service Compliance

**Key Finding: Building this MCP server is fully compliant.**

**Evidence:**
1. Resend has an **official MCP server** ([resend/mcp-send-email](https://github.com/resend/mcp-send-email)) under MIT license
2. No ToS restrictions on API wrappers or third-party integrations found
3. Multiple community MCP servers exist without issues
4. Resend provides open-source SDKs for multiple languages

**Requirements to Comply:**
1. Users must provide their own Resend API key
2. Must not circumvent rate limits (2 req/sec)
3. Must not violate Acceptable Use Policy (complaint rate < 0.08%, bounce rate < 4%)
4. Include disclaimer that project is unofficial

**Required Disclaimer for README:**
```markdown
## Disclaimer

This is an unofficial, community-maintained MCP server. It is not affiliated with,
officially maintained, or endorsed by Resend (Plus Five Five, Inc.).

Users must:
- Have their own Resend account and API key
- Comply with Resend's [Terms of Service](https://resend.com/legal/terms-of-service)
- Comply with Resend's [Acceptable Use Policy](https://resend.com/legal/acceptable-use)
- Follow applicable email regulations (CAN-SPAM, GDPR, etc.)
```

---

## Part 2: Architecture Design

### 2.1 Project Structure

```
resend-mcp-server/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── config/
│   │   ├── environment.ts          # Environment validation (Zod)
│   │   └── constants.ts            # API constants, rate limits
│   ├── services/
│   │   ├── resend-client.ts        # Resend API client wrapper
│   │   └── rate-limiter.ts         # Rate limiting implementation
│   ├── tools/
│   │   ├── index.ts                # Tool registry
│   │   ├── emails/
│   │   │   ├── send-email.ts
│   │   │   ├── send-batch-emails.ts
│   │   │   ├── list-emails.ts
│   │   │   ├── get-email.ts
│   │   │   ├── update-email.ts
│   │   │   └── cancel-email.ts
│   │   ├── domains/
│   │   │   ├── create-domain.ts
│   │   │   ├── list-domains.ts
│   │   │   ├── get-domain.ts
│   │   │   ├── update-domain.ts
│   │   │   ├── delete-domain.ts
│   │   │   └── verify-domain.ts
│   │   ├── templates/
│   │   │   └── ... (7 tools)
│   │   ├── audiences/
│   │   │   └── ... (4 tools)
│   │   ├── contacts/
│   │   │   └── ... (11 tools)
│   │   ├── broadcasts/
│   │   │   └── ... (6 tools)
│   │   ├── api-keys/
│   │   │   └── ... (3 tools - sensitive)
│   │   └── webhooks/
│   │       └── ... (5 tools - sensitive)
│   ├── types/
│   │   ├── index.ts                # Shared TypeScript types
│   │   ├── resend.ts               # Resend API types
│   │   └── mcp.ts                  # MCP-specific types
│   └── utils/
│       ├── errors.ts               # Error handling
│       ├── validation.ts           # Input validation helpers
│       └── masking.ts              # Sensitive data masking
├── tests/
│   └── ... (mirror src structure)
├── package.json
├── tsconfig.json
├── LICENSE                          # AGPL-3.0
├── CONTRIBUTING.md                  # CLA requirement
├── README.md
└── CLAUDE.md                        # AI development guidelines
```

### 2.2 Security Implementation Strategy

Since MCP annotations cannot guarantee LLM bypass, implement server-side protections:

```typescript
// src/utils/masking.ts
export function maskApiKey(key: string): string {
  if (!key) return "";
  // Show first 6 and last 4 characters only
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export function maskWebhookSecret(secret: string): string {
  // Never return the actual secret in list operations
  return "********";
}

// For sensitive operations, add explicit warnings in descriptions
const createApiKeyTool = {
  name: "create_api_key",
  description: `Creates a new Resend API key.
    ⚠️ IMPORTANT: The API token will be shown ONLY ONCE and cannot be retrieved later.
    Store it securely immediately after creation.`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false
  }
};
```

### 2.3 Tool Annotation Strategy

Apply consistent annotations for client UX:

```typescript
// Read-only tools (list, get operations)
{ readOnlyHint: true, destructiveHint: false, idempotentHint: true }

// Write tools (create, update)
{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }

// Delete tools
{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }

// Send operations (emails, broadcasts)
{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
```

### 2.4 Rate Limiting Strategy (Transparent Wait)

The MCP server will handle rate limiting by transparently waiting the necessary time before making requests, rather than failing:

```typescript
// src/services/rate-limiter.ts
export class RateLimiter {
  private lastRequestTime = 0;
  private readonly minInterval = 500; // 2 requests per second = 500ms between requests

  /**
   * Waits until it's safe to make the next request.
   * This is transparent to the caller - the request will simply take longer.
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await this.delay(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage in resend-client.ts
class ResendClient {
  private rateLimiter = new RateLimiter();

  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Wait for rate limit slot (transparent to caller)
    await this.rateLimiter.waitForSlot();

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers
      }
    });

    // Handle 429 with retry (in case of burst or server-side rate limit)
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "1", 10) * 1000;
      await this.delay(retryAfter);
      return this.request<T>(endpoint, options);
    }

    return response.json();
  }
}
```

### 2.5 Graceful Cancellation Handling

Per MCP best practices, handle tool call interruptions gracefully:

```typescript
// src/utils/cancellation.ts
export class CancellationToken {
  private _isCancelled = false;

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  cancel(): void {
    this._isCancelled = true;
  }

  throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new OperationCancelledError("Operation was cancelled by the client");
    }
  }
}

export class OperationCancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationCancelledError";
  }
}

// In tool execution
async function executeTool(args: unknown, cancellation: CancellationToken): Promise<ToolResult> {
  // Check for cancellation at safe points
  cancellation.throwIfCancelled();

  // Do work...
  await someOperation();

  // Check again after async operations
  cancellation.throwIfCancelled();

  return result;
}
```

For batch operations, support partial results:

```typescript
async function sendBatchEmails(
  emails: Email[],
  cancellation: CancellationToken
): Promise<BatchResult> {
  const results: EmailResult[] = [];
  const errors: EmailError[] = [];

  for (const email of emails) {
    // Check for cancellation before each email
    if (cancellation.isCancelled) {
      return {
        completed: results,
        errors,
        cancelled: true,
        remaining: emails.length - results.length - errors.length
      };
    }

    try {
      const result = await sendEmail(email);
      results.push(result);
    } catch (error) {
      errors.push({ email: email.to, error: error.message });
    }
  }

  return { completed: results, errors, cancelled: false, remaining: 0 };
}
```

---

## Part 3: Implementation Roadmap

### Phase 1: Core Infrastructure (Foundation)

**Goals**: Set up project structure, authentication, and basic tooling

1. Initialize TypeScript project with ES modules
2. Set up Zod environment validation for `RESEND_API_KEY`
3. Create Resend API client with:
   - Bearer token authentication
   - Rate limiting (transparent wait approach)
   - Structured error handling
   - Cancellation support
4. Implement MCP server skeleton with stdio transport
5. Create tool registration system

**Deliverables**:
- Working MCP server that connects via stdio
- `list_tools` returns empty array
- Rate limiter utility (wait-based)

### Phase 2: Email Operations (Core Value)

**Goals**: Implement primary email functionality

1. `send_email` - Send single email (with idempotency support)
2. `send_batch_emails` - Send up to 100 emails (with partial cancellation support)
3. `list_emails` - Paginated email list
4. `get_email` - Retrieve email by ID

**Deliverables**:
- Can send emails via Claude Code
- Pagination working
- Error handling for common cases (invalid recipients, rate limits)

### Phase 3: Domain Management

**Goals**: Enable domain setup and verification

1. `create_domain` - Create domain with region selection
2. `list_domains` - List all domains
3. `get_domain` - Get domain details with DNS records
4. `verify_domain` - Trigger verification
5. `update_domain` - Update tracking/TLS settings
6. `delete_domain` - Remove domain (with confirmation warning)

**Deliverables**:
- Full domain lifecycle management
- DNS record guidance for verification

### Phase 4: Contact & Audience Management

**Goals**: Enable subscriber list management

1. Audience CRUD (4 tools)
2. Contact CRUD (6 tools)
3. Contact segment operations (3 tools)
4. Contact topic operations (2 tools)

**Deliverables**:
- Can build and manage subscriber lists
- Contact import/export via API

### Phase 5: Templates

**Goals**: Enable reusable email templates

1. Template CRUD (5 tools)
2. `publish_template` - Make template usable
3. `duplicate_template` - Clone existing template

**Deliverables**:
- Template management
- Integration with `send_email` template parameter

### Phase 6: Broadcasts

**Goals**: Enable marketing campaign management

1. Broadcast CRUD (4 tools)
2. `send_broadcast` - Send or schedule broadcast
3. `delete_broadcast` - Remove draft only

**Deliverables**:
- Full broadcast campaign lifecycle

### Phase 7: Advanced Features

**Goals**: Complete API coverage

1. Segments (4 tools)
2. Topics (5 tools)
3. Contact Properties (5 tools)
4. Received Emails (4 tools)
5. Email Attachments (2 tools)

**Deliverables**:
- Complete non-sensitive API coverage

### Phase 8: Sensitive Operations (Final)

**Goals**: Implement with extra safeguards

1. API Keys (3 tools)
   - `create_api_key` with one-time token warning
   - `list_api_keys` with masked tokens
   - `delete_api_key` with confirmation

2. Webhooks (5 tools)
   - `create_webhook` with secret handling
   - `get_webhook` with secret masking option
   - `list_webhooks` with secrets masked
   - `update_webhook`
   - `delete_webhook`

**Deliverables**:
- Full API coverage (68 tools)
- Sensitive data properly handled

---

## Part 4: GitHub Repository Setup

### 4.1 Repository Configuration

**Name**: `resend-mcp-server`
**Owner**: `gui-wf`
**Visibility**: Public
**Description**: "Comprehensive MCP Server for Resend API - manage emails, domains, templates, contacts, and more via AI assistants"

**Topics**: `mcp`, `resend`, `email`, `ai`, `claude`, `model-context-protocol`, `typescript`

### 4.2 Initial Files

1. **LICENSE** - AGPL-3.0-or-later
2. **README.md** - Installation, usage, disclaimer
3. **CONTRIBUTING.md** - CLA requirement, code standards
4. **CLAUDE.md** - AI development guidelines (from existing)
5. **.gitignore** - Node.js defaults
6. **package.json** - Initial dependencies
7. **tsconfig.json** - TypeScript configuration

### 4.3 Branch Protection

- Require PR reviews for `main`
- Require status checks (tests, lint)
- No force pushes to `main`

---

## Part 5: Questions for Clarification

Before proceeding with GitHub repository creation, please confirm:

1. **License**: Proceed with AGPL-3.0? (Allows your commercial use while preventing others from proprietarizing)

2. **Repository Name**: `resend-mcp-server` or prefer something else?

3. **Initial Scope**: Start with Phase 1-2 (core + emails) or different priority?

4. **CLA Approach**: Simple CLA in CONTRIBUTING.md or formal CLA bot integration?

5. **npm Publishing**: Plan to publish to npm registry? (Affects package.json setup)

---

## Appendix A: Sensitive Data Handling Summary

| Data Type | MCP Approach | Our Implementation |
|-----------|--------------|-------------------|
| API Key (user's) | Environment variable | `RESEND_API_KEY` env var |
| Created API tokens | Cannot hide from LLM | Warn user in response, mask in lists |
| Webhook secrets | Cannot hide from LLM | Warn user, mask in lists |
| PII (contacts) | Annotations (advisory) | Add `audience: ["user", "assistant"]` |
| Email content | Annotations (advisory) | No special handling needed |

## Appendix B: Error Response Format

```typescript
// Standard MCP error response
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      error: true,
      code: "rate_limit_exceeded",
      message: "Rate limit exceeded. Please wait and try again.",
      retryAfter: 1000
    }, null, 2)
  }],
  isError: true
};

// Cancellation response
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      cancelled: true,
      completed: 45,
      remaining: 55,
      message: "Operation cancelled. 45 emails were sent before cancellation."
    }, null, 2)
  }],
  isError: false
};
```

## Appendix C: MCP Cancellation Best Practices

Per MCP specification, servers should:

1. **Check for cancellation at safe points** - Before starting new operations, after async calls
2. **Support partial results** - Return what was completed before cancellation
3. **Clean up resources** - Ensure no leaks when cancelled mid-operation
4. **Provide status information** - Tell the user what was/wasn't completed

```typescript
// Server-side notification handler for cancellation
server.setNotificationHandler(
  "notifications/cancelled",
  async (notification) => {
    const { requestId, reason } = notification.params;
    // Signal the operation to stop
    activeCancellationTokens.get(requestId)?.cancel();
  }
);
```
