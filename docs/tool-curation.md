# Resend MCP Server - Tool Curation

**Last Updated**: 2026-01-21
**Status**: Phase 1 - Foundation Complete
**Source**: Resend API Reference (https://resend.com/docs/api-reference)

---

## Executive Summary

This document catalogs all Resend API endpoints and classifies them into three tiers for MCP tool exposure. The classification balances token efficiency with functionality, ensuring the most commonly used operations are always available while more specialized operations can be loaded on demand.

### Classification Summary

| Tier | Tool Count | Token Budget | Description |
|------|------------|--------------|-------------|
| Core (Tier 1) | 5-7 | ~6,000-8,000 | Always loaded, essential operations |
| Secondary (Tier 2) | 12-15 | ~12,000-15,000 | Loaded on demand, CRUD operations |
| Tertiary (Tier 3) | 10-12 | ~10,000-12,000 | Advanced/destructive operations |
| Excluded | 3-5 | N/A | Security-sensitive, not exposed |

**Total Endpoints**: ~50-55 operations
**Recommended Initial Exposure**: Core tier only (~6,000 tokens)

---

## Complete Endpoint Inventory

### 1. Email Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/emails` | POST | send_email | Core | write | Primary use case |
| `/emails/batch` | POST | send_batch_emails | Tertiary | write | Up to 100 emails |
| `/emails` | GET | list_emails | Core | read | Paginated results |
| `/emails/{id}` | GET | get_email | Core | read | Single email details |
| `/emails/{id}` | PATCH | update_email | Secondary | write | Update scheduled email |
| `/emails/{id}/cancel` | POST | cancel_email | Secondary | write | Cancel scheduled email |
| `/emails/{id}/attachments` | GET | list_email_attachments | Tertiary | read | List sent email attachments |
| `/emails/{id}/attachments/{attachment_id}` | GET | get_email_attachment | Tertiary | read | Single attachment |
| `/emails/received` | GET | list_received_emails | Tertiary | read | Inbound emails |
| `/emails/received/{id}` | GET | get_received_email | Tertiary | read | Single received email |
| `/emails/received/{id}/attachments` | GET | list_received_email_attachments | Tertiary | read | Received email attachments |
| `/emails/received/{id}/attachments/{attachment_id}` | GET | get_received_email_attachment | Tertiary | read | Single received attachment |

### 2. Domain Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/domains` | GET | list_domains | Core | read | Essential for verification |
| `/domains` | POST | create_domain | Secondary | write | Add new domain |
| `/domains/{id}` | GET | get_domain | Secondary | read | Domain details + DNS records |
| `/domains/{id}` | PATCH | update_domain | Secondary | write | Modify domain settings |
| `/domains/{id}` | DELETE | delete_domain | Tertiary | admin | Irreversible |
| `/domains/{id}/verify` | POST | verify_domain | Secondary | write | Trigger DNS verification |

### 3. Contact Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/contacts` | GET | list_contacts | Secondary | read | Paginated |
| `/contacts` | POST | create_contact | Secondary | write | Add to audience |
| `/contacts/{id}` | GET | get_contact | Secondary | read | Single contact |
| `/contacts/{id}` | PATCH | update_contact | Secondary | write | Modify contact |
| `/contacts/{id}` | DELETE | delete_contact | Tertiary | admin | Remove contact |
| `/contacts/{id}/topics` | GET | get_contact_topics | Tertiary | read | Topic subscriptions |
| `/contacts/{id}/topics` | PATCH | update_contact_topics | Tertiary | write | Update subscriptions |
| `/contacts/{id}/segments` | GET | list_contact_segments | Tertiary | read | Segment membership |
| `/contacts/{id}/segments` | POST | add_contact_to_segment | Tertiary | write | Add to segment |
| `/contacts/{id}/segments/{segment_id}` | DELETE | remove_contact_from_segment | Tertiary | admin | Remove from segment |

### 4. Contact Property Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/contact-properties` | GET | list_contact_properties | Tertiary | read | Custom fields |
| `/contact-properties` | POST | create_contact_property | Tertiary | write | Add custom field |
| `/contact-properties/{id}` | GET | get_contact_property | Tertiary | read | Single property |
| `/contact-properties/{id}` | PATCH | update_contact_property | Tertiary | write | Modify property |
| `/contact-properties/{id}` | DELETE | delete_contact_property | Tertiary | admin | Remove property |

### 5. Segment Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/segments` | GET | list_segments | Tertiary | read | Contact segments |
| `/segments` | POST | create_segment | Tertiary | write | New segment |
| `/segments/{id}` | GET | get_segment | Tertiary | read | Single segment |
| `/segments/{id}` | DELETE | delete_segment | Tertiary | admin | Remove segment |

### 6. Topic Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/topics` | GET | list_topics | Secondary | read | Email topics |
| `/topics` | POST | create_topic | Secondary | write | New topic |
| `/topics/{id}` | GET | get_topic | Tertiary | read | Single topic |
| `/topics/{id}` | PATCH | update_topic | Tertiary | write | Modify topic |
| `/topics/{id}` | DELETE | delete_topic | Tertiary | admin | Remove topic |

### 7. Template Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/templates` | GET | list_templates | Secondary | read | Email templates |
| `/templates` | POST | create_template | Secondary | write | New template |
| `/templates/{id}` | GET | get_template | Secondary | read | Single template |
| `/templates/{id}` | PATCH | update_template | Secondary | write | Modify template |
| `/templates/{id}` | DELETE | delete_template | Tertiary | admin | Remove template |
| `/templates/{id}/publish` | POST | publish_template | Secondary | write | Make available |
| `/templates/{id}/duplicate` | POST | duplicate_template | Secondary | write | Copy template |

### 8. Broadcast Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/broadcasts` | GET | list_broadcasts | Tertiary | read | Marketing campaigns |
| `/broadcasts` | POST | create_broadcast | Tertiary | write | New broadcast |
| `/broadcasts/{id}` | GET | get_broadcast | Tertiary | read | Single broadcast |
| `/broadcasts/{id}` | PATCH | update_broadcast | Tertiary | write | Modify broadcast |
| `/broadcasts/{id}` | DELETE | delete_broadcast | Tertiary | admin | Remove broadcast |
| `/broadcasts/{id}/send` | POST | send_broadcast | Tertiary | write | Send to audience |

### 9. Webhook Operations

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/webhooks` | GET | list_webhooks | Secondary | read | Event webhooks |
| `/webhooks` | POST | create_webhook | Secondary | write | New webhook |
| `/webhooks/{id}` | GET | get_webhook | Tertiary | read | Single webhook |
| `/webhooks/{id}` | PATCH | update_webhook | Secondary | write | Modify webhook |
| `/webhooks/{id}` | DELETE | delete_webhook | Tertiary | admin | Remove webhook |

### 10. API Key Operations (EXCLUDED)

| Endpoint | Method | Operation | Tier | Scope | Notes |
|----------|--------|-----------|------|-------|-------|
| `/api-keys` | GET | list_api_keys | **Excluded** | - | Security risk |
| `/api-keys` | POST | create_api_key | **Excluded** | - | Security risk |
| `/api-keys/{id}` | DELETE | delete_api_key | **Excluded** | - | Security risk |

### 11. Documentation Search (Custom Tool)

| Tool | Type | Tier | Scope | Notes |
|------|------|------|-------|-------|
| search_resend_documentation | Custom | Core | read | Semantic search over docs |

---

## Tier Definitions

### Core Tier (Tier 1) - Always Loaded

**Purpose**: Essential operations for daily email workflows
**Token Budget**: ~6,000-8,000 tokens
**Loading**: Automatic on server start

| Tool | Description | Rationale |
|------|-------------|-----------|
| `send_email` | Send a single email | Primary use case |
| `list_emails` | List sent emails with pagination | Status checking |
| `get_email` | Retrieve single email details | Debugging/verification |
| `list_domains` | List verified domains | Domain selection |
| `search_resend_documentation` | Search API docs | Self-service help |

**Alternative Core configurations:**

- **Minimal (4 tools)**: send_email, get_email, list_domains, search_resend_documentation
- **Standard (5 tools)**: Above + list_emails
- **Extended (7 tools)**: Above + create_contact, list_templates

### Secondary Tier (Tier 2) - On-Demand

**Purpose**: CRUD operations for resources
**Token Budget**: ~12,000-15,000 tokens
**Loading**: Via `--scope write` or tier expansion

| Category | Tools |
|----------|-------|
| Domains | create_domain, get_domain, update_domain, verify_domain |
| Contacts | list_contacts, create_contact, get_contact, update_contact |
| Templates | list_templates, create_template, get_template, update_template, publish_template, duplicate_template |
| Topics | list_topics, create_topic |
| Webhooks | list_webhooks, create_webhook, update_webhook |
| Emails | update_email, cancel_email |

### Tertiary Tier (Tier 3) - Advanced/Admin

**Purpose**: Destructive operations, batch processing, advanced features
**Token Budget**: ~10,000-12,000 tokens
**Loading**: Via `--scope admin` or explicit request

| Category | Tools |
|----------|-------|
| Destructive | delete_domain, delete_contact, delete_template, delete_topic, delete_webhook, delete_segment, delete_broadcast, delete_contact_property |
| Batch | send_batch_emails |
| Broadcasts | create_broadcast, get_broadcast, list_broadcasts, update_broadcast, send_broadcast |
| Segments | list_segments, create_segment, get_segment, add_contact_to_segment, remove_contact_from_segment |
| Contact Properties | list_contact_properties, create_contact_property, get_contact_property, update_contact_property |
| Inbound Email | list_received_emails, get_received_email, list_received_email_attachments, get_received_email_attachment |
| Attachments | list_email_attachments, get_email_attachment |
| Topics (Advanced) | get_topic, update_topic, get_contact_topics, update_contact_topics |
| Contacts (Advanced) | list_contact_segments |

### Excluded - Not Exposed

**Purpose**: Security-sensitive operations that should not be accessible via MCP
**Rationale**: API key management could lead to credential theft or unauthorized access

| Operation | Risk |
|-----------|------|
| list_api_keys | Exposes all API keys |
| create_api_key | Could create elevated access |
| delete_api_key | Could disable production access |

---

## Scope Assignments

### Read Scope (`--scope read`)

All GET operations that do not modify state:

```
list_emails, get_email, list_domains, get_domain, list_contacts, get_contact,
list_templates, get_template, list_topics, get_topic, list_webhooks, get_webhook,
list_broadcasts, get_broadcast, list_segments, get_segment,
list_contact_properties, get_contact_property, list_received_emails,
get_received_email, list_email_attachments, get_email_attachment,
list_received_email_attachments, get_received_email_attachment,
get_contact_topics, list_contact_segments, search_resend_documentation
```

### Write Scope (`--scope write`)

POST, PUT, PATCH operations that create or modify resources:

```
send_email, send_batch_emails, create_domain, update_domain, verify_domain,
create_contact, update_contact, create_template, update_template,
publish_template, duplicate_template, create_topic, update_topic,
create_webhook, update_webhook, create_broadcast, update_broadcast,
send_broadcast, create_segment, create_contact_property, update_contact_property,
update_email, cancel_email, add_contact_to_segment, update_contact_topics
```

### Admin Scope (`--scope admin`)

DELETE operations and other destructive/sensitive actions:

```
delete_domain, delete_contact, delete_template, delete_topic, delete_webhook,
delete_broadcast, delete_segment, delete_contact_property,
remove_contact_from_segment
```

---

## Token Efficiency Analysis

### Estimated Token Costs per Tool

| Component | Tokens | Notes |
|-----------|--------|-------|
| Tool name | 5-10 | Short names preferred |
| Description | 30-80 | 80-150 chars target |
| Input schema | 100-400 | Depends on parameters |
| Annotations | 20-40 | MCP hints |
| **Typical total** | **150-500** | Per tool |

### Configuration Scenarios

| Scenario | Tools | Est. Tokens | Use Case |
|----------|-------|-------------|----------|
| Minimal read | 5 | ~2,500 | Status checking only |
| Core only | 5-7 | ~4,000 | Standard transactional email |
| Core + Secondary | 20 | ~12,000 | Full email management |
| All tiers | 45+ | ~25,000 | Admin/power user |

### Recommended Default

**Core tier only** with dynamic expansion:

1. Server starts with 5-7 Core tools (~4,000 tokens)
2. User can request tier expansion: "I need to manage templates"
3. Server loads Secondary tier tools for templates
4. Total increases to ~6,000-8,000 tokens

---

## Implementation Notes

### OpenAPI Overlay Strategy

Use `x-speakeasy-mcp` extensions to configure:

```yaml
paths:
  /emails:
    post:
      x-speakeasy-mcp:
        tool-name: send_email
        tier: core
        scopes: [write]
        description: "Send an email via Resend API"
```

### Exclusion Configuration

```yaml
paths:
  /api-keys:
    get:
      x-speakeasy-mcp:
        disabled: true
        reason: "Security - API key exposure risk"
```

### MCP Annotations

All tools should include appropriate annotations:

```typescript
{
  readOnlyHint: true,      // For GET operations
  destructiveHint: true,   // For DELETE operations
  idempotentHint: true,    // For safe retries
  openWorldHint: false     // Closed API system
}
```

---

## Next Steps

1. **Phase 2**: Create OpenAPI overlays implementing this classification
2. **Phase 3**: Generate MCP server with Speakeasy using overlays
3. **Phase 4**: Implement dynamic tier loading
4. **Phase 5**: Add `search_resend_documentation` custom tool

---

## References

- [Resend API Reference](https://resend.com/docs/api-reference/introduction)
- [Token Optimization Guide](./token-optimization-guide.md)
- [Documentation Search Implementation](./documentation-search-implementation.md)
- [MCP Specification - Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

---

**Document Version**: 1.0.0
**Author**: MCP Planner Agent
**Review Status**: Ready for implementation
