# Resend MCP Server

A comprehensive [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the [Resend](https://resend.com) email API. Enables AI assistants like Claude to send emails, manage domains, contacts, audiences, and more through a standardized interface.

## Quick Run

Run immediately without installation:

```bash
# Using npx (Node.js)
npx resend-mcp-server

# Using Nix flakes (with binary cache)
nix run flakehub:gui-wf/resend-mcp-server

# Using Nix flakes (from source)
nix run github:gui-wf/resend-mcp-server
```

Requires `RESEND_API_KEY` environment variable. Get yours from [Resend Dashboard](https://resend.com/api-keys).

## Disclaimer

**This is an unofficial, community-developed project.** It is not affiliated with, endorsed by, or supported by Resend. Use at your own risk.

## Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Using npx (Recommended)

```json
{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["resend-mcp-server"],
      "env": {
        "RESEND_API_KEY": "re_your_api_key_here"
      }
    }
  }
}
```

### Using Nix

```json
{
  "mcpServers": {
    "resend": {
      "command": "nix",
      "args": ["run", "github:gui-wf/resend-mcp-server", "--refresh"],
      "env": {
        "RESEND_API_KEY": "re_your_api_key_here"
      }
    }
  }
}
```

## Installation

### npm (Global)

```bash
npm install -g resend-mcp-server
```

### From Source

```bash
git clone https://github.com/gui-wf/resend-mcp-server.git
cd resend-mcp-server
npm install
npm run build
```

Then configure Claude Desktop with:

```json
{
  "mcpServers": {
    "resend": {
      "command": "node",
      "args": ["/path/to/resend-mcp-server/dist/index.js"],
      "env": {
        "RESEND_API_KEY": "re_your_api_key_here"
      }
    }
  }
}
```

## Available Tools

### Core Tools (Always Available)

| Tool | Description |
|------|-------------|
| `send_email` | Send a single email via Resend API |
| `get_email` | Retrieve email details by ID |
| `list_domains` | List all verified domains for the account |
| `search_resend_documentation` | Search Resend API documentation with semantic search |

### Secondary Tools

| Tool | Description |
|------|-------------|
| `batch_send_email` | Send multiple emails in a single request |
| `create_domain` | Register a new email domain |
| `verify_domain` | Initiate domain verification process |
| `list_emails` | List sent emails with pagination |
| `get_domain` | Get details for a specific domain |

### Tertiary Tools (Advanced/Admin)

| Tool | Description |
|------|-------------|
| `delete_domain` | Delete a domain from the account |
| `update_domain` | Update domain settings |
| `list_contacts` | List contacts in an audience |
| `create_contact` | Create a new contact |
| `get_contact` | Get contact details |
| `update_contact` | Update contact information |
| `delete_contact` | Delete a contact |
| `list_audiences` | List all audiences |
| `create_audience` | Create a new audience |
| `get_audience` | Get audience details |
| `delete_audience` | Delete an audience |
| `list_api_keys` | List API keys (names only) |
| `create_api_key` | Create a new API key |
| `delete_api_key` | Delete an API key |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | - | Your Resend API key (must start with `re_`) |
| `RESEND_MCP_DEFAULT_TIER` | No | `core` | Default tool tier: `core`, `secondary`, `tertiary`, or `all` |
| `RESEND_MCP_SCOPES` | No | All | Comma-separated scopes: `read`, `write`, `admin` |
| `RESEND_RATE_LIMIT_MS` | No | `500` | Minimum milliseconds between API requests |
| `RESEND_DEBUG` | No | `false` | Enable debug logging (`true`, `1`, or `yes`) |

### Tool Tiers

Tools are organized into tiers for token efficiency:

- **Core**: Essential tools for basic email operations (4 tools)
- **Secondary**: Common additional features (5 tools)
- **Tertiary**: Advanced and administrative features (14 tools)

Configure the default tier based on your use case:

```json
{
  "env": {
    "RESEND_API_KEY": "re_...",
    "RESEND_MCP_DEFAULT_TIER": "secondary"
  }
}
```

### Scope-Based Access Control

Restrict tool access by operation type:

- **read**: Tools that only retrieve data
- **write**: Tools that create or modify resources
- **admin**: Tools for administrative operations

```json
{
  "env": {
    "RESEND_API_KEY": "re_...",
    "RESEND_MCP_SCOPES": "read,write"
  }
}
```

## Development

### Prerequisites

- Node.js >= 20.0.0
- npm or pnpm
- (Optional) Nix for reproducible environment

### Setup with Nix

```bash
# Enter development shell (auto-installs dependencies)
nix develop
```

### Setup without Nix

```bash
npm install
```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run server with hot reload |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run inspector` | Debug with MCP Inspector |
| `npm test` | Run test suite |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run typecheck` | Validate TypeScript types |
| `npm run lint` | Run ESLint |
| `npm run build:embeddings` | Rebuild documentation embeddings |

### Testing with MCP Inspector

The MCP Inspector provides an interactive UI for testing tools:

```bash
npm run inspector
```

This opens a web interface where you can:
- View all available tools
- Test tool execution with custom inputs
- Inspect request/response payloads

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed documentation on:
- Project structure
- Component interactions
- Data flow
- Customization points

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for solutions to common issues.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

See the [LICENSE](LICENSE) file for details.

## Links

- [Resend API Documentation](https://resend.com/docs/api-reference/introduction)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Changelog](CHANGELOG.md)
