# OpenAPI Overlays

This directory contains OpenAPI Overlay Specification files that customize the base Resend OpenAPI spec for MCP server generation.

## Overlay Files

| File | Purpose |
|------|---------|
| `scopes.yaml` | Assigns read/write/admin scopes to operations |
| `mcp-hints.yaml` | Adds MCP protocol hints (readOnlyHint, destructiveHint, etc.) |
| `exclusions.yaml` | Disables security-sensitive operations (API keys) |
| `descriptions.yaml` | Provides LLM-optimized tool descriptions with tier assignments |

## Application Order

Overlays are applied in the following order by `scripts/merge-openapi.sh`:

1. `scopes.yaml` - Base permission model
2. `mcp-hints.yaml` - Protocol annotations
3. `descriptions.yaml` - Tool descriptions and tiers
4. `exclusions.yaml` - Final exclusions (applied last)

## Overlay Structure

Each overlay follows the [OpenAPI Overlay Specification 1.0.0](https://github.com/OAI/Overlay-Specification):

```yaml
overlay: 1.0.0
info:
  title: Overlay Title
  version: 1.0.0
actions:
  - target: "$.paths['/endpoint'].method"
    update:
      x-speakeasy-mcp:
        property: value
```

## Adding New Overlays

1. Create a new YAML file following the overlay specification
2. Add the file to the `OVERLAYS` array in `scripts/merge-openapi.sh`
3. Document the file in this README
4. Run `npm run merge:spec` to verify

## Tool Tiers

Operations are classified into three tiers (see `docs/tool-curation.md`):

- **Core (Tier 1)**: Always loaded (send_email, list_emails, list_domains, etc.)
- **Secondary (Tier 2)**: Loaded on demand (CRUD operations)
- **Tertiary (Tier 3)**: Admin/advanced operations (delete, batch, etc.)

## Excluded Operations

For security, the following operations are disabled:

- `POST /api-keys` - API key creation
- `GET /api-keys` - API key listing
- `DELETE /api-keys/{id}` - API key deletion

See `exclusions.yaml` for rationale.

## Testing

After modifying overlays:

```bash
# Merge spec with overlays
npm run merge:spec

# Validate merged spec
npm run validate

# Regenerate MCP server (Phase 2+)
npm run generate
```
