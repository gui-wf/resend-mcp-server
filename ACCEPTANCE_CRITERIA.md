# Resend MCP Server - Acceptance Criteria

**Last Updated**: 2026-01-16
**Target Release**: v1.0.0
**Development Environment**: NixOS with Nix flakes

This document defines the comprehensive acceptance criteria for the Resend MCP Server. All criteria must be met before the v1.0.0 release.

---

## 1. Functional Requirements

### 1.1 Core MCP Server Functionality

#### Must Have
- [ ] Server implements MCP protocol v1.0+ via `@modelcontextprotocol/sdk`
- [ ] Server uses stdio transport for communication
- [ ] Server responds to `initialize` request with correct capabilities
- [ ] Server implements `tools/list` handler returning all available tools
- [ ] Server implements `tools/call` handler executing requested tools
- [ ] Server gracefully handles cancellation requests (MCP best practice)
- [ ] Server starts within 3 seconds on typical hardware
- [ ] Server handles concurrent tool calls without race conditions

#### Success Metrics
- MCP protocol compliance: 100%
- Response time for tool listing: < 500ms
- Maximum startup time: < 3 seconds
- Concurrent request handling: > 5 parallel requests

---

### 1.2 Tool Coverage & Curation

#### Must Have
- [ ] **25-30 curated tools** generated from Resend OpenAPI spec
- [ ] All tools categorized by scope: `read`, `write`, or `admin`
- [ ] Tools cover these categories:
  - [ ] Email operations (send, batch, get, list, cancel, update) - 6-7 tools
  - [ ] Domain management (create, verify, list, get, delete) - 5 tools
  - [ ] Template operations (create, get, list, update) - 4 tools
  - [ ] Contact management (create, get, list, delete) - 4 tools
  - [ ] Audience operations (create, get, list) - 3 tools
  - [ ] Broadcast operations (create, send) - 2 tools
  - [ ] **Documentation search** (search Resend API docs) - 1 tool

#### Must Exclude
- [ ] API key management tools (sensitive - security risk)
- [ ] Webhook secret rotation tools (sensitive)
- [ ] Rarely-used admin endpoints

#### Tool Quality Standards
- [ ] Each tool has a clear, concise name in snake_case (e.g., `send_email`)
- [ ] Each tool has a human-friendly title (e.g., "Send Email")
- [ ] Each tool description is 50-150 characters
- [ ] Each tool has proper MCP annotations (readOnlyHint, destructiveHint, etc.)
- [ ] Tool parameters have clear descriptions (< 80 chars each)
- [ ] Required parameters are properly marked in schema

#### Success Metrics
- Tool count: 25-30 (not more, not less)
- Tools with proper annotations: 100%
- Average description length: 50-150 chars
- Tool selection accuracy (in testing): > 95%

---

### 1.3 Documentation Search Tool

#### Must Have
- [ ] Tool name: `search_resend_documentation`
- [ ] Searches LLM-friendly docs at `https://resend.com/docs/llms-full.txt`
- [ ] Accepts `query` parameter (search term or question)
- [ ] Returns relevant documentation excerpts (< 3,000 tokens per response)
- [ ] Implements semantic search or keyword matching
- [ ] Caches documentation to avoid repeated fetches
- [ ] Updates cache when documentation changes

#### Implementation Options (Choose One)
- [ ] **Option A**: Pre-fetch docs at startup, search in-memory (fast, ~50-100K token overhead)
- [ ] **Option B**: Semantic search with embeddings (most efficient, ~2-3K tokens per query)
- [ ] **Option C**: On-demand fetch + keyword search (slower, minimal overhead)

#### Tool Definition
```json
{
  "name": "search_resend_documentation",
  "description": "Search Resend API documentation for usage examples and API details",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query or question about Resend API usage"
      }
    },
    "required": ["query"]
  },
  "annotations": {
    "readOnlyHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

#### Success Metrics
- Documentation fetch time: < 2 seconds (first call)
- Search response time: < 500ms (subsequent calls)
- Relevance of results: > 80% (manual evaluation)
- Token efficiency: < 3,000 tokens per response

---

### 1.4 Token Efficiency

#### Must Have (Based on Token Optimization Research)
- [ ] Total static tool definition size: < 40,000 tokens (for all 25-30 tools)
- [ ] Average tool definition size: < 1,500 tokens per tool
- [ ] Tool descriptions: 50-150 characters each
- [ ] Parameter descriptions: < 80 characters each
- [ ] Response payloads: < 5,000 tokens per tool call (average)
- [ ] Scope filtering reduces context by 60-70% when enabled

#### Optimization Techniques
- [ ] Use `x-speakeasy-mcp` overlays to customize descriptions
- [ ] Omit redundant parameter descriptions (don't repeat tool description)
- [ ] Use enums instead of free-form strings where appropriate
- [ ] Return only relevant fields in responses (not full API objects)
- [ ] Implement pagination with default limits (10-20 items)

#### Success Metrics
- Static overhead (all tools): < 40,000 tokens
- Dynamic overhead per call: < 5,000 tokens average
- Scope filtering efficiency: > 60% reduction
- Documentation tool overhead: < 3,000 tokens per query

---

### 1.5 Dynamic Tool Discovery

#### Must Have (MCP Protocol Native)
- [ ] Server declares `tools.listChanged: true` capability in initialize response
- [ ] Server implements `notifications/tools/list_changed` notification
- [ ] Tools organized into three tiers:
  - [ ] **Tier 1 (Core)**: 5-7 tools always loaded at startup
  - [ ] **Tier 2 (Secondary)**: 10-12 tools loaded on-demand
  - [ ] **Tier 3 (Tertiary)**: 8-10 tools loaded on explicit request
- [ ] Tool registry manages active/inactive tool state
- [ ] On-demand loading triggered by first tool use in a tier
- [ ] Scope-based pre-loading configurable via `--scope` flag
- [ ] Notification sent to client after tier activation
- [ ] Client compatibility tested (Claude Desktop, MCP Inspector)

#### Core Tier Tools (Always Loaded)
- [ ] `send_email` - Send single email
- [ ] `list_emails` - List sent emails with pagination
- [ ] `get_email` - Retrieve email by ID
- [ ] `list_domains` - List all configured domains
- [ ] `search_resend_documentation` - Search Resend API docs

#### Secondary Tier Tools (Load on Demand)
- [ ] Domain operations: create, verify, get, delete (4 tools)
- [ ] Template operations: create, get, list, update (4 tools)
- [ ] Contact operations: create, get, list, delete (4 tools)
- [ ] Audience operations: create, get, list (3 tools)

#### Tertiary Tier Tools (Explicit Request)
- [ ] `send_batch_emails` - Batch email sending
- [ ] `cancel_email` - Cancel scheduled email
- [ ] `update_email` - Update scheduled email
- [ ] Broadcast operations: create, send (2 tools)
- [ ] Advanced/destructive operations (3-4 tools)

#### Token Efficiency Targets
- [ ] Core tier only: ~5,000 tokens (84% reduction from static)
- [ ] Core + secondary: ~15,000 tokens (52% reduction)
- [ ] Combined with scope filtering: ~2,400 tokens (92% reduction)
- [ ] Tier activation latency: < 200ms
- [ ] Notification delivery time: < 100ms

#### Error Handling
- [ ] Unknown tool requests return structured error with `isError: true`
- [ ] Error message includes available tiers and hint to use `tools/list`
- [ ] Tier loading failures trigger rollback (remove partially loaded tools)
- [ ] Tier loading failures logged to stderr with context
- [ ] Tool execution failures don't corrupt registry state

#### Testing Requirements
- [ ] Unit tests for tool registry state management
- [ ] Integration tests for tier loading/unloading
- [ ] E2E tests for notification delivery
- [ ] Validate tool state transitions are correct
- [ ] Verify no tools accessible before tier loaded
- [ ] Verify all tools accessible after full tier load
- [ ] Test scope-based pre-loading behavior
- [ ] Test concurrent tier activation requests
- [ ] Test unknown tool request error handling
- [ ] Test tier loading failure and rollback behavior

#### Success Metrics
- Default context size (core only): < 6,000 tokens
- Token reduction vs static: > 80%
- Tier activation time: < 200ms
- Notification delivery success: 100%
- Client re-fetch after notification: > 95%

---

## 2. Technical Requirements

### 2.1 Code Generation

#### Must Have
- [ ] Generated from Resend OpenAPI spec at `https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml`
- [ ] Speakeasy CLI used via `npx @speakeasy-api/sdk` (Nix-compatible)
- [ ] OpenAPI overlays applied in correct order:
  1. Scopes overlay
  2. MCP hints overlay
  3. Exclusions overlay
  4. Descriptions overlay
- [ ] Merged spec validated before generation
- [ ] Generation produces compilable TypeScript
- [ ] Generated code is committed to version control (for reproducibility)

#### Overlay Requirements
- [ ] `openapi/overlays/scopes.yaml` exists and assigns scopes to all tools
- [ ] `openapi/overlays/mcp-hints.yaml` exists and adds MCP annotations
- [ ] `openapi/overlays/exclusions.yaml` exists and disables sensitive tools
- [ ] `openapi/overlays/descriptions.yaml` exists with LLM-optimized descriptions
- [ ] All overlays follow OpenAPI Overlay 1.0.0 specification

#### Success Metrics
- Generation time: < 5 minutes
- TypeScript compilation: 0 errors, 0 warnings
- Overlay validation: PASS
- Spec validation: PASS

---

### 2.2 Environment & Configuration

#### Must Have (Nix-Specific)
- [ ] `flake.nix` provides complete development environment
- [ ] `nodejs_24` used for Node.js runtime
- [ ] All system dependencies declared in `buildInputs`
- [ ] `.envrc` configured for direnv auto-activation
- [ ] `flake.lock` committed to version control
- [ ] No non-Nix package manager references (no Homebrew, apt, etc.)

#### Must Have (npm)
- [ ] `package.json` includes all Node.js dependencies
- [ ] `@speakeasy-api/sdk` in devDependencies
- [ ] `@stoplight/spectral-cli` in devDependencies for validation
- [ ] `msw` in devDependencies for API mocking
- [ ] npm scripts defined:
  - `generate` - Generate server from OpenAPI
  - `validate` - Validate OpenAPI spec
  - `merge:spec` - Merge overlays
  - `build` - Compile TypeScript
  - `test` - Run test suite
  - `dev` - Run development server
  - `inspector` - Launch MCP Inspector

#### Environment Variables
- [ ] `RESEND_API_KEY` required (validated to start with `re_`)
- [ ] `MCP_SCOPES` optional (comma-separated scope filter)
- [ ] `MCP_TOOLS` optional (comma-separated tool allowlist)
- [ ] `MCP_DEBUG` optional (enable debug logging to stderr)

#### Success Metrics
- `nix develop` success rate: 100%
- Missing dependency errors: 0
- Environment setup time: < 2 minutes (first time)
- Environment setup time: < 10 seconds (cached)

---

### 2.3 Rate Limiting & API Safety

#### Must Have
- [ ] Respects Resend's 2 requests/second default limit
- [ ] Implements exponential backoff for 429 responses
- [ ] Respects `Retry-After` headers from API
- [ ] Maximum retry duration: 5 minutes per request
- [ ] Transparent wait behavior (doesn't fail, just waits)
- [ ] Concurrent requests are serialized to respect rate limits

#### Configuration
- [ ] Rate limit configurable via environment (default: 500ms interval)
- [ ] Retry behavior configurable (max retries, backoff multiplier)
- [ ] Timeout configurable (default: 30 seconds per request)

#### Success Metrics
- Rate limit violations: 0
- Successful retry on 429: > 95%
- Average wait time: < 1 second (under normal load)

---

### 2.4 Error Handling

#### Must Have
- [ ] All errors return structured MCP responses with `isError: true`
- [ ] Error messages are clear and actionable (< 200 chars)
- [ ] Authentication errors include hint about API key format
- [ ] Rate limit errors include retry timing information
- [ ] Validation errors specify which parameter failed
- [ ] Network errors distinguish between client/server issues
- [ ] All errors logged to stderr (never stdout)

#### Error Categories
- [ ] `AuthenticationError` - Invalid or missing API key
- [ ] `ValidationError` - Invalid input parameters
- [ ] `RateLimitError` - Rate limit exceeded
- [ ] `NotFoundError` - Resource not found (404)
- [ ] `ApiError` - General API errors (500, etc.)

#### Success Metrics
- Error clarity rating: > 4/5 (user evaluation)
- Errors with actionable guidance: 100%
- Unhandled exceptions: 0

---

### 2.5 Testing

#### Must Have
- [ ] Test coverage: > 80% overall
- [ ] Critical path coverage: 100%
- [ ] Unit tests for:
  - Input validation (Zod schemas)
  - Error formatting
  - Scope filtering
  - Parameter transformations
- [ ] Integration tests for:
  - Tool execution with mocked API (using msw)
  - Rate limiting behavior
  - Error handling scenarios
  - Concurrent request handling
- [ ] E2E tests for:
  - MCP Inspector compatibility
  - Claude Desktop integration (if MCPB bundle)
  - Real API calls (sandboxed, not in CI)

#### Test Infrastructure
- [ ] Mock Resend API responses with msw
- [ ] Test fixtures for common scenarios
- [ ] Automated test suite runs in CI
- [ ] Tests pass in Nix environment

#### Success Metrics
- Test coverage: > 80%
- Test execution time: < 30 seconds
- CI test pass rate: 100%
- No flaky tests

---

## 3. Documentation Requirements

### 3.1 User-Facing Documentation

#### Must Have
- [ ] **README.md** - Project overview, quick start, installation
- [ ] **Installation guide** with Nix instructions (primary) and npm fallback
- [ ] **Tool reference** - List all 25-30 tools with examples
- [ ] **Scope filtering guide** - How to use `--scope` flag
- [ ] **Configuration guide** - All environment variables documented
- [ ] **Troubleshooting guide** - Common issues with Nix-specific solutions
- [ ] **Examples** - At least 5 real-world usage examples:
  1. Send transactional email
  2. Verify domain for sending
  3. Create template and send
  4. Manage contact list
  5. Search API documentation

#### Content Quality
- [ ] No emojis in any documentation
- [ ] All code examples tested and working
- [ ] All environment variables documented
- [ ] Nix-specific instructions clearly marked

#### Success Metrics
- Documentation completeness: 100%
- Code example success rate: 100%
- User can get started in < 10 minutes

---

### 3.2 Developer-Facing Documentation

#### Must Have
- [ ] **ROADMAP.md** - Phased implementation plan (complete)
- [ ] **IMPLEMENTATION_PLAN.md** - Technical architecture (complete)
- [ ] **CLAUDE.md** - AI assistant instructions with critical rules
- [ ] **CONTRIBUTING.md** - Contributor guide with CLA process
- [ ] **ARCHITECTURE.md** - Generated code structure, customization points
- [ ] **docs/token-optimization-guide.md** - Token efficiency best practices
- [ ] **docs/pending-thirdparty.md** - External dependencies (OAuth, etc.)
- [ ] **docs/tool-curation.md** - Rationale for included/excluded tools

#### Code Documentation
- [ ] All customization points documented (functions/beforeRequest.ts, etc.)
- [ ] Overlay system explained with examples
- [ ] Regeneration workflow documented
- [ ] Nix flake structure explained

#### Success Metrics
- Documentation covers all phases: 100%
- External contributors can contribute: Yes (with CLA)
- Regeneration process clear: Yes

---

## 4. Performance Requirements

### 4.1 Latency

#### Must Have
- [ ] Tool execution (cached): < 2 seconds average
- [ ] Tool execution (with API call): < 5 seconds average
- [ ] Tool listing: < 500ms
- [ ] Server startup: < 3 seconds
- [ ] Documentation search: < 500ms (after initial cache)

#### Success Metrics
- P50 latency: < 2 seconds
- P95 latency: < 5 seconds
- P99 latency: < 10 seconds

---

### 4.2 Resource Usage

#### Must Have
- [ ] Memory usage (idle): < 100 MB
- [ ] Memory usage (active): < 300 MB
- [ ] CPU usage (idle): < 1%
- [ ] CPU usage (active): < 20%
- [ ] No memory leaks (24-hour test)

#### Success Metrics
- Memory growth rate: < 1 MB/hour
- CPU usage during 100 sequential calls: < 30% average

---

### 4.3 Token Efficiency

#### Must Have (From Token Optimization Research)
- [ ] Static tool definitions: < 40,000 tokens total
- [ ] Average tool definition: < 1,500 tokens
- [ ] Tool descriptions: 50-150 characters
- [ ] Parameter descriptions: < 80 characters
- [ ] Response payloads: < 5,000 tokens average
- [ ] Scope filtering reduces context by > 60%

#### Documentation Search Tool Specific
- [ ] Full docs context: < 100,000 tokens (if pre-loaded)
- [ ] Search result response: < 3,000 tokens
- [ ] Token savings vs full docs: > 95%

#### Success Metrics
- Static overhead: < 40,000 tokens (verified)
- Dynamic overhead: < 5,000 tokens per call (average)
- Scope filtering efficiency: > 60%
- Documentation search efficiency: > 95% vs full context

---

## 5. Security Requirements

### 5.1 API Key Handling

#### Must Have
- [ ] API key validated on startup (must start with `re_`)
- [ ] API key read from environment only (never hardcoded)
- [ ] API key never logged (full or partial)
- [ ] API key not included in error messages
- [ ] API key not sent to unauthorized endpoints
- [ ] Documentation warns against committing API keys

#### Success Metrics
- API key leaks in logs: 0
- API key in repository: 0
- API key validation errors: Clear messaging

---

### 5.2 Input Validation

#### Must Have
- [ ] All tool inputs validated with Zod schemas
- [ ] Email addresses validated before API calls
- [ ] URLs validated and sanitized
- [ ] File sizes validated (attachments)
- [ ] Enumerated values strictly enforced
- [ ] SQL injection patterns rejected (if any string concatenation)

#### Success Metrics
- Invalid input rejection rate: 100%
- False positive validation errors: < 1%

---

### 5.3 Tool Safety

#### Must Have
- [ ] Email-sending tools marked with `openWorldHint: true`
- [ ] Destructive operations marked with `destructiveHint: true`
- [ ] Read-only operations marked with `readOnlyHint: true`
- [ ] Idempotent operations marked with `idempotentHint: true`
- [ ] No tools execute system commands
- [ ] No tools access local filesystem (except config)

#### Success Metrics
- Tools with correct annotations: 100%
- Unintended external actions: 0

---

## 6. Distribution Requirements

### 6.1 npm Package

#### Must Have
- [ ] Package name: `@gui-wf/resend-mcp-server` (or finalized name)
- [ ] Package version follows semver (1.0.0 for release)
- [ ] Package includes compiled code in `dist/`
- [ ] Package excludes source code and dev files
- [ ] Package has correct entry points (`main`, `bin`)
- [ ] Package has complete `package.json` metadata
- [ ] Package installs globally: `npm install -g`
- [ ] Package works via `npx` without global install

#### Files Included
- [ ] `dist/**/*` - Compiled JavaScript
- [ ] `package.json` - Metadata
- [ ] `LICENSE` - AGPL-3.0 license text
- [ ] `README.md` - Usage documentation

#### Files Excluded
- [ ] `src/` - TypeScript source (not needed for runtime)
- [ ] `tests/` - Test files
- [ ] `.speakeasy/` - Generator config
- [ ] `openapi/` - OpenAPI specs and overlays
- [ ] Development files (tsconfig.json, etc.)

#### Success Metrics
- Package size: < 5 MB
- Install time: < 30 seconds
- Post-install works: `npx resend-mcp-server --help`

---

### 6.2 MCPB Bundle

#### Must Have
- [ ] Bundle generated via `npm run package:mcpb`
- [ ] Bundle includes server icon (PNG, 512x512+)
- [ ] Bundle manifest has correct metadata
- [ ] Bundle installs in Claude Desktop via drag-and-drop
- [ ] Bundle provides guided setup flow for `RESEND_API_KEY`
- [ ] Bundle is platform-independent

#### Manifest Requirements
```yaml
name: "Resend MCP Server"
description: "Send emails, manage domains, and templates via Resend API"
author: "gui-wf"
license: "AGPL-3.0-or-later"
homepage: "https://github.com/gui-wf/resend-mcp-server"
```

#### Success Metrics
- Drag-and-drop install: Works in Claude Desktop
- Guided setup completion rate: > 90%
- Bundle size: < 10 MB

---

### 6.3 Nix Package

#### Must Have
- [ ] `nix build` produces working binary
- [ ] `npmDepsHash` correctly computed and set
- [ ] Binary installed to `$out/bin/resend-mcp-server`
- [ ] `nix run` executes the server
- [ ] Production build includes all runtime dependencies
- [ ] Build is reproducible (same hash on rebuild)

#### Success Metrics
- Build time: < 3 minutes (uncached)
- Build time: < 30 seconds (cached)
- Reproducibility: 100% (same hash)

---

## 7. Quality Assurance

### 7.1 Code Quality

#### Must Have
- [ ] TypeScript strict mode enabled
- [ ] No TypeScript errors
- [ ] No TypeScript warnings
- [ ] ESLint passes with 0 errors
- [ ] No `any` types in custom code
- [ ] No `console.log` usage (stdout reserved for MCP)
- [ ] All logging to stderr via `console.error`

#### Code Standards
- [ ] All imports use `.js` extensions (ES modules)
- [ ] AIDEV anchors used for temporary notes (< 120 chars)
- [ ] No emojis in code or comments
- [ ] Consistent code formatting

#### Success Metrics
- TypeScript strict mode: Enabled
- Compilation errors/warnings: 0
- ESLint errors: 0

---

### 7.2 MCP Protocol Compliance

#### Must Have
- [ ] Compatible with MCP protocol version 2025-06-18 or later
- [ ] Proper JSON-RPC 2.0 message formatting
- [ ] Correct error response format
- [ ] Supports progress notifications (if applicable)
- [ ] Handles cancellation gracefully
- [ ] Tool results follow `CallToolResult` schema
- [ ] **Dynamic discovery**: Declares `tools.listChanged: true` capability
- [ ] **Dynamic discovery**: Implements `notifications/tools/list_changed` correctly
- [ ] **Dynamic discovery**: Clients can query tools at any time (not just initialization)

#### Testing
- [ ] Tested with MCP Inspector
- [ ] Tested with Claude Desktop
- [ ] Protocol validator passes (if available)
- [ ] Dynamic tool loading tested with both clients
- [ ] Notification delivery validated
- [ ] Tool state changes reflected in subsequent `tools/list` calls

#### Success Metrics
- MCP Inspector compatibility: 100%
- Claude Desktop compatibility: 100%
- Protocol violations: 0
- Dynamic discovery notification success: 100%

---

### 7.3 Legal & Licensing

#### Must Have
- [ ] LICENSE file present (AGPL-3.0-or-later)
- [ ] CLA.md present and enforced via GitHub Action
- [ ] CONTRIBUTING.md explains CLA process
- [ ] All file headers reference AGPL (if applicable)
- [ ] No license violations in dependencies
- [ ] CLA workflow triggers on all PRs

#### Success Metrics
- License compliance: 100%
- CLA signature rate: 100% (before merge)

---

## 8. Maintainability Requirements

### 8.1 Regeneration Workflow

#### Must Have
- [ ] `scripts/merge-openapi.sh` merges overlays correctly
- [ ] Regeneration documented in CLAUDE.md
- [ ] Regeneration tested and working
- [ ] Git diff after regeneration is reviewable
- [ ] Custom code in `functions/` preserved after regeneration

#### Success Metrics
- Regeneration time: < 10 minutes
- Zero manual fixes needed post-regeneration: Yes

---

### 8.2 CI/CD

#### Must Have
- [ ] GitHub Actions workflow for:
  - Spec validation (weekly)
  - Breaking change detection
  - Test execution
  - Build verification
- [ ] CLA enforcement on PRs
- [ ] Automated issue creation for spec changes

#### Success Metrics
- CI pass rate: > 95%
- Build time in CI: < 5 minutes

---

## 9. User Experience Requirements

### 9.1 Developer Experience

#### Must Have
- [ ] Clear error messages guide users to solutions
- [ ] Setup time: < 10 minutes for new users
- [ ] Nix shell activation: < 10 seconds
- [ ] Documentation search tool helps users find API info quickly
- [ ] Examples demonstrate real-world use cases

#### Success Metrics
- Time to first successful tool call: < 10 minutes
- Documentation clarity rating: > 4/5

---

### 9.2 LLM Experience (Claude)

#### Must Have
- [ ] Tool descriptions help Claude select correct tools > 95% of the time
- [ ] Tool parameters have sufficient context for Claude to populate correctly
- [ ] Error messages are Claude-friendly (no technical jargon)
- [ ] Scope filtering allows Claude to focus on relevant tools
- [ ] Documentation search tool provides Claude with API usage info

#### Success Metrics
- Tool selection accuracy: > 95%
- Parameter population accuracy: > 90%
- Task completion rate: > 85%

---

## 10. Release Criteria (v1.0.0)

### Must Complete Before Release

#### Phase 1: Foundation
- [ ] All Phase 1 milestones from ROADMAP.md complete
- [ ] OpenAPI spec downloaded and validated
- [ ] Speakeasy generates compilable code
- [ ] Server starts and responds to MCP requests

#### Phase 2: Customization
- [ ] All Phase 2 milestones complete
- [ ] All 4 overlays created and tested
- [ ] 25-30 tools generated with correct annotations
- [ ] Scope filtering operational

#### Phase 3: Integration
- [ ] All Phase 3 milestones complete
- [ ] Rate limiting integrated and tested
- [ ] Error handling comprehensive
- [ ] Test suite achieves > 80% coverage
- [ ] Documentation search tool implemented

#### Phase 4: Distribution
- [ ] All Phase 4 milestones complete
- [ ] npm package published (if public) or ready for distribution
- [ ] MCPB bundle created and tested
- [ ] All documentation complete

#### Buffer Week
- [ ] All tests passing
- [ ] No critical bugs
- [ ] Documentation reviewed and polished
- [ ] Example scripts tested

#### Final Checklist
- [ ] All acceptance criteria in this document: MET
- [ ] Security review: PASS
- [ ] Performance benchmarks: PASS
- [ ] Token efficiency targets: MET
- [ ] MCP protocol compliance: VERIFIED
- [ ] Nix build: SUCCESS
- [ ] npm package: READY
- [ ] MCPB bundle: READY
- [ ] CHANGELOG.md: COMPLETE
- [ ] GitHub release notes: DRAFTED

---

## 11. Documentation Search Tool - Detailed Criteria

### 11.1 Functional Requirements

#### Must Have
- [ ] **Data Source**: Fetches from `https://resend.com/docs/llms-full.txt`
- [ ] **Caching**: Caches docs at startup or first use (configurable)
- [ ] **Search Method**: Implements keyword search or semantic search
- [ ] **Query Input**: Accepts natural language queries or keywords
- [ ] **Result Formatting**: Returns relevant excerpts with context
- [ ] **Result Limit**: Returns top 3-5 most relevant sections
- [ ] **Token Budget**: Results limited to < 3,000 tokens

#### Search Quality
- [ ] Finds relevant API methods when queried (e.g., "how to send email")
- [ ] Finds parameter documentation (e.g., "email attachments format")
- [ ] Finds error handling information
- [ ] Finds rate limiting details
- [ ] Returns empty/not-found for irrelevant queries

#### Implementation Approach (Choose One)
- [ ] **Option A**: In-memory keyword search (simple, fast, ~50-100K static overhead)
- [ ] **Option B**: Embedding-based semantic search (most efficient, ~2K dynamic overhead)
- [ ] **Option C**: Chunk-based context retrieval (balanced, ~5-10K per query)

### 11.2 Tool Definition

```json
{
  "name": "search_resend_documentation",
  "title": "Search Resend Docs",
  "description": "Search Resend API documentation for usage examples, parameters, and error details",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query or question",
        "minLength": 3
      },
      "limit": {
        "type": "number",
        "description": "Max results (default: 3)",
        "minimum": 1,
        "maximum": 10,
        "default": 3
      }
    },
    "required": ["query"]
  },
  "annotations": {
    "readOnlyHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### 11.3 Response Format

#### Must Have
- [ ] Structured JSON response
- [ ] Each result includes:
  - Section title
  - Relevant excerpt (< 800 chars)
  - Relevance score (optional)
- [ ] Total response: < 3,000 tokens
- [ ] Clear "no results" message if nothing found

#### Example Response
```json
{
  "query": "how to send email with attachments",
  "results": [
    {
      "section": "Sending Emails - Attachments",
      "excerpt": "To send an attachment, include the 'attachments' array with objects containing 'filename' (string) and 'content' (base64 string) or 'path' (file path). Example: { \"attachments\": [{ \"filename\": \"invoice.pdf\", \"content\": \"base64data...\" }] }",
      "relevance": 0.95
    }
  ],
  "total": 1
}
```

### 11.4 Success Metrics

- [ ] Search accuracy: > 80% (returns relevant results)
- [ ] Search latency: < 500ms (after cache)
- [ ] Token efficiency: > 95% vs loading full docs
- [ ] False negatives: < 10% (misses few queries)
- [ ] Cache freshness: < 24 hours old

---

## 12. Non-Functional Requirements

### 12.1 Observability

#### Must Have
- [ ] All errors logged to stderr with context
- [ ] Request IDs for correlation (optional but recommended)
- [ ] Debug mode available via `MCP_DEBUG=true`
- [ ] No sensitive data in logs
- [ ] Log levels: error, warn, info, debug

---

### 12.2 Backwards Compatibility

#### Must Have (for future updates)
- [ ] OpenAPI spec updates don't break existing tools
- [ ] New tools can be added without breaking changes
- [ ] Overlay system supports incremental updates
- [ ] Regeneration preserves custom code in `functions/`

---

### 12.3 Extensibility

#### Must Have
- [ ] Custom hooks in `functions/beforeRequest.ts`
- [ ] Custom hooks in `functions/afterResponse.ts`
- [ ] Overlay system allows tool customization
- [ ] Scope system allows runtime filtering
- [ ] New tools can be added via overlays

---

## 13. Acceptance Test Plan

### 13.1 Manual Testing

#### Pre-Release Checklist
- [ ] Install fresh in Nix environment and verify all steps work
- [ ] Test all 25-30 tools with real Resend API (sandbox account)
- [ ] Test scope filtering: `--scope read`, `--scope write`, `--scope admin`
- [ ] Test documentation search with 10+ diverse queries
- [ ] Test error scenarios (invalid API key, rate limit, etc.)
- [ ] Test with MCP Inspector - all tools visible and functional
- [ ] Test with Claude Desktop - can complete real tasks
- [ ] Test regeneration workflow - make change, regenerate, verify

### 13.2 Automated Testing

#### CI Must Pass
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript compilation successful
- [ ] ESLint passes
- [ ] OpenAPI spec validation passes
- [ ] Test coverage > 80%

---

## 14. Sign-Off Requirements

### Technical Sign-Off
- [ ] All acceptance criteria in sections 1-13: MET
- [ ] No critical bugs outstanding
- [ ] Performance benchmarks met
- [ ] Security review passed

### Documentation Sign-Off
- [ ] All user documentation complete
- [ ] All developer documentation complete
- [ ] Examples tested and working
- [ ] No broken links

### Legal Sign-Off
- [ ] LICENSE file present
- [ ] CLA enforced
- [ ] No license violations
- [ ] Attribution complete

---

## 15. Release Blockers

### Any of These Block Release
- [ ] Critical security vulnerability
- [ ] MCP protocol non-compliance
- [ ] Data loss or corruption bug
- [ ] API key exposure risk
- [ ] Cannot install on NixOS
- [ ] Cannot install in Claude Desktop
- [ ] Token efficiency < 60% of target

---

## Success Definition

**The Resend MCP Server v1.0.0 is considered successful when:**

1. **All acceptance criteria** in this document are met
2. **User can** install via npm, Nix, or MCPB and start using within 10 minutes
3. **Claude can** successfully send emails, verify domains, and manage contacts using natural language
4. **Developer can** regenerate the server when Resend updates their API
5. **Token budget** stays under 40,000 tokens static + 5,000 tokens per call
6. **Documentation search** allows Claude to discover API capabilities without external searches
7. **Nix users** can develop and build without any non-Nix dependencies

---

**Document Version**: 1.0.0
**Status**: Draft - Ready for implementation
**Last Updated**: 2026-01-16
