# Resend MCP Server

A comprehensive Model Context Protocol (MCP) server for the [Resend](https://resend.com) email API. This server enables AI assistants to manage emails, domains, templates, contacts, and more through a standardized interface.

## Disclaimer

**This is an unofficial, community-developed project.** It is not affiliated with, endorsed by, or supported by Resend. Use at your own risk.

## Features

- Send emails (single and batch)
- Manage email domains
- Create and manage contacts and audiences
- Handle email templates
- Retrieve email delivery information
- API key management

## Installation

```bash
# Clone the repository
git clone https://github.com/gui-wf/resend-mcp-server.git
cd resend-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Set the `RESEND_API_KEY` environment variable with your Resend API key:

```bash
export RESEND_API_KEY=re_your_api_key_here
```

You can obtain an API key from the [Resend Dashboard](https://resend.com/api-keys).

## Usage

### Running the Server

```bash
npm run dev    # Development mode
npm start      # Production mode
```

### MCP Client Configuration

Add the following to your MCP client configuration:

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

### Available Tools

*Documentation coming soon...*

## Development

```bash
# Enter Nix development shell (if using Nix)
nix develop

# Run tests
npm test

# Run MCP Inspector for debugging
npm run inspector
```

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See the [LICENSE](LICENSE) file for details.

## Links

- [Resend API Documentation](https://resend.com/docs/api-reference/introduction)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
