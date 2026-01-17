# Resend MCP Server - Roadmap

**Project Goal**: Build a comprehensive, production-ready MCP server for the Resend email API using Speakeasy code generation with curated tool exposure and runtime configuration.

**Strategy**: Automated generation from OpenAPI spec with MCP-specific customizations via overlays, targeting 25-30 high-value tools with scope-based filtering.

---

## Overview

| Aspect | Decision |
|--------|----------|
| **Generation Tool** | Speakeasy CLI |
| **Source** | Resend OpenAPI spec (resend-openapi repo) |
| **Total Endpoints** | 62 (in spec) |
| **Target Tools** | 25-30 curated tools |
| **Customization** | OpenAPI overlays with `x-speakeasy-mcp` |
| **Distribution** | npm package + MCPB bundle |
| **Scope Strategy** | read/write/admin filtering |

---

## Development Environment

### Nix/NixOS (Primary Development Environment)

This project uses a Nix flake for reproducible development environments on NixOS and other Nix-enabled systems.

#### Setup

```bash
# Enter development shell (installs all dependencies)
nix develop

# Or with direnv for automatic activation
echo "use flake" > .envrc && direnv allow
```

#### Speakeasy CLI

Speakeasy is **not available in nixpkgs**. Use npm/npx instead (works perfectly in Nix):

```bash
# Install as dev dependency
npm install -D @speakeasy-api/sdk

# Or use directly with npx
npx @speakeasy-api/sdk --help

# Use npm scripts (recommended)
npm run generate    # Generate MCP server
npm run validate    # Validate OpenAPI spec
npm run merge:spec  # Merge overlays
```

#### Build & Run with Nix

```bash
# Build production package
nix build

# Run the server
nix run

# Or with environment variables
RESEND_API_KEY=re_xxx nix run
```

### Guardrails

**DO:**
- Always use `nix develop` to enter the development shell
- Use npm/npx for Speakeasy CLI (via `@speakeasy-api/sdk`)
- Add system dependencies to `flake.nix` buildInputs
- Use direnv for automatic shell activation (`echo "use flake" > .envrc && direnv allow`)
- Keep flake.lock in version control

**DO NOT:**
- Install Node.js, npm, or system tools outside of Nix
- Use Homebrew, apt, or other package managers for development dependencies
- Manually manage Node.js versions (use `nodejs_24` in flake.nix)
- Skip `nix develop` and run commands directly
- Commit sensitive data or API keys to the repository

---

## Phase 1: Foundation & Setup (Week 1)

**Goal**: Establish Speakeasy-based project structure with OpenAPI spec and overlay system.

### Milestones

#### 1.1 Environment Setup
- [ ] Install Speakeasy CLI via npm (`npm install -D @speakeasy-api/sdk`)
- [ ] Verify Node.js 24+ and npm 10+
- [ ] Set up project Git configuration
- [ ] Create `.speakeasy/` directory for config

**Deliverables**: Development environment ready

#### 1.2 OpenAPI Spec Integration
- [ ] Download Resend OpenAPI spec: `curl -o openapi/resend.yaml https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml`
- [ ] Validate spec with `npx speakeasy validate -s openapi/resend.yaml`
- [ ] Document spec version/commit SHA in changelog
- [ ] Consider pinning to specific commit SHA for reproducibility

**Deliverables**: `openapi/resend.yaml` (versioned)

#### 1.3 Tool Analysis & Curation
- [ ] Analyze all 62 endpoints in spec
- [ ] Classify tools into three tiers for dynamic loading:
  - **Core (5-7 tools)**: Always loaded - email ops, docs search
  - **Secondary (10-12 tools)**: Load on-demand - domains, templates, contacts
  - **Tertiary (8-10 tools)**: Explicit request - broadcasts, batch, destructive
- [ ] Create tool exclusion list (API keys, webhooks, rarely-used)
- [ ] Define scope categories (read/write/admin)
- [ ] Document tool selection and tier assignment rationale

**Deliverables**: `docs/tool-curation.md` with three-tier classification

**Token Efficiency Target**: 84-92% reduction via dynamic loading (core: ~5,000 tokens vs static: ~32,000 tokens)

#### 1.4 Initial Generation
- [ ] Run `speakeasy quickstart --mcp`
- [ ] Configure for TypeScript + Node.js target
- [ ] Generate initial server structure
- [ ] Verify build succeeds
- [ ] Test with `npm run dev`

**Deliverables**: Generated server skeleton

**Risks**: Speakeasy version compatibility, OpenAPI spec validation errors

---

## Phase 2: Customization & Overlay System (Week 2)

**Goal**: Implement MCP-specific customizations via OpenAPI overlays without modifying source spec.

### Milestones

#### 2.1 Overlay Architecture
- [ ] Create `openapi/overlays/` directory
- [ ] Design overlay structure (base, scopes, mcp-hints)
- [ ] Document overlay precedence rules
- [ ] Set up overlay application workflow

**Deliverables**: `openapi/overlays/README.md`, overlay structure

#### 2.2 Scope Assignment Overlay
- [ ] Create `overlays/scopes.yaml`
- [ ] Assign scopes based on HTTP methods:
  - GET/HEAD → `read`
  - POST/PUT/PATCH → `write`
  - DELETE → `write` + `destructive`
  - API keys, webhooks → `admin`
- [ ] Apply overlay to spec
- [ ] Validate merged spec

**Deliverables**: `openapi/overlays/scopes.yaml`

#### 2.3 MCP Hints Overlay
- [ ] Create `overlays/mcp-hints.yaml`
- [ ] Add `x-speakeasy-mcp` for each tool:
  - `readOnlyHint` (GET operations)
  - `destructiveHint` (DELETE operations)
  - `idempotentHint` (PUT operations)
  - `openWorldHint` (email sending operations)
- [ ] Customize tool names (snake_case)
- [ ] Add human-friendly titles

**Deliverables**: `openapi/overlays/mcp-hints.yaml`

#### 2.4 Tool Exclusion Overlay
- [ ] Create `overlays/exclusions.yaml`
- [ ] Mark excluded tools with `x-speakeasy-mcp.disabled: true`
- [ ] Target tools:
  - API key management (sensitive)
  - Webhook secrets (sensitive)
  - Rarely used admin endpoints
- [ ] Document exclusion rationale

**Deliverables**: `openapi/overlays/exclusions.yaml`, curated tool list

#### 2.5 Custom Descriptions
- [ ] Create `overlays/descriptions.yaml`
- [ ] Enhance tool descriptions for LLM context:
  - Add parameter examples
  - Clarify rate limits
  - Note destructive operations
  - Link related tools
- [ ] Keep descriptions under 280 characters

**Deliverables**: `openapi/overlays/descriptions.yaml`

**Risks**: Overlay syntax errors, tool naming conflicts

---

## Phase 3: Generation & Integration (Week 3)

**Goal**: Generate production server with all customizations and integrate with existing infrastructure.

### Milestones

#### 3.1 Merge Overlays & Generate
- [ ] Create merge script (`scripts/merge-openapi.sh`)
- [ ] Merge base spec + all overlays
- [ ] Output to `openapi/merged.yaml`
- [ ] Run Speakeasy generation: `speakeasy generate mcp -s openapi/merged.yaml`
- [ ] Verify 25-30 tools generated
- [ ] Validate TypeScript compilation

**Deliverables**: Generated server in `src/`, build succeeds

#### 3.2 Rate Limiting Integration
- [ ] Review generated HTTP client
- [ ] Integrate rate limiter (500ms interval)
- [ ] Add retry logic for 429 responses
- [ ] Respect `Retry-After` headers
- [ ] Test with concurrent requests

**Deliverables**: Rate limiting integrated

#### 3.3 Error Handling Enhancement
- [ ] Review generated error responses
- [ ] Ensure structured MCP errors (`isError: true`)
- [ ] Add custom error classes if needed
- [ ] Format API errors for LLM readability
- [ ] Test error scenarios

**Deliverables**: Error handling meets MCP spec

#### 3.4 Environment Configuration
- [ ] Keep existing `RESEND_API_KEY` validation
- [ ] Add configuration for:
  - Scope filtering defaults
  - Tool selection defaults
  - Rate limit overrides
- [ ] Document all env variables

**Deliverables**: `.env.example`, config docs

#### 3.5 Dynamic Tool Discovery Implementation
- [ ] Implement three-tier tool classification:
  - Core tier (5-7 tools): send_email, list_emails, get_email, list_domains, search_resend_documentation
  - Secondary tier (10-12 tools): domain/template/contact/audience operations
  - Tertiary tier (8-10 tools): batch operations, broadcasts, destructive ops
- [ ] Enable MCP capability: `tools.listChanged: true` in server initialization
- [ ] Implement tool registry with enable/disable methods
- [ ] Add `notifications/tools/list_changed` notification mechanism
- [ ] Create trigger mechanisms:
  - Scope-based loading on startup
  - On-demand loading via first tool use in a tier
  - Explicit loading via internal registry commands
- [ ] Integrate with existing scope filtering (read/write/admin)
- [ ] Test dynamic tool loading and unloading
- [ ] Validate notification delivery to MCP client

**Deliverables**: Dynamic tool discovery operational, token reduction validated

**Token Efficiency Target**: 84-92% reduction (core: ~5,000 tokens vs static: ~32,000 tokens)

#### 3.6 Testing Framework
- [ ] Set up vitest for generated code
- [ ] Create integration tests for:
  - Tool execution
  - Scope filtering
  - Rate limiting
  - Error handling
  - Dynamic tool loading/unloading
  - Notification delivery
- [ ] Mock Resend API responses
- [ ] Test with MCP Inspector
- [ ] Validate tool state transitions

**Deliverables**: Test suite in `tests/`, 80%+ coverage

**Risks**: Generated code incompatibility, rate limiter integration issues, dynamic discovery client compatibility

---

## Phase 4: Distribution & Documentation (Week 4)

**Goal**: Package server for multiple distribution channels with comprehensive documentation.

### Milestones

#### 4.1 npm Package Preparation
- [ ] Update `package.json` metadata
- [ ] Add package entry points
- [ ] Create npm scripts:
  - `start` - Run server
  - `build` - Compile TypeScript
  - `test` - Run test suite
- [ ] Test local npm link
- [ ] Prepare npm publish configuration

**Deliverables**: npm-ready package

#### 4.2 MCPB Bundle Creation
- [ ] Add server icon (`.png` file)
- [ ] Configure `mcpbManifestOverlay` in gen.yaml
- [ ] Generate MCPB bundle: `speakeasy generate mcp --mcpb`
- [ ] Test drag-and-drop installation in Claude Desktop
- [ ] Verify guided setup flow

**Deliverables**: `dist/resend-mcp-server.mcpb`

#### 4.3 Documentation Overhaul
- [ ] Update README.md:
  - Installation (npm, MCPB)
  - Configuration (API key, scopes)
  - Available tools with examples
  - Scope filtering guide
- [ ] Update CLAUDE.md:
  - Speakeasy workflow
  - Regeneration process
  - Overlay customization
- [ ] Create ARCHITECTURE.md:
  - Generated code structure
  - Customization points
  - Tool selection logic

**Deliverables**: Comprehensive documentation

#### 4.4 Examples & Demos
- [ ] Create example usage scripts:
  - Send transactional email
  - Create domain + verify
  - Manage contacts
  - Create + send broadcast
- [ ] Record demo video (optional)
- [ ] Create troubleshooting guide

**Deliverables**: `examples/` directory

#### 4.5 Release Preparation
- [ ] Finalize CHANGELOG.md
- [ ] Tag version 1.0.0
- [ ] Create GitHub release notes
- [ ] Publish to npm (if public)
- [ ] Update CLA workflow for new structure

**Deliverables**: v1.0.0 release

**Risks**: MCPB bundle configuration errors, documentation gaps

---

## Phase 5: Maintenance & Evolution (Ongoing)

**Goal**: Establish sustainable maintenance workflow and monitor Resend API changes.

### Milestones

#### 5.1 CI/CD Pipeline
- [ ] GitHub Actions for:
  - Spec validation
  - Automated regeneration
  - Test suite execution
  - npm publish (if public)
- [ ] Breaking change detection
- [ ] Dependency updates (Dependabot)

**Deliverables**: `.github/workflows/` complete

#### 5.2 Monitoring & Updates
- [ ] Subscribe to Resend changelog
- [ ] Monitor `resend-openapi` repo updates
- [ ] Quarterly regeneration schedule
- [ ] Track MCP spec evolution
- [ ] Review Speakeasy CLI updates

**Deliverables**: Maintenance schedule

#### 5.3 Community Feedback
- [ ] GitHub issue templates
- [ ] Tool request process
- [ ] Bug report workflow
- [ ] Feature prioritization
- [ ] Community contributions (with CLA)

**Deliverables**: Community engagement framework

#### 5.4 Performance Optimization
- [ ] Monitor tool execution times
- [ ] Optimize rate limiting strategy
- [ ] Reduce tool schema sizes (if context issues)
- [ ] Add caching where appropriate
- [ ] Profile memory usage

**Deliverables**: Performance benchmarks

#### 5.5 Advanced Features (Future)
- [ ] OAuth support (if Resend adds it)
- [ ] Webhook event handling
- [ ] Template preview generation
- [ ] Batch operation helpers
- [ ] Analytics integration

**Deliverables**: Feature roadmap

**Risks**: API breaking changes, Speakeasy deprecations

---

## Success Metrics

| Metric | Target | Tracking |
|--------|--------|----------|
| **Tool Coverage** | 25-30 curated tools (3 tiers) | Spec analysis |
| **Core Tool Set** | 5-7 tools always loaded | Tool registry |
| **Token Efficiency** | 84-92% reduction via dynamic loading | Context measurement |
| **Generation Time** | < 5 minutes | CI logs |
| **Test Coverage** | > 80% | vitest reports |
| **Dynamic Loading Latency** | < 200ms per tier activation | Performance tests |
| **Documentation Quality** | Complete for all tools | Manual review |
| **npm Downloads** | 100+ monthly (if public) | npm stats |
| **GitHub Stars** | 50+ in first month (if public) | GitHub |
| **Issue Response Time** | < 48 hours | GitHub metrics |
| **API Sync Lag** | < 2 weeks from Resend updates | Monitoring |

---

## Critical Dependencies

| Dependency | Version | Fallback Plan |
|------------|---------|---------------|
| Speakeasy CLI | Latest stable (via npm) | Pin version in package.json |
| Resend OpenAPI | Latest from repo | Pin to Git commit SHA |
| Node.js | 24+ | Document minimum version |
| MCP SDK | 1.0+ | Speakeasy manages this |
| TypeScript | 5.0+ | Lock in package.json |
| Nix (optional) | 2.0+ | For NixOS/Nix users only |

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Speakeasy breaking changes | Medium | High | Pin CLI version, test before upgrade |
| Resend API changes | Medium | High | Automated detection, quick regeneration |
| OpenAPI spec incompleteness | Low | Medium | Supplement with manual tools if needed |
| Tool context overflow | Low | Medium | Dynamic discovery + scope filtering |
| Rate limit issues | Low | High | Conservative limits, retry logic |
| Generated code bugs | Medium | Medium | Comprehensive test suite |
| Dynamic discovery client incompatibility | Low | Medium | Test with Claude Desktop and MCP Inspector |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-16 | Use Speakeasy over openapi-zod-client | Production-ready, 50+ MCP servers generated |
| 2026-01-16 | Target 25-30 tools vs. all 62 | Avoid LLM context overflow |
| 2026-01-16 | Use OpenAPI overlays | Keep base spec pristine, easier updates |
| 2026-01-16 | Scope-based filtering | Runtime flexibility for different use cases |
| 2026-01-16 | npm + MCPB distribution | Reach both developers and end users |
| 2026-01-17 | Implement dynamic tool discovery | 84-92% token reduction, MCP protocol native support |
| 2026-01-17 | Three-tier tool classification | Core/Secondary/Tertiary for progressive loading |

---

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Foundation | Week 1 | Generated server skeleton |
| Phase 2: Customization | Week 2 | Complete overlay system |
| Phase 3: Integration | Week 3 | Production-ready server |
| Phase 4: Distribution | Week 4 | v1.0.0 release |
| Buffer Week | Week 5 | Integration testing, bug fixes, documentation polish |
| Phase 5: Maintenance | Ongoing | Sustainable workflow |

**Total Initial Effort**: 5 weeks to v1.0.0 (4 weeks planned + 1 week buffer)

**Rationale for Buffer**: Integration and testing phases often take longer than anticipated. The buffer week accounts for:
- Speakeasy integration issues
- OpenAPI spec gaps requiring manual fixes
- MCPB bundle configuration and testing
- Documentation review and refinement

---

## Next Steps

1. Review and approve this roadmap
2. Begin Phase 1: Install Speakeasy CLI
3. Download Resend OpenAPI spec
4. Start tool curation analysis
5. Schedule weekly check-ins

**Last Updated**: 2026-01-16
