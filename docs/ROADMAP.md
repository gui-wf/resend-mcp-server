# Resend MCP Server - Implementation Roadmap

**Last Updated**: 2026-01-22
**Current Phase**: Phase 7 (Pending)
**Overall Progress**: ~85%

---

## Implementation Workflow

Each phase follows this structured workflow:

1. **Plan** - Opus agent analyzes requirements and creates actionable plan
2. **Implement** - Execute the plan with code changes
3. **Review** - Opus agent reviews implementation for quality
4. **Fix** - Address any issues found in review
5. **Commit** - Create descriptive commit with changes (REQUIRED after each phase)
6. **Update Roadmap** - Mark completed items and document progress

**IMPORTANT**: Always commit after completing each phase before moving to the next. This ensures:
- Clear git history with one commit per phase
- Easy rollback if issues are discovered
- Progress is preserved even if session is interrupted

---

## Phase Summary

| Phase | Description | Status | Completion |
|-------|-------------|--------|------------|
| Phase 1 | Foundation and Setup | COMPLETED | 100% |
| Phase 2 | Documentation Search Tool | COMPLETED | 100% |
| Phase 3 | Testing Infrastructure | COMPLETED | 100% |
| Phase 4 | Production Polish | COMPLETED | 100% |
| Phase 5 | Core API Integration | COMPLETED | 100% |
| Phase 6 | Tool Registry Integration | COMPLETED | 100% |
| Phase 7 | Secondary Tools | PENDING | 0% |
| Phase 8 | Tertiary Tools | PENDING | 0% |

---

## Phase 1: Foundation and Setup (COMPLETED)

**Objective**: Establish project structure and basic MCP server

### Completed Items
- [x] Project initialization with TypeScript and ES modules
- [x] MCP SDK integration (`@modelcontextprotocol/sdk`)
- [x] Basic server structure with stdio transport
- [x] Environment validation for RESEND_API_KEY
- [x] OpenAPI spec (`openapi/resend.yaml`)
- [x] Overlay system (scopes, hints, descriptions, exclusions)
- [x] Merge script for OpenAPI overlays
- [x] Nix flake for development environment
- [x] ESLint and TypeScript configuration

### Key Files Created
- `src/index.ts` - MCP server entry point
- `src/config/environment.ts` - Environment validation with Zod
- `openapi/resend.yaml` - Base OpenAPI specification
- `openapi/overlays/*.yaml` - MCP customization overlays
- `scripts/merge-openapi.sh` - Overlay merge script

### Commit Reference
- Initial commits establishing foundation

---

## Phase 2: Documentation Search Tool (COMPLETED)

**Objective**: Implement semantic search over Resend documentation

### Completed Items
- [x] Embeddings build script (`scripts/build-embeddings.ts`)
- [x] Markdown chunker for documentation (`scripts/chunker.ts`)
- [x] Embeddings loader with caching (`src/tools/docs/embeddings-loader.ts`)
- [x] Vector search with cosine similarity (`src/tools/docs/vector-search.ts`)
- [x] Keyword fallback search
- [x] Token budget management
- [x] MCP tool implementation (`src/tools/docs/search-docs-tool.ts`)
- [x] Pre-computed embeddings (`data/embeddings.json`)
- [x] Git LFS configuration for embeddings file

### Key Files Created
- `src/tools/docs/` - Complete documentation search module
- `scripts/build-embeddings.ts` - Embeddings generation
- `scripts/chunker.ts` - Document chunking
- `data/embeddings.json` - Pre-computed vectors (Git LFS)

### Commit Reference
- `3b94c95` - feat: implement Phase 2 for both Doc Search and MCP Server
- `0d02980` - feat: add pre-computed embeddings for documentation search

---

## Phase 3: Testing Infrastructure (COMPLETED)

**Objective**: Establish comprehensive test coverage

### Completed Items
- [x] Vitest configuration with MSW mocking
- [x] Unit tests for vector-search module (20 tests)
- [x] Unit tests for embeddings-loader module (19 tests)
- [x] Unit tests for metrics module (19 tests)
- [x] Integration tests for search-docs-tool (30 tests)
- [x] Test setup with environment mocking
- [x] Rate limiter with Retry-After header support
- [x] Tool list change notifications (`listChanged: true`)

### Key Files Created
- `tests/setup.ts` - Test environment configuration
- `tests/unit/vector-search.test.ts`
- `tests/unit/embeddings-loader.test.ts`
- `tests/unit/metrics.test.ts`
- `tests/integration/search-docs-tool.test.ts`

### Test Coverage
- **Total Tests**: 88 passing
- **Test Duration**: ~2 seconds

### Commit Reference
- `08b895d` - feat: implement Phase 3 testing infrastructure
- `de76127` - test: add metrics module tests and freshness warning tests

---

## Phase 4: Production Polish (COMPLETED)

**Objective**: Prepare for production deployment

### Completed Items
- [x] README with quick start guide
- [x] CHANGELOG following Keep a Changelog format
- [x] TROUBLESHOOTING guide
- [x] ARCHITECTURE documentation
- [x] npm package configuration
- [x] `.npmignore` for clean packages
- [x] CI workflow (lint, typecheck, test, build)
- [x] prepublishOnly script

### Key Files Created
- `README.md` - Complete documentation
- `CHANGELOG.md` - Version history
- `docs/ARCHITECTURE.md` - System architecture
- `docs/TROUBLESHOOTING.md` - Common issues
- `.github/workflows/ci.yml` - CI pipeline
- `.npmignore` - Package exclusions

### Commit Reference
- `e21320d` - feat: implement Phase 4 production polish and distribution

---

## Phase 5: Core API Integration (COMPLETED)

**Objective**: Implement real Resend API calls for core tools

### Completed Items
- [x] Add Resend SDK dependency
- [x] Integrate environment configuration (`loadConfig()`)
- [x] Integrate rate limiter (`configureRateLimiter()`, `withRateLimitAndRetry()`)
- [x] Implement `send_email` tool with full options
- [x] Implement `get_email` tool
- [x] Implement `list_emails` tool
- [x] Implement `list_domains` tool
- [x] Implement `get_domain` tool
- [x] Zod validation schemas for all inputs
- [x] Structured error responses with hints

### Key Files Modified
- `src/index.ts` - Complete rewrite with real API calls
- `src/utils/mcp-errors.ts` - SDK compatibility update
- `package.json` - Added `resend` dependency

### Commit Reference
- `054b281` - feat: implement core email and domain tools with real Resend API

---

## Phase 6: Tool Registry Integration (COMPLETED)

**Objective**: Enable dynamic tool discovery and access control

### Completed Items
- [x] Create tool definition factory (`src/tools/index.ts`)
- [x] Refactor tools into ToolDefinition objects with tier/scope metadata
- [x] Update tier constants in tool-registry.ts
- [x] Refactor index.ts to use registry
- [x] Use `getEnabledTools()` for ListToolsRequestSchema
- [x] Use `getToolExecutor()` for CallToolRequestSchema
- [x] Implement tier loading based on `RESEND_MCP_DEFAULT_TIER`
- [x] Send `notifications/tools/list_changed` on tier changes
- [x] Comprehensive unit tests for tool registry (43 tests)

### Key Files Created/Modified
- `src/tools/index.ts` - NEW: Tool definition factory
- `src/index.ts` - Refactored to use registry
- `src/services/tool-registry.ts` - Updated tier constants, added SDK compatibility
- `tests/unit/tool-registry.test.ts` - NEW: 43 unit tests

### Test Coverage
- **Total Tests**: 131 passing (was 88)
- **New Tests**: 43 for tool-registry module

### Outcome
- Dynamic tool loading by tier (core/secondary/tertiary)
- Scope-based access control (read/write/admin)
- Runtime tool enable/disable capabilities
- Clean separation of tool definitions from server logic

### Commit Reference
- `4ccf1ba` - feat: implement Phase 6 tool registry integration

---

## Phase 7: Secondary Tools (PENDING)

**Objective**: Implement commonly used CRUD operations

### Planned Tools (Per tool-curation.md)

**Domain Operations**
- [ ] `create_domain` - Add new domain
- [ ] `update_domain` - Modify domain settings
- [ ] `verify_domain` - Trigger DNS verification

**Email Operations**
- [ ] `update_email` - Update scheduled email
- [ ] `cancel_email` - Cancel scheduled email

**Contact Operations**
- [ ] `list_contacts` - List contacts with pagination
- [ ] `create_contact` - Add to audience
- [ ] `get_contact` - Single contact details
- [ ] `update_contact` - Modify contact

**Template Operations**
- [ ] `list_templates` - List email templates
- [ ] `create_template` - New template
- [ ] `get_template` - Single template
- [ ] `update_template` - Modify template
- [ ] `publish_template` - Make available
- [ ] `duplicate_template` - Copy template

**Topic Operations**
- [ ] `list_topics` - Email topics
- [ ] `create_topic` - New topic

**Webhook Operations**
- [ ] `list_webhooks` - Event webhooks
- [ ] `create_webhook` - New webhook
- [ ] `update_webhook` - Modify webhook

### Expected Tool Count
- ~20 additional tools
- ~12,000-15,000 additional tokens when loaded

---

## Phase 8: Tertiary Tools (PENDING)

**Objective**: Implement advanced/admin features

### Planned Tools (Per tool-curation.md)

**Destructive Operations**
- [ ] `delete_domain`
- [ ] `delete_contact`
- [ ] `delete_template`
- [ ] `delete_topic`
- [ ] `delete_webhook`
- [ ] `delete_segment`
- [ ] `delete_broadcast`
- [ ] `delete_contact_property`

**Batch Operations**
- [ ] `send_batch_emails` - Up to 100 emails

**Broadcast Operations**
- [ ] `list_broadcasts`
- [ ] `create_broadcast`
- [ ] `get_broadcast`
- [ ] `update_broadcast`
- [ ] `send_broadcast`

**Segment Operations**
- [ ] `list_segments`
- [ ] `create_segment`
- [ ] `get_segment`
- [ ] `add_contact_to_segment`
- [ ] `remove_contact_from_segment`

**Contact Property Operations**
- [ ] `list_contact_properties`
- [ ] `create_contact_property`
- [ ] `get_contact_property`
- [ ] `update_contact_property`

**Inbound Email Operations**
- [ ] `list_received_emails`
- [ ] `get_received_email`
- [ ] `list_received_email_attachments`
- [ ] `get_received_email_attachment`

**Attachment Operations**
- [ ] `list_email_attachments`
- [ ] `get_email_attachment`

### Expected Tool Count
- ~25-30 additional tools
- ~10,000-12,000 additional tokens when loaded

---

## Excluded Operations (Security)

The following operations are intentionally excluded due to security risks:

| Operation | Risk |
|-----------|------|
| `list_api_keys` | Exposes all API keys |
| `create_api_key` | Could create elevated access |
| `delete_api_key` | Could disable production access |

See `docs/pending-thirdparty.md` for features pending external support.

---

## Success Metrics

### Current Status
- **Tests**: 131 passing
- **TypeScript**: Compiles cleanly
- **Tools Implemented**: 6 (send_email, get_email, list_emails, list_domains, get_domain, search_resend_documentation)
- **Tool Registry**: Fully integrated with tier-based loading
- **Documentation**: Complete for implemented features

### Target Metrics
- **Test Coverage**: >80%
- **Core Tools**: 100% implemented
- **Secondary Tools**: 100% implemented
- **Tertiary Tools**: 50%+ implemented (based on priority)

---

## References

- [Tool Curation Guide](./tool-curation.md) - Complete endpoint inventory
- [Token Optimization Guide](./token-optimization-guide.md) - Token budget analysis
- [Architecture Documentation](./ARCHITECTURE.md) - System design
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Common issues
- [Resend API Reference](https://resend.com/docs/api-reference/introduction)
- [MCP Specification](https://modelcontextprotocol.io/docs)

---

**Document Version**: 1.0.0
**Maintained By**: Implementation Team
