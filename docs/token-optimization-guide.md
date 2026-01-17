# Token-Efficient MCP Server Design Guide

Best practices for building MCP servers that minimize LLM context usage while maximizing effectiveness. Compiled from 2025-2026 research and production case studies.

---

## Executive Summary

### Key Findings

1. **Tool definitions consume 400-2,500 tokens each** depending on schema complexity and description length. A 25-30 tool server statically loaded consumes 35,000-75,000 tokens before any work begins.

2. **Dynamic toolsets reduce overhead by 85-98%**. Using semantic search or progressive discovery, a 25-tool server can operate with only 4,000-8,000 tokens of tool overhead per task.

3. **Optimal tool description length is 50-150 characters**. Concise descriptions that clearly convey purpose, inputs, and outputs outperform verbose documentation.

4. **Tool selection accuracy degrades above 20-30 tools**. Error rates increase from 0.5-1% (5-6 tools) to 2-8% (25+ tools) without dynamic discovery.

5. **Examples improve accuracy by 18-25%**. Adding 1-5 input examples per tool improved accuracy from 72% to 90% in Anthropic testing.

### Recommendations for Resend MCP Server

| Aspect | Recommendation |
|--------|----------------|
| Tool count | 25-30 tools with scope-based filtering |
| Tool exposure | Implement dynamic discovery via `--scope` filtering |
| Description length | 80-150 characters per tool |
| Parameter descriptions | No duplication; unique context only |
| Response format | Structured JSON with minified output |
| Documentation search | Single tool with semantic search, not full context |

---

## 1. Tool Schema Best Practices

### 1.1 Tool Definition Token Costs

Based on production measurements:

| Component | Tokens | Notes |
|-----------|--------|-------|
| Tool name | 10-20 | Short, specific names |
| Description | 50-200 | 80-150 chars optimal |
| Input schema | 500-1,500 | Depends on parameters |
| Output schema | 200-500 | Optional but recommended |
| Examples | 100-300 each | 1-5 examples optimal |
| **Total per tool** | **800-2,500** | Varies by complexity |

**Example token breakdown for a Resend tool:**

```json
{
  "name": "send_email",                    // ~5 tokens
  "description": "Send an email via Resend API with to, subject, and body fields.",  // ~20 tokens
  "inputSchema": {
    "type": "object",
    "properties": {
      "to": {"type": "string", "description": "Recipient email address"},
      "subject": {"type": "string", "description": "Email subject line"},
      "html": {"type": "string", "description": "HTML body content"}
    },
    "required": ["to", "subject", "html"]
  }  // ~150 tokens
}
// Total: ~175 tokens (minimal tool)
// With detailed schema + examples: ~800-1,200 tokens
```

### 1.2 Parameter Naming Conventions

**Do:**
- Use specific, unambiguous names: `recipient_email`, `email_subject`, `domain_id`
- Include units where relevant: `delay_seconds`, `size_bytes`
- Match API terminology for consistency

**Avoid:**
- Generic names: `data`, `input`, `value`, `id`
- Abbreviations: `msg`, `addr`, `cfg`
- Similar names for different tools: `query` vs `search` vs `find`

### 1.3 Description Writing Guidelines

**Optimal length: 80-150 characters**

Research shows descriptions should:
- State what the tool does (not how)
- Specify required inputs briefly
- Mention key constraints or limitations

**Good examples:**

```
"Send an email through Resend. Requires verified sender domain."
"List all contacts in an audience. Returns paginated results."
"Delete a domain. This action is irreversible."
```

**Avoid:**

```
// Too verbose (300+ chars)
"This tool allows you to send an email using the Resend API. You must provide
a recipient email address, a subject line, and either HTML or plain text body
content. The sender must be from a verified domain..."

// Too terse
"Send email"

// Duplicates parameter info
"Send email to recipient (to) with subject (subject) and body (html/text)"
```

### 1.4 Required vs Optional Parameters

**Guidelines:**
- Mark only truly required parameters as `required`
- Use sensible defaults for optional parameters
- Document defaults in parameter descriptions
- Limit required parameters to 3-5 per tool

**Anti-pattern:** Tools with 10+ optional parameters that confuse selection:

```json
// Bad: Too many parameters
{
  "name": "send_email",
  "inputSchema": {
    "properties": {
      "to": {},
      "cc": {},
      "bcc": {},
      "reply_to": {},
      "subject": {},
      "html": {},
      "text": {},
      "headers": {},
      "attachments": {},
      "tags": {},
      "scheduled_at": {},
      "idempotency_key": {}
    },
    "required": ["to", "subject"]
  }
}
```

**Better:** Split into focused tools:

```json
// send_email - basic sending
// send_scheduled_email - with scheduling
// send_email_with_attachments - with files
```

### 1.5 When to Use Enums vs Free-Form Strings

**Use enums when:**
- Values are finite and known (status codes, domains)
- Invalid values cause API errors
- Options are unlikely to change frequently

**Use free-form strings when:**
- Values are user-provided (email addresses, content)
- Options may expand (tag names, categories)
- Validation happens server-side

```json
// Good: enum for known states
"status": {
  "type": "string",
  "enum": ["pending", "sent", "delivered", "bounced"],
  "description": "Filter by email status"
}

// Good: string for user content
"subject": {
  "type": "string",
  "description": "Email subject line (max 998 chars)"
}
```

---

## 2. Tool Organization Strategies

### 2.1 Optimal Tool Count

**Context window impact by tool count:**

| Tools | Tokens (static) | 200K Window Usage | Recommendation |
|-------|-----------------|-------------------|----------------|
| 10 | 8,000-15,000 | 4-7.5% | Ideal for focused servers |
| 20 | 16,000-30,000 | 8-15% | Manageable |
| 30 | 24,000-45,000 | 12-22.5% | Use scoping/filtering |
| 50 | 40,000-75,000 | 20-37.5% | Requires dynamic discovery |
| 100+ | 80,000-150,000+ | 40-75%+ | Must use lazy loading |

**For the Resend MCP server with 25-30 tools:**
- Static exposure is viable but not optimal
- Scope-based filtering (`--scope read`) reduces active tools to 10-15
- Recommended: Implement `--scope` parameter from Speakeasy generation

### 2.2 Tool Grouping Strategies

**By resource type (recommended for APIs):**

```
emails/
  send_email
  send_batch_emails
  get_email
  list_emails
  cancel_email

domains/
  create_domain
  get_domain
  list_domains
  delete_domain
  verify_domain

contacts/
  create_contact
  get_contact
  list_contacts
  update_contact
  delete_contact
```

**By operation scope:**

```
read:   get_*, list_*, search_*
write:  create_*, update_*, send_*
admin:  delete_*, verify_*, configure_*
```

### 2.3 Naming Conventions

**Recommended pattern:** `{resource}_{action}` or `{action}_{resource}`

| Pattern | Example | Notes |
|---------|---------|-------|
| `resource_action` | `email_send`, `domain_verify` | Groups by resource |
| `action_resource` | `send_email`, `verify_domain` | Groups by action |
| Namespaced | `resend_send_email` | For multi-server setups |

**Speakeasy-specific:** Use `x-speakeasy-mcp` to customize generated names:

```yaml
paths:
  /emails:
    post:
      x-speakeasy-mcp:
        tool-name: send_email
        description: "Send an email via Resend API"
        scopes:
          - write
```

### 2.4 When to Combine vs Split Tools

**Combine when:**
- Operations share authentication/rate limits
- Steps are always performed together
- Separate tools would require back-to-back calls

**Split when:**
- Operations have different permission requirements
- Users commonly need one without the other
- Error handling differs significantly

**Example - Combine:**
```
// Instead of: get_contact + update_contact (for simple changes)
upsert_contact: "Create or update a contact by email address"
```

**Example - Split:**
```
// Instead of: manage_domain (create/update/delete/verify)
create_domain
update_domain
delete_domain
verify_domain
```

---

## 3. Response Format Optimization

### 3.1 Structured vs Unstructured Responses

**Always use structured JSON responses.** Benefits:
- Predictable parsing
- Smaller token footprint
- Better for agentic workflows

**Response structure pattern:**

```typescript
// Success response
{
  content: [{
    type: "text",
    text: JSON.stringify({
      success: true,
      data: { /* minimal relevant fields */ },
      metadata: { /* optional: pagination, etc. */ }
    })
  }]
}

// Error response
{
  content: [{
    type: "text",
    text: JSON.stringify({
      success: false,
      error: {
        code: "validation_error",
        message: "Invalid email format",
        field: "to"
      }
    })
  }],
  isError: true
}
```

### 3.2 Minimize Response Payload Size

**Techniques:**
1. Return only relevant fields (not full API response)
2. Use abbreviated field names where clear
3. Exclude null/empty values
4. Limit array sizes with pagination

**Before (verbose):**
```json
{
  "email_message_id": "msg_123abc",
  "email_status": "sent",
  "email_created_at": "2025-01-16T10:00:00Z",
  "email_from_address": "sender@example.com",
  "email_to_addresses": ["recipient@example.com"],
  "email_subject_line": "Hello",
  "email_html_body": "<html>...</html>",
  "email_text_body": "...",
  "email_headers": {},
  "email_tags": []
}
```

**After (optimized):**
```json
{
  "id": "msg_123abc",
  "status": "sent",
  "to": "recipient@example.com"
}
```

**Token savings:** ~70% reduction (from ~150 tokens to ~45 tokens)

### 3.3 Pagination Strategy

**When to paginate:**
- Results > 10 items
- Individual items > 100 tokens each
- Total response would exceed 2,000 tokens

**Pagination pattern:**

```typescript
// Tool parameter
"limit": {
  "type": "integer",
  "default": 10,
  "maximum": 100,
  "description": "Max results to return (default: 10)"
}

// Response includes cursor
{
  "data": [...],
  "pagination": {
    "has_more": true,
    "next_cursor": "cursor_abc123"
  }
}
```

### 3.4 Error Message Guidelines

**Balance brevity with actionability:**

```typescript
// Good: Actionable, specific
{
  error: {
    code: "invalid_domain",
    message: "Domain not verified. Run verify_domain first.",
    field: "from"
  }
}

// Bad: Too vague
{
  error: "Invalid request"
}

// Bad: Too verbose
{
  error: "The domain you specified in the 'from' field has not been
          verified with Resend. Please navigate to your Resend dashboard
          at https://resend.com/domains and complete the DNS verification
          process before attempting to send emails from this domain..."
}
```

---

## 4. MCP-Specific Best Practices

### 4.1 Tool Annotations

Use MCP annotations to help clients make informed decisions:

```typescript
{
  name: "delete_domain",
  description: "Permanently delete a domain from Resend",
  annotations: {
    readOnlyHint: false,      // Modifies state
    destructiveHint: true,    // Irreversible deletion
    idempotentHint: true,     // Safe to retry (second call succeeds)
    openWorldHint: false      // Closed domain (Resend API only)
  }
}
```

**Annotation meanings:**

| Annotation | Default | Meaning |
|------------|---------|---------|
| `readOnlyHint` | `false` | `true` = does not modify state |
| `destructiveHint` | `true` | `true` = may delete/replace data |
| `idempotentHint` | `false` | `true` = repeated calls have same effect |
| `openWorldHint` | `true` | `true` = interacts with external systems |

**Recommended annotations for Resend tools:**

| Tool type | readOnly | destructive | idempotent | openWorld |
|-----------|----------|-------------|------------|-----------|
| `get_*`, `list_*` | true | false | true | false |
| `create_*` | false | false | false | false |
| `update_*` | false | false | true | false |
| `delete_*` | false | true | true | false |
| `send_email` | false | false | false | true |

### 4.2 Resources vs Tools Trade-offs

**Use Resources for:**
- Static reference data (API documentation, configuration)
- Content that changes infrequently
- Data the user explicitly selects to include

**Use Tools for:**
- Dynamic operations (send email, create domain)
- Real-time data queries (list emails, get status)
- Actions the AI decides to invoke

**For Resend MCP server:**
- Tools: All API operations (send, create, list, etc.)
- Resources: API documentation, rate limit info, error code reference

### 4.3 Context Window Management

**Token budget for 200K context (Claude Sonnet):**

| Category | Tokens | % |
|----------|--------|---|
| System prompt | 3,000-5,000 | 2.5% |
| System tools | 14,000-20,000 | 10% |
| MCP tools (25 tools, scoped) | 15,000-25,000 | 12.5% |
| Memory files (CLAUDE.md) | 3,000-8,000 | 4% |
| Autocompact buffer | 45,000 | 22.5% |
| **Available for work** | **100,000-120,000** | **50-60%** |

**Optimization strategies:**
1. Implement scope-based filtering to reduce active tools
2. Use concise tool descriptions
3. Return minimal response payloads
4. Implement pagination for list operations

---

## 5. Optimization Checklist

### Pre-Development
- [ ] Define tool scopes (read, write, admin)
- [ ] Plan tool grouping by resource
- [ ] Identify candidates for combining/splitting
- [ ] Set token budget targets

### Tool Schema Design
- [ ] Tool names are specific and unambiguous
- [ ] Descriptions are 80-150 characters
- [ ] Required parameters limited to 3-5
- [ ] Enums used for finite value sets
- [ ] Parameter descriptions don't duplicate tool description

### Response Design
- [ ] Responses are structured JSON
- [ ] Only relevant fields returned
- [ ] Pagination implemented for list operations
- [ ] Error messages are actionable

### MCP Configuration
- [ ] Tool annotations set appropriately
- [ ] Scope filtering implemented
- [ ] Destructive operations clearly marked

### Testing
- [ ] Token usage measured per tool
- [ ] Tool selection accuracy tested
- [ ] Response sizes verified
- [ ] Error handling validated

---

## 6. Token Budget Estimate: Resend MCP Server

### Projected Token Usage (25-30 Tools)

**Static exposure (all tools loaded):**

| Category | Tools | Tokens/Tool | Total |
|----------|-------|-------------|-------|
| Email operations | 8 | 1,200 | 9,600 |
| Domain operations | 6 | 1,000 | 6,000 |
| Contact operations | 5 | 1,000 | 5,000 |
| Audience operations | 4 | 1,000 | 4,000 |
| API key operations | 3 | 800 | 2,400 |
| Webhook operations | 4 | 1,000 | 4,000 |
| **Total** | **30** | - | **31,000** |

**With scope filtering (read scope only):**

| Category | Tools | Tokens/Tool | Total |
|----------|-------|-------------|-------|
| get_* tools | 6 | 800 | 4,800 |
| list_* tools | 6 | 1,000 | 6,000 |
| **Total** | **12** | - | **10,800** |

**Savings: 65% reduction** with scope filtering

### Per-Request Token Costs

| Operation | Tool Tokens | Response Tokens | Total |
|-----------|-------------|-----------------|-------|
| Send email | 1,200 | 200 | 1,400 |
| List emails | 1,000 | 800 (10 results) | 1,800 |
| Get email | 800 | 400 | 1,200 |
| Create domain | 1,000 | 150 | 1,150 |

---

## 7. Speakeasy-Specific Tips

### 7.1 OpenAPI Optimization

Before generation, optimize your OpenAPI spec:

```yaml
# Add Speakeasy MCP extensions
paths:
  /emails:
    post:
      operationId: sendEmail
      x-speakeasy-mcp:
        tool-name: send_email
        description: "Send an email via Resend API"
        scopes:
          - write
      summary: Send an email  # Keep short
```

### 7.2 Pruning Unnecessary Tools

Use `x-speakeasy-mcp: { disabled: true }` to exclude endpoints:

```yaml
paths:
  /internal/debug:
    get:
      x-speakeasy-mcp:
        disabled: true  # Not useful for LLM agents
```

### 7.3 Scope Configuration

Configure scopes via overlays or runtime flags:

```yaml
# OpenAPI overlay for scopes
x-speakeasy-mcp:
  scopes:
    read:
      - GET
      - HEAD
    write:
      - POST
      - PUT
      - PATCH
    admin:
      - DELETE
```

Runtime usage:
```bash
# Only expose read tools
resend-mcp-server --scope read

# Expose read and write
resend-mcp-server --scope read --scope write
```

### 7.4 Post-Generation Optimization

After Speakeasy generation:

1. **Review generated descriptions** - Shorten if verbose
2. **Add input examples** - 1-3 examples for complex tools
3. **Implement response minification** - Transform API responses
4. **Add error handling** - Actionable error messages

---

## 8. Documentation Search Tool Design

### 8.1 Recommended Approach

For the Resend docs search tool, use **semantic search with pre-built embeddings** rather than loading full documentation into context.

**Architecture:**
```
1. Build Phase (CI/CD):
   - Fetch docs from https://resend.com/docs/llms-full.txt
   - Chunk into sections (500-1000 tokens each)
   - Generate embeddings for each chunk
   - Store in vector database (shipped with MCP server)

2. Runtime:
   - Single tool: search_docs(query, limit=5)
   - Returns relevant chunks only
   - Token cost: ~2,000-3,000 per search
```

### 8.2 Tool Definition

```typescript
{
  name: "search_resend_docs",
  description: "Search Resend API documentation. Returns relevant sections for your query.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language search query"
      },
      limit: {
        type: "integer",
        default: 5,
        maximum: 10,
        description: "Max results to return"
      }
    },
    required: ["query"]
  }
}
```

### 8.3 Why Not Full Context?

Loading `llms-full.txt` directly:
- Full doc: ~50,000-100,000 tokens
- Uses 25-50% of context window
- Most content irrelevant to any single query

Semantic search approach:
- Tool definition: ~200 tokens
- Search results: ~2,000-3,000 tokens
- **95% more efficient**

### 8.4 Implementation Notes

1. **Pre-compute embeddings** at build time, not runtime
2. **Chunk by section headers** for coherent results
3. **Include code examples** in chunks (high value)
4. **Update embeddings** when docs change (CI/CD integration)

---

## 9. Anti-Patterns to Avoid

### 9.1 Common Mistakes

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Verbose descriptions | Wastes tokens | Keep to 80-150 chars |
| Duplicate info | Parameters repeat tool description | Unique context only |
| Generic names | Tool selection errors | Specific, unambiguous names |
| All optional params | Confuses model | Split into focused tools |
| Full API responses | Context bloat | Return minimal fields |
| No pagination | Unbounded responses | Limit and paginate |
| Missing annotations | Safety risks | Add readOnly/destructive hints |
| Static toolsets | Token waste | Implement scope filtering |

### 9.2 Security Anti-Patterns

| Anti-Pattern | Risk | Solution |
|--------------|------|----------|
| Embedded credentials | Exposure in logs/context | External credential store |
| No input validation | Injection attacks | Zod schema validation |
| Trusting tool descriptions | Prompt injection | Validate server-side |
| Over-permissioning | Unauthorized actions | Scope-based access |

---

## 10. References

### Primary Sources

1. Anthropic Engineering - "Writing effective tools for agents"
   https://www.anthropic.com/engineering/writing-tools-for-agents

2. Anthropic Engineering - "Advanced tool use"
   https://www.anthropic.com/engineering/advanced-tool-use

3. MCP Specification - Tool Annotations
   https://modelcontextprotocol.io/specification/2025-06-18/server/tools

4. Speakeasy - "Lessons from 50+ Production MCP Servers"
   https://www.speakeasy.com/blog/generating-mcp-from-openapi-lessons-from-50-production-servers

5. Speakeasy - "100x Token Reduction with Dynamic Toolsets"
   https://www.speakeasy.com/blog/100x-token-reduction-dynamic-toolsets

### Additional Research

6. Axiom - "Designing MCP Servers for Wide Events"
   https://axiom.co/blog/designing-mcp-servers-for-wide-events
   (Token efficiency: 29% savings with CSV vs JSON)

7. Merge - "MCP Best Practices"
   https://www.merge.dev/blog/mcp-best-practices

8. MCP Discussion - Tool Count Context Saturation
   https://github.com/orgs/modelcontextprotocol/discussions/532
   (400-500 tokens per tool benchmark)

9. Anthropic Docs - Context Window Management
   https://platform.claude.com/docs/en/build-with-claude/context-windows

10. Eric Ma - "How to Expose Documentation to LLM Agents"
    https://ericmjl.github.io/blog/2025/10/19/how-to-expose-any-documentation-to-any-llm-agent/

### Pricing References

11. Anthropic API Pricing (2026)
    https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration

12. LLM API Pricing Comparison 2025
    https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025

---

*Document version: 1.0*
*Last updated: 2026-01-16*
*Target: Resend MCP Server with 25-30 tools*
