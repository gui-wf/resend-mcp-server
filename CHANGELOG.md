# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-21

### Added

- MCP Server implementation for Resend API integration
- Core email tools:
  - `send_email` - Send single emails via Resend API
  - `get_email` - Retrieve email details by ID
  - `list_domains` - List all verified domains
- Secondary tools:
  - `batch_send_email` - Send multiple emails in a single request
  - `create_domain` - Register new email domains
  - `verify_domain` - Initiate domain verification
  - `list_emails` - List sent emails with pagination
  - `get_domain` - Get domain details
- Tertiary tools (advanced/admin):
  - Domain management: `delete_domain`, `update_domain`
  - Contact management: `list_contacts`, `create_contact`, `get_contact`, `update_contact`, `delete_contact`
  - Audience management: `list_audiences`, `create_audience`, `get_audience`, `delete_audience`
  - API key management: `list_api_keys`, `create_api_key`, `delete_api_key`
- Documentation search tool (`search_resend_documentation`):
  - Semantic search with vector embeddings using Xenova/transformers
  - Keyword fallback for improved coverage
  - Token-budgeted responses for LLM context efficiency
  - Pre-built embeddings index for instant startup
- Dynamic tool discovery system:
  - Tiered tool loading (core, secondary, tertiary)
  - Scope-based access control (read, write, admin)
  - Runtime tool enable/disable capabilities
  - 84-92% token reduction through selective tool exposure
- Environment configuration:
  - `RESEND_API_KEY` - Required API key validation
  - `RESEND_MCP_DEFAULT_TIER` - Default tool tier (core|secondary|tertiary|all)
  - `RESEND_MCP_SCOPES` - Comma-separated scope restrictions
  - `RESEND_RATE_LIMIT_MS` - Configurable rate limiting
  - `RESEND_DEBUG` - Debug logging toggle
- Rate limiting service to prevent API quota exhaustion
- Comprehensive Zod schema validation for all tool inputs
- Structured JSON error responses with helpful hints
- TypeScript type definitions for all public APIs
- Vitest test suite with MSW mocking
- Nix flake for reproducible development environment

### Developer Experience

- MCP Inspector integration for interactive debugging
- Hot reload development with tsx
- ESLint configuration for code quality
- Comprehensive type checking
- CI/CD workflow for automated testing

### Documentation

- Complete README with quick start guide
- Architecture documentation
- Troubleshooting guide
- CLAUDE.md for AI assistant context

## [Unreleased]

### Planned

- OAuth 2.0 authentication (pending Resend support)
- Webhook management tools
- Email template CRUD operations
- Broadcast campaign support
