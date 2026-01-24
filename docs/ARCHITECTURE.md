# Architecture

This document describes the architecture of the Resend MCP Server, including its directory structure, key components, data flow, and customization points.

## Directory Structure

```
resend-mcp-server/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── config/
│   │   └── environment.ts          # Environment validation with Zod
│   ├── services/
│   │   ├── tool-registry.ts        # Dynamic tool loading/discovery
│   │   └── rate-limiter.ts         # API rate limiting
│   ├── tools/
│   │   └── docs/
│   │       ├── index.ts            # Documentation search exports
│   │       ├── search-docs-tool.ts # Search tool implementation
│   │       ├── embeddings-loader.ts# Vector embeddings management
│   │       ├── vector-search.ts    # Semantic search engine
│   │       └── types.ts            # Type definitions
│   ├── types/
│   │   └── *.ts                    # Shared TypeScript interfaces
│   └── utils/
│       └── mcp-errors.ts           # Structured error handling
├── data/
│   └── embeddings.json             # Pre-built documentation embeddings
├── scripts/
│   └── build-embeddings.ts         # Embeddings generation script
├── tests/
│   └── *.test.ts                   # Vitest test files
└── dist/                           # Compiled JavaScript output
```

## Key Components

### MCP Server Entry Point (`src/index.ts`)

The main server file that:
- Validates environment configuration
- Creates the MCP Server instance
- Registers request handlers for `tools/list` and `tools/call`
- Connects via stdio transport

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client (Claude)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ stdio
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      src/index.ts                            │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ ListToolsHandler│  │ CallToolHandler │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
└───────────┼────────────────────┼────────────────────────────┘
            │                    │
            ▼                    ▼
┌───────────────────────────────────────────────────────────┐
│                    Tool Registry                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │   Core   │  │Secondary │  │ Tertiary │                 │
│  │  Tools   │  │  Tools   │  │  Tools   │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
└───────────────────────────────────────────────────────────┘
```

### Environment Configuration (`src/config/environment.ts`)

Handles all environment variable validation using Zod schemas:

- **RESEND_API_KEY**: Required, validates format (must start with `re_`)
- **RESEND_MCP_DEFAULT_TIER**: Tool tier selection
- **RESEND_MCP_SCOPES**: Permission scopes
- **RESEND_RATE_LIMIT_MS**: Rate limiting interval
- **RESEND_DEBUG**: Debug mode toggle

Configuration is loaded once and cached for subsequent access.

### Tool Registry (`src/services/tool-registry.ts`)

Manages dynamic tool discovery and access control:

**Tier System:**
- **Core**: Essential tools always available (send_email, list_domains, get_email, search_docs)
- **Secondary**: Common features (batch_send, domain management)
- **Tertiary**: Advanced/admin features (contacts, audiences, API keys)

**Key Functions:**
- `registerTool()`: Add a tool to the registry
- `loadTier()`: Enable tools up to a specific tier
- `loadByScope()`: Enable tools matching specific scopes
- `getEnabledTools()`: Return MCP tool definitions
- `notifyToolsChanged()`: Signal clients to refresh tool list

### Documentation Search (`src/tools/docs/`)

Provides semantic search over Resend API documentation:

```
┌──────────────────────────────────────────────────────────────┐
│                    Search Flow                                │
│                                                              │
│  Query ──► Embedding ──► Vector Search ──► Results          │
│              │                 │              │              │
│              ▼                 ▼              ▼              │
│         Xenova/         Cosine          Token Budget        │
│        transformers    Similarity       Truncation          │
│                                                              │
│  Fallback: Keyword Search (if semantic scores low)          │
└──────────────────────────────────────────────────────────────┘
```

**Components:**
- `search-docs-tool.ts`: MCP tool interface, input validation
- `vector-search.ts`: Semantic and keyword search implementation
- `embeddings-loader.ts`: Loads pre-built vector embeddings
- `types.ts`: TypeScript interfaces for search results

### Rate Limiter (`src/services/rate-limiter.ts`)

Prevents API quota exhaustion with configurable delays:

- Token bucket algorithm
- Configurable interval via `RESEND_RATE_LIMIT_MS`
- Automatic queuing of requests

## Data Flow

### Tool Execution Flow

```
1. Claude sends tools/call request
   │
2. Server receives request via stdio
   │
3. Request handler extracts tool name and arguments
   │
4. Tool registry checks if tool is enabled
   │
5. Input validation with Zod schema
   │
6. Rate limiter checks/delays if needed
   │
7. Tool executes (API call or local operation)
   │
8. Response formatted as MCP content
   │
9. Response sent back to Claude
```

### Documentation Search Flow

```
1. User query received
   │
2. Query embedded using Xenova/transformers model
   │
3. Cosine similarity computed against all doc chunks
   │
4. Results sorted by relevance score
   │
5. If best score < threshold, fall back to keyword search
   │
6. Token budget applied (truncate if over limit)
   │
7. Structured JSON response returned
```

## Customization Points

### Adding New Tools

1. Create tool file in `src/tools/<category>/`:

```typescript
import { z } from "zod";

const inputSchema = z.object({
  // Define parameters
});

export function getDefinition() {
  return {
    name: "tool_name",
    description: "Tool description",
    inputSchema: {
      type: "object",
      properties: { /* JSON Schema */ },
      required: [],
    },
  };
}

export async function execute(args: unknown) {
  const input = inputSchema.parse(args);
  // Implementation
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}
```

2. Register in `src/index.ts` or via tool registry

3. Assign tier and scopes in `tool-registry.ts`

### Modifying Documentation Index

1. Update source documents in scraping/fetching scripts
2. Run `npm run build:embeddings`
3. New `data/embeddings.json` generated

### Adjusting Token Budget

In `src/tools/docs/search-docs-tool.ts`:

```typescript
const MAX_TOTAL_TOKENS = 2800;  // Adjust as needed
const DEFAULT_LIMIT = 3;        // Default result count
```

### Custom Rate Limiting

Set via environment variable:

```bash
export RESEND_RATE_LIMIT_MS=1000  # 1 second between requests
```

## Error Handling

All errors are returned as structured JSON:

```typescript
{
  content: [{
    type: "text",
    text: JSON.stringify({
      error: true,
      message: "Error description",
      hint: "Helpful suggestion"
    })
  }],
  isError: true
}
```

Never throw exceptions from tool handlers. Always return structured error responses.

## Logging

Use `console.error` for all logging. stdout is reserved for MCP protocol:

```typescript
const log = (message: string) => console.error(`[module-name] ${message}`);
```

Enable debug logging with `RESEND_DEBUG=true`.
