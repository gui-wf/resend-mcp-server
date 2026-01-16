# Resend MCP Server

MCP server for the Resend email API. Enables AI assistants to send emails, manage domains, contacts, and templates via the Model Context Protocol.

## CRITICAL RULES

- **NEVER** commit `RESEND_API_KEY` or any API credentials to the repository
- **NEVER** use `console.log` - stdout is reserved for MCP protocol; use `console.error` for logging
- **NEVER** use emojis in code, documentation, commit messages, or comments
- **ALWAYS** validate inputs with Zod schemas before API calls
- **ALWAYS** return structured JSON responses with `isError: true` for failures
- **ALWAYS** use `.js` extensions in TypeScript imports (ES modules requirement)

## Branch Strategy

- **Default**: `master`
- **PRs**: Always target `master` branch
- **DO NOT** sign-off or add Claude as co-author in commits

## Development Environment

```bash
# Enter Nix development shell (auto-installs deps)
nix develop

# Development commands
npm run dev          # Run server with tsx (hot reload)
npm run build        # Compile TypeScript
npm run inspector    # Test with MCP Inspector
npm test             # Run vitest tests
npm run typecheck    # Type validation only
```

**Required**: `RESEND_API_KEY` environment variable from [Resend Dashboard](https://resend.com/api-keys)

## Project Structure

```
src/
  index.ts              # MCP server entry point
  config/               # Environment validation, constants
  services/             # Resend API client, rate limiter
  tools/                # MCP tool implementations
    emails/             # Email-related tools (send, batch, get, list)
  types/                # TypeScript interfaces
  utils/                # Error handling, logging
```

## MCP Tool Pattern

Tools in `src/tools/` follow this structure:

```typescript
// 1. Zod schema for input validation
const inputSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
});

// 2. Tool definition with JSON Schema
getDefinition() {
  return {
    name: "send_email",
    description: "Send an email via Resend API",
    inputSchema: { /* JSON Schema matching Zod */ }
  };
}

// 3. Execute with structured response
async execute(args: unknown) {
  const input = inputSchema.parse(args);
  // ... call Resend API
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}
```

## Error Handling

Return structured errors, never throw:

```typescript
return {
  content: [{ type: "text", text: `Error: ${error.message}` }],
  isError: true
};
```

## AIDEV Anchors

Use for temporary code notes (max 120 chars):
- `AIDEV-NOTE:` - Document quirks or constraints
- `AIDEV-TODO:` - Action items
- `AIDEV-QUESTION:` - Decisions needed

## Pending Third-Party Features

See [docs/pending-thirdparty.md](docs/pending-thirdparty.md) for features blocked on external service support (e.g., Resend OAuth). Check this file when users ask about authentication alternatives, OAuth, or "why can't we do X" - the answer may be "waiting on third-party support." Verify online if status has changed.

## Resources

- [Resend API Docs](https://resend.com/docs/api-reference/introduction)
- [MCP Specification](https://modelcontextprotocol.io/docs)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Quick Reference

| Command | Description |
|---------|-------------|
| `nix develop` | Enter dev environment |
| `npm run dev` | Run server (dev mode) |
| `npm run inspector` | Debug with MCP Inspector |
| `npm run build` | Compile to dist/ |
| `npm run typecheck` | Validate types |
| `npm test` | Run tests |
