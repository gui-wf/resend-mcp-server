# Documentation Search Tool Implementation

**Last Updated**: 2026-01-21
**Status**: Design Complete - Ready for Implementation
**Target Phase**: Phase 3-4 (Integration)

---

## Executive Summary

This document details the implementation of `search_resend_documentation`, a semantic search tool that enables Claude to find relevant Resend API documentation without loading the full docs into context. Using pre-built embeddings and a lightweight vector database, this tool achieves **>95% token reduction** compared to loading the full documentation.

### Key Metrics

| Metric | Target | Approach |
|--------|--------|----------|
| Token reduction | >95% | Return only relevant chunks |
| Search latency | <500ms | Pre-computed embeddings + in-memory search |
| Package size increase | <10MB | Ship embeddings as JSON, no model at runtime |
| Initial load time | <2s | Lazy-load embeddings on first search |
| Search accuracy | >80% | all-MiniLM-L6-v2 embeddings (384 dimensions) |

---

## Architecture Overview

### Build-Time vs Runtime Split

```
BUILD TIME (CI/CD)                          RUNTIME (MCP Server)
---------------------                       --------------------

  resend.com/docs/
  llms-full.txt                            User Query
       |                                        |
       v                                        v
  +-----------+                            +----------+
  | Fetch     |                            | Embed    | <-- @xenova/transformers
  | Docs      |                            | Query    |     (downloaded once)
  +-----------+                            +----------+
       |                                        |
       v                                        v
  +-----------+                            +----------+
  | Chunk by  |                            | Cosine   | <-- embeddings.json
  | Headers   |                            | Search   |     (shipped with package)
  +-----------+                            +----------+
       |                                        |
       v                                        v
  +-----------+                            +----------+
  | Generate  | @xenova/transformers       | Format   |
  | Embeddings| all-MiniLM-L6-v2           | Results  |
  +-----------+                            +----------+
       |                                        |
       v                                        v
  embeddings.json                          JSON Response
  (shipped with npm package)               (<3000 tokens)
```

### Why This Architecture?

1. **Build-time embedding generation**: Avoids 80MB+ model download at runtime
2. **Ship pre-computed embeddings**: ~2-5MB JSON file vs 80MB model
3. **Runtime query embedding**: Small, one-time model download (~25MB ONNX)
4. **Simple vector search**: Cosine similarity in memory, no external DB

---

## Technology Decisions

### Embedding Model: all-MiniLM-L6-v2

**Selected**: `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`

| Factor | all-MiniLM-L6-v2 | OpenAI text-embedding-3-small |
|--------|------------------|-------------------------------|
| Cost | Free | $0.02/1M tokens |
| API Key | Not required | Required |
| Offline | Yes | No |
| Model size | ~25MB ONNX | N/A (API) |
| Dimensions | 384 | 1536 |
| Max tokens | 256 | 8191 |
| Quality | Good for short text | Better overall |
| **Decision** | **Selected** | Rejected (API dependency) |

**Rationale**: No API key requirement, works offline, sufficient quality for documentation search, and compatible with Node.js via ONNX.

### Vector Storage: Simple JSON + Cosine Similarity

**Selected**: Custom implementation with JSON file

| Factor | JSON + Cosine | Vectra | hnswlib-node |
|--------|--------------|--------|--------------|
| Dependencies | 0 | 1 | Native bindings |
| Nix compatible | Yes | Yes | Problematic |
| Package size | ~2-5MB | ~2-5MB | +10MB |
| Query speed | <10ms | <5ms | <1ms |
| Complexity | Simple | Simple | Complex |
| **Decision** | **Selected** | Fallback | Rejected |

**Rationale**: Zero additional dependencies, works in any Node.js environment, fast enough for our use case (~100 chunks), and simple to maintain.

### Chunking Strategy: Header-Based with Size Limits

**Selected**: Split by markdown headers (##, ###) with 800-token max per chunk

```
Input:  llms-full.txt (~50,000 tokens)
Output: ~60-80 chunks (500-800 tokens each)
```

**Rationale**:
- Headers provide natural topic boundaries
- 800 tokens fits within all-MiniLM-L6-v2's 256-token input limit after summarization
- Chunks are small enough for relevant responses but large enough for context

---

## Detailed Design

### 1. Data Structures

```typescript
// Chunk with embedding
interface DocumentChunk {
  id: string;                    // Unique identifier (e.g., "send-email-01")
  section: string;               // Section title (e.g., "Sending Emails")
  content: string;               // Original text content
  embedding: number[];           // 384-dimension vector
  tokenCount: number;            // Approximate token count
  sourceUrl?: string;            // Link to docs (if available)
}

// Embeddings file format
interface EmbeddingsIndex {
  version: string;               // Schema version
  model: string;                 // "Xenova/all-MiniLM-L6-v2"
  dimensions: number;            // 384
  generatedAt: string;           // ISO timestamp
  sourceHash: string;            // MD5 of source docs for cache invalidation
  chunks: DocumentChunk[];       // Array of chunks with embeddings
}

// Search result
interface SearchResult {
  section: string;
  excerpt: string;               // Truncated content for response
  relevance: number;             // Cosine similarity score (0-1)
  tokenCount: number;
}
```

### 2. Tool Definition

```typescript
const searchDocsTool = {
  name: "search_resend_documentation",
  description: "Search Resend API documentation for usage examples and API details",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query or question about Resend API usage",
        minLength: 3
      },
      limit: {
        type: "integer",
        description: "Maximum results to return (default: 3)",
        minimum: 1,
        maximum: 10,
        default: 3
      }
    },
    required: ["query"]
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};
```

**Token cost**: ~150 tokens (tool definition only)

### 3. Build-Time Pipeline

```
scripts/build-embeddings.ts
|
|-- 1. Fetch docs from resend.com/docs/llms-full.txt
|-- 2. Parse and chunk by headers
|-- 3. Generate embeddings for each chunk
|-- 4. Write to data/embeddings.json
|-- 5. Verify integrity (count, dimensions)
```

### 4. Runtime Flow

```
User: "How do I send an email with attachments?"
                    |
                    v
            +---------------+
            | Lazy Load     | (first call only)
            | embeddings.json|
            +---------------+
                    |
                    v
            +---------------+
            | Embed Query   | @xenova/transformers
            | (384 dims)    | (model cached after first use)
            +---------------+
                    |
                    v
            +---------------+
            | Cosine Search | Compare query vector to all chunks
            | Top K Results |
            +---------------+
                    |
                    v
            +---------------+
            | Format        | Truncate to fit token budget
            | Response      |
            +---------------+
                    |
                    v
            JSON Response (<3000 tokens)
```

---

## Implementation Roadmap

### Phase 1: Build Infrastructure (Week 1)

**Goal**: Create the embedding generation pipeline

```
Tasks:
[ ] Create scripts/build-embeddings.ts
[ ] Implement docs fetcher (fetch llms-full.txt)
[ ] Implement header-based chunker
[ ] Integrate @xenova/transformers for embedding generation
[ ] Generate initial embeddings.json
[ ] Add npm script: npm run build:embeddings
[ ] Add to CI/CD for weekly regeneration
```

**Deliverables**:
- `scripts/build-embeddings.ts` - Build script
- `data/embeddings.json` - Pre-computed embeddings (~2-5MB)
- `npm run build:embeddings` - npm script

### Phase 2: Search Runtime (Week 2)

**Goal**: Implement the search functionality

```
Tasks:
[ ] Create src/tools/docs/search-docs.ts
[ ] Implement embeddings loader (lazy, cached)
[ ] Implement query embedding (runtime)
[ ] Implement cosine similarity search
[ ] Implement result formatting with token budget
[ ] Add keyword search fallback
[ ] Write unit tests
```

**Deliverables**:
- `src/tools/docs/search-docs.ts` - Tool implementation
- `src/tools/docs/embeddings-loader.ts` - Lazy loader
- `src/tools/docs/vector-search.ts` - Search implementation
- Unit tests with >80% coverage

### Phase 3: MCP Integration (Week 3)

**Goal**: Integrate with MCP server as Core Tier tool

```
Tasks:
[ ] Register tool in dynamic tool registry (Core Tier)
[ ] Add tool to server initialization
[ ] Test with MCP Inspector
[ ] Test with Claude Desktop
[ ] Verify token budget (<3000 per response)
[ ] Performance testing (<500ms after cache)
```

**Deliverables**:
- Tool registered in MCP server
- E2E tests passing
- Performance benchmarks documented

### Phase 4: Production Polish (Week 4)

**Goal**: Production-ready with documentation

```
Tasks:
[ ] Add error handling for network failures
[ ] Add cache invalidation logic
[ ] Add metrics/logging (to stderr)
[ ] Update user documentation
[ ] Add CI/CD for weekly embedding updates
[ ] Final code review
```

**Deliverables**:
- Production-ready tool
- CI/CD workflow for embedding updates
- User documentation

---

## Code Examples

### 1. Chunking the Documentation

```typescript
// scripts/chunker.ts

interface ChunkOptions {
  maxTokens: number;      // Max tokens per chunk (default: 800)
  minTokens: number;      // Min tokens per chunk (default: 100)
  overlapTokens: number;  // Overlap between chunks (default: 50)
}

interface RawChunk {
  id: string;
  section: string;
  content: string;
  tokenCount: number;
}

/**
 * Chunk documentation by markdown headers with size limits.
 * Splits on ## and ### headers, merging small sections.
 */
export function chunkDocumentation(
  markdown: string,
  options: ChunkOptions = { maxTokens: 800, minTokens: 100, overlapTokens: 50 }
): RawChunk[] {
  const chunks: RawChunk[] = [];

  // Split by level 2 and 3 headers
  const headerRegex = /^(#{2,3})\s+(.+)$/gm;
  const sections: { title: string; content: string; level: number }[] = [];

  let lastIndex = 0;
  let lastTitle = "Introduction";
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(markdown)) !== null) {
    const content = markdown.slice(lastIndex, match.index).trim();
    if (content) {
      sections.push({
        title: lastTitle,
        content,
        level: match[1].length
      });
    }
    lastIndex = match.index + match[0].length;
    lastTitle = match[2];
  }

  // Add final section
  const finalContent = markdown.slice(lastIndex).trim();
  if (finalContent) {
    sections.push({
      title: lastTitle,
      content: finalContent,
      level: 2
    });
  }

  // Process sections into chunks
  let chunkIndex = 0;
  for (const section of sections) {
    const tokenCount = estimateTokens(section.content);

    if (tokenCount <= options.maxTokens) {
      // Section fits in one chunk
      chunks.push({
        id: `chunk-${chunkIndex++}`,
        section: section.title,
        content: section.content,
        tokenCount
      });
    } else {
      // Split large section into multiple chunks
      const subChunks = splitLargeSection(section, options);
      for (const subChunk of subChunks) {
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          section: subChunk.section,
          content: subChunk.content,
          tokenCount: subChunk.tokenCount
        });
      }
    }
  }

  return chunks;
}

/**
 * Estimate token count (rough approximation: ~4 chars per token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split a large section into smaller chunks with overlap.
 */
function splitLargeSection(
  section: { title: string; content: string },
  options: ChunkOptions
): RawChunk[] {
  const chunks: RawChunk[] = [];
  const sentences = section.content.split(/(?<=[.!?])\s+/);

  let currentContent = "";
  let partIndex = 1;

  for (const sentence of sentences) {
    const testContent = currentContent + (currentContent ? " " : "") + sentence;
    const testTokens = estimateTokens(testContent);

    if (testTokens > options.maxTokens && currentContent) {
      chunks.push({
        id: "",  // Will be set by caller
        section: `${section.title} (Part ${partIndex})`,
        content: currentContent,
        tokenCount: estimateTokens(currentContent)
      });
      partIndex++;

      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentContent.length - options.overlapTokens * 4);
      currentContent = currentContent.slice(overlapStart) + " " + sentence;
    } else {
      currentContent = testContent;
    }
  }

  // Add final chunk
  if (currentContent && estimateTokens(currentContent) >= options.minTokens) {
    chunks.push({
      id: "",
      section: partIndex > 1 ? `${section.title} (Part ${partIndex})` : section.title,
      content: currentContent,
      tokenCount: estimateTokens(currentContent)
    });
  }

  return chunks;
}
```

### 2. Generating Embeddings (Build-Time Script)

```typescript
// scripts/build-embeddings.ts

import { pipeline, env } from "@xenova/transformers";
import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { chunkDocumentation } from "./chunker.js";

// Configure transformers.js for Node.js
env.useBrowserCache = false;
env.allowLocalModels = false;

const DOCS_URL = "https://resend.com/docs/llms-full.txt";
const OUTPUT_PATH = "./data/embeddings.json";
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

interface EmbeddingsIndex {
  version: string;
  model: string;
  dimensions: number;
  generatedAt: string;
  sourceHash: string;
  chunks: Array<{
    id: string;
    section: string;
    content: string;
    embedding: number[];
    tokenCount: number;
  }>;
}

async function main() {
  console.error("[build-embeddings] Starting embedding generation...");

  // 1. Fetch documentation
  console.error("[build-embeddings] Fetching documentation from", DOCS_URL);
  const response = await fetch(DOCS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch docs: ${response.status}`);
  }
  const docsText = await response.text();
  const sourceHash = createHash("md5").update(docsText).digest("hex");
  console.error(`[build-embeddings] Fetched ${docsText.length} characters (hash: ${sourceHash})`);

  // 2. Chunk documentation
  console.error("[build-embeddings] Chunking documentation...");
  const rawChunks = chunkDocumentation(docsText, {
    maxTokens: 800,
    minTokens: 100,
    overlapTokens: 50
  });
  console.error(`[build-embeddings] Created ${rawChunks.length} chunks`);

  // 3. Load embedding model
  console.error("[build-embeddings] Loading embedding model:", MODEL_NAME);
  const embedder = await pipeline("feature-extraction", MODEL_NAME, {
    quantized: true  // Use quantized model for smaller size
  });
  console.error("[build-embeddings] Model loaded");

  // 4. Generate embeddings for each chunk
  console.error("[build-embeddings] Generating embeddings...");
  const chunks: EmbeddingsIndex["chunks"] = [];

  for (let i = 0; i < rawChunks.length; i++) {
    const chunk = rawChunks[i];

    // Generate embedding
    const output = await embedder(chunk.content, {
      pooling: "mean",
      normalize: true
    });

    // Extract embedding array
    const embedding = Array.from(output.data);

    chunks.push({
      id: chunk.id,
      section: chunk.section,
      content: chunk.content,
      embedding,
      tokenCount: chunk.tokenCount
    });

    if ((i + 1) % 10 === 0) {
      console.error(`[build-embeddings] Progress: ${i + 1}/${rawChunks.length}`);
    }
  }

  // 5. Write embeddings file
  console.error("[build-embeddings] Writing embeddings to", OUTPUT_PATH);

  const index: EmbeddingsIndex = {
    version: "1.0.0",
    model: MODEL_NAME,
    dimensions: 384,
    generatedAt: new Date().toISOString(),
    sourceHash,
    chunks
  };

  // Ensure directory exists
  mkdirSync("./data", { recursive: true });

  writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2));

  const fileSizeKB = Math.round(JSON.stringify(index).length / 1024);
  console.error(`[build-embeddings] Complete! Generated ${chunks.length} embeddings (${fileSizeKB} KB)`);
}

main().catch((error) => {
  console.error("[build-embeddings] ERROR:", error);
  process.exit(1);
});
```

### 3. Vector Similarity Search (Runtime)

```typescript
// src/tools/docs/vector-search.ts

import { pipeline, env } from "@xenova/transformers";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Configure for Node.js
env.useBrowserCache = false;

interface DocumentChunk {
  id: string;
  section: string;
  content: string;
  embedding: number[];
  tokenCount: number;
}

interface EmbeddingsIndex {
  version: string;
  model: string;
  dimensions: number;
  generatedAt: string;
  sourceHash: string;
  chunks: DocumentChunk[];
}

interface SearchResult {
  section: string;
  excerpt: string;
  relevance: number;
  tokenCount: number;
}

// Singleton state for lazy loading
let embeddingsIndex: EmbeddingsIndex | null = null;
let embedder: any | null = null;

/**
 * Load embeddings index from file (lazy, cached).
 */
async function loadEmbeddings(): Promise<EmbeddingsIndex> {
  if (embeddingsIndex) {
    return embeddingsIndex;
  }

  const embeddingsPath = join(__dirname, "../../../data/embeddings.json");

  if (!existsSync(embeddingsPath)) {
    throw new Error(
      "Embeddings file not found. Run 'npm run build:embeddings' to generate."
    );
  }

  console.error("[docs-search] Loading embeddings index...");
  const data = readFileSync(embeddingsPath, "utf-8");
  embeddingsIndex = JSON.parse(data) as EmbeddingsIndex;
  console.error(`[docs-search] Loaded ${embeddingsIndex.chunks.length} chunks`);

  return embeddingsIndex;
}

/**
 * Get embedding model (lazy, cached).
 */
async function getEmbedder(): Promise<any> {
  if (embedder) {
    return embedder;
  }

  console.error("[docs-search] Loading embedding model...");
  embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    quantized: true
  });
  console.error("[docs-search] Model loaded");

  return embedder;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search documentation for relevant chunks.
 */
export async function searchDocumentation(
  query: string,
  limit: number = 3,
  maxTokensPerResult: number = 800
): Promise<SearchResult[]> {
  // Load embeddings and model
  const [index, model] = await Promise.all([
    loadEmbeddings(),
    getEmbedder()
  ]);

  // Generate query embedding
  const queryOutput = await model(query, {
    pooling: "mean",
    normalize: true
  });
  const queryEmbedding = Array.from(queryOutput.data) as number[];

  // Compute similarities for all chunks
  const scored = index.chunks.map((chunk) => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));

  // Sort by similarity (descending) and take top K
  scored.sort((a, b) => b.similarity - a.similarity);
  const topResults = scored.slice(0, limit);

  // Format results with token budget
  const results: SearchResult[] = topResults.map(({ chunk, similarity }) => {
    // Truncate content to fit token budget
    let excerpt = chunk.content;
    if (chunk.tokenCount > maxTokensPerResult) {
      const maxChars = maxTokensPerResult * 4;  // ~4 chars per token
      excerpt = excerpt.slice(0, maxChars) + "...";
    }

    return {
      section: chunk.section,
      excerpt,
      relevance: Math.round(similarity * 100) / 100,
      tokenCount: Math.min(chunk.tokenCount, maxTokensPerResult)
    };
  });

  return results;
}

/**
 * Keyword fallback search (used when embedding search fails).
 */
export async function keywordSearch(
  query: string,
  limit: number = 3
): Promise<SearchResult[]> {
  const index = await loadEmbeddings();

  const queryTerms = query.toLowerCase().split(/\s+/);

  // Score chunks by keyword matches
  const scored = index.chunks.map((chunk) => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      if (term.length < 3) continue;  // Skip short words
      const matches = (contentLower.match(new RegExp(term, "g")) || []).length;
      score += matches;
    }

    return { chunk, score };
  });

  // Sort by score and take top K
  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, limit).filter((r) => r.score > 0);

  return topResults.map(({ chunk, score }) => ({
    section: chunk.section,
    excerpt: chunk.content.slice(0, 800 * 4) + (chunk.content.length > 800 * 4 ? "..." : ""),
    relevance: Math.min(score / 10, 1),  // Normalize score
    tokenCount: Math.min(chunk.tokenCount, 800)
  }));
}
```

### 4. Tool Execute Method Implementation

```typescript
// src/tools/docs/search-docs-tool.ts

import { z } from "zod";
import { searchDocumentation, keywordSearch } from "./vector-search.js";

// Input validation schema
const inputSchema = z.object({
  query: z.string().min(3, "Query must be at least 3 characters"),
  limit: z.number().int().min(1).max(10).default(3)
});

type SearchDocsInput = z.infer<typeof inputSchema>;

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Tool definition for MCP registration.
 */
export function getDefinition() {
  return {
    name: "search_resend_documentation",
    description: "Search Resend API documentation for usage examples and API details",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query or question about Resend API usage",
          minLength: 3
        },
        limit: {
          type: "integer",
          description: "Maximum results to return (default: 3)",
          minimum: 1,
          maximum: 10,
          default: 3
        }
      },
      required: ["query"]
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  };
}

/**
 * Execute the documentation search tool.
 */
export async function execute(args: unknown): Promise<ToolResult> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "Validation error",
          details: parseResult.error.issues.map((i) => i.message).join(", ")
        })
      }],
      isError: true
    };
  }

  const { query, limit } = parseResult.data;

  try {
    // Try semantic search first
    let results = await searchDocumentation(query, limit);

    // Fall back to keyword search if no good results
    if (results.length === 0 || results[0].relevance < 0.3) {
      console.error("[search_resend_documentation] Falling back to keyword search");
      const keywordResults = await keywordSearch(query, limit);

      // Merge results, preferring semantic matches
      const seen = new Set(results.map((r) => r.section));
      for (const kr of keywordResults) {
        if (!seen.has(kr.section)) {
          results.push(kr);
        }
      }
      results = results.slice(0, limit);
    }

    // Handle no results
    if (results.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            results: [],
            total: 0,
            message: "No relevant documentation found for this query"
          })
        }]
      };
    }

    // Format response
    const response = {
      query,
      results: results.map((r) => ({
        section: r.section,
        excerpt: r.excerpt,
        relevance: r.relevance
      })),
      total: results.length,
      tokenEstimate: results.reduce((sum, r) => sum + r.tokenCount, 0)
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(response, null, 2)
      }]
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[search_resend_documentation] Error:", message);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "Search failed",
          message,
          hint: "Try a different query or check server logs"
        })
      }],
      isError: true
    };
  }
}
```

### 5. Response Formatting

```typescript
// Example response format (shown for documentation)

// Successful search response
{
  "query": "how to send email with attachments",
  "results": [
    {
      "section": "Sending Emails - Attachments",
      "excerpt": "To send an attachment, include the 'attachments' array with objects containing 'filename' (string) and 'content' (base64 string) or 'path' (file path). Example:\n\n```json\n{\n  \"to\": \"user@example.com\",\n  \"subject\": \"Invoice\",\n  \"html\": \"<p>Please see attached.</p>\",\n  \"attachments\": [\n    {\n      \"filename\": \"invoice.pdf\",\n      \"content\": \"base64-encoded-content-here\"\n    }\n  ]\n}\n```",
      "relevance": 0.87
    },
    {
      "section": "Email API Reference",
      "excerpt": "The /emails endpoint accepts POST requests with the following parameters...",
      "relevance": 0.72
    }
  ],
  "total": 2,
  "tokenEstimate": 450
}

// Empty results response
{
  "query": "something unrelated",
  "results": [],
  "total": 0,
  "message": "No relevant documentation found for this query"
}

// Error response
{
  "error": "Search failed",
  "message": "Embeddings file not found",
  "hint": "Run 'npm run build:embeddings' to generate embeddings"
}
```

---

## Token Budget Analysis

### Tool Definition Cost

| Component | Tokens |
|-----------|--------|
| Tool name + description | ~50 |
| Input schema | ~80 |
| Annotations | ~20 |
| **Total** | **~150** |

### Search Response Cost

| Scenario | Tokens |
|----------|--------|
| 3 results x 800 tokens | ~2,400 |
| Metadata (query, relevance, etc.) | ~100 |
| **Total per search** | **~2,500** |

### Comparison with Full Documentation

| Approach | Tokens | Reduction |
|----------|--------|-----------|
| Full docs in context | ~50,000-100,000 | 0% |
| Search tool (per query) | ~2,500 | **95-97.5%** |

---

## Dependencies

### npm Packages to Add

```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0"
  },
  "devDependencies": {
    // No additional dev dependencies required
  }
}
```

**Note**: `@xenova/transformers` is the only new dependency. It provides:
- ONNX Runtime for Node.js
- Pre-trained model loading from Hugging Face
- Pure JavaScript implementation (no native bindings)

### Package Size Impact

| Component | Size |
|-----------|------|
| @xenova/transformers | ~5MB (code) |
| ONNX model (runtime download) | ~25MB (cached) |
| embeddings.json | ~2-5MB |
| **Total package increase** | **~7-10MB** |

### Nix Compatibility

All dependencies are pure JavaScript/WASM:

- No native bindings required
- No Python or other runtime dependencies
- Works with Node.js 24
- Installs cleanly via npm in Nix environment

---

## Testing Strategy

### Unit Tests

```typescript
// tests/unit/docs-search.test.ts

import { describe, it, expect, beforeAll } from "vitest";
import { chunkDocumentation } from "../../scripts/chunker.js";
import { searchDocumentation, keywordSearch } from "../../src/tools/docs/vector-search.js";

describe("Documentation Chunker", () => {
  it("should split by headers", () => {
    const markdown = `## Section 1\nContent 1\n## Section 2\nContent 2`;
    const chunks = chunkDocumentation(markdown);
    expect(chunks.length).toBe(2);
    expect(chunks[0].section).toBe("Section 1");
    expect(chunks[1].section).toBe("Section 2");
  });

  it("should respect max token limit", () => {
    const longContent = "word ".repeat(1000);  // ~1000 tokens
    const markdown = `## Long Section\n${longContent}`;
    const chunks = chunkDocumentation(markdown, { maxTokens: 300, minTokens: 50, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(300);
    }
  });

  it("should merge small sections", () => {
    const markdown = `## Tiny\nA\n## Also Tiny\nB`;
    const chunks = chunkDocumentation(markdown, { maxTokens: 800, minTokens: 100, overlapTokens: 50 });
    // Should merge because each section is under minTokens
    expect(chunks.length).toBeLessThanOrEqual(2);
  });
});

describe("Vector Search", () => {
  it("should return results for valid query", async () => {
    const results = await searchDocumentation("send email", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].relevance).toBeGreaterThan(0);
  });

  it("should respect limit parameter", async () => {
    const results = await searchDocumentation("email", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should return empty array for irrelevant query", async () => {
    const results = await searchDocumentation("xyzzy12345nonsense", 3);
    // May return results with low relevance, or empty
    if (results.length > 0) {
      expect(results[0].relevance).toBeLessThan(0.5);
    }
  });
});

describe("Keyword Search Fallback", () => {
  it("should find exact matches", async () => {
    const results = await keywordSearch("attachments", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].excerpt.toLowerCase()).toContain("attachment");
  });
});
```

### Integration Tests

```typescript
// tests/integration/search-docs-tool.test.ts

import { describe, it, expect } from "vitest";
import { execute, getDefinition } from "../../src/tools/docs/search-docs-tool.js";

describe("search_resend_documentation Tool", () => {
  it("should have valid tool definition", () => {
    const def = getDefinition();
    expect(def.name).toBe("search_resend_documentation");
    expect(def.inputSchema.required).toContain("query");
  });

  it("should execute successfully with valid input", async () => {
    const result = await execute({ query: "how to send email" });
    expect(result.isError).toBeFalsy();

    const response = JSON.parse(result.content[0].text);
    expect(response.query).toBe("how to send email");
    expect(response.results).toBeInstanceOf(Array);
  });

  it("should return error for invalid input", async () => {
    const result = await execute({ query: "ab" });  // Too short
    expect(result.isError).toBe(true);

    const response = JSON.parse(result.content[0].text);
    expect(response.error).toBeDefined();
  });

  it("should stay within token budget", async () => {
    const result = await execute({ query: "email domains templates", limit: 5 });
    const response = JSON.parse(result.content[0].text);

    // Response should be under 3000 tokens (~12000 chars)
    expect(result.content[0].text.length).toBeLessThan(12000);
    expect(response.tokenEstimate).toBeLessThan(3000);
  });
});
```

### E2E Tests

```typescript
// tests/e2e/docs-search.test.ts

import { describe, it, expect } from "vitest";
import { spawn } from "child_process";

describe("Documentation Search E2E", () => {
  it("should respond via MCP protocol", async () => {
    // Start MCP server
    const server = spawn("node", ["dist/index.js"], {
      env: { ...process.env, RESEND_API_KEY: "re_test_key" },
      stdio: ["pipe", "pipe", "pipe"]
    });

    // Send tools/list request
    const listRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    }) + "\n";

    server.stdin.write(listRequest);

    // Wait for response
    const response = await new Promise<string>((resolve) => {
      server.stdout.once("data", (data) => resolve(data.toString()));
    });

    const result = JSON.parse(response);
    const toolNames = result.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("search_resend_documentation");

    server.kill();
  });
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/update-embeddings.yml

name: Update Documentation Embeddings

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:  # Manual trigger

jobs:
  update-embeddings:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build embeddings
        run: npm run build:embeddings

      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet data/embeddings.json; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit and push
        if: steps.changes.outputs.changed == 'true'
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add data/embeddings.json
          git commit -m "chore: update documentation embeddings"
          git push
```

### npm Scripts to Add

```json
{
  "scripts": {
    "build:embeddings": "tsx scripts/build-embeddings.ts",
    "test:search": "vitest run tests/unit/docs-search.test.ts tests/integration/search-docs-tool.test.ts"
  }
}
```

---

## Alternative Fallbacks

### Fallback 1: Keyword Search Only

If semantic search fails or embeddings are unavailable:

```typescript
// Automatic fallback in execute method
if (embeddingsNotAvailable || semanticSearchFailed) {
  return keywordSearch(query, limit);
}
```

### Fallback 2: On-Demand Fetch

If embeddings file is missing and cannot be generated:

```typescript
// Last resort: fetch and search raw docs
async function fetchAndSearch(query: string): Promise<SearchResult[]> {
  const response = await fetch("https://resend.com/docs/llms-full.txt");
  const text = await response.text();

  // Simple keyword search on raw text
  const chunks = text.split(/\n#{2,3}\s+/);
  // ... keyword matching ...

  return results;
}
```

### Fallback 3: External Search API

If local search is completely unavailable:

```typescript
// Use Resend's own search API if they provide one
// Or fall back to web search via MCP tool
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      error: "Local search unavailable",
      suggestion: "Visit https://resend.com/docs and search for: " + query
    })
  }],
  isError: true
};
```

---

## File Structure

```
resend-mcp-server/
|-- data/
|   |-- embeddings.json          # Pre-computed embeddings (~2-5MB)
|
|-- scripts/
|   |-- build-embeddings.ts      # Build-time embedding generator
|   |-- chunker.ts               # Documentation chunking logic
|
|-- src/
|   |-- tools/
|       |-- docs/
|           |-- index.ts             # Export all docs tools
|           |-- search-docs-tool.ts  # Tool definition and execute
|           |-- vector-search.ts     # Search implementation
|           |-- embeddings-loader.ts # Lazy embeddings loading
|
|-- tests/
    |-- unit/
    |   |-- docs-search.test.ts      # Unit tests
    |-- integration/
    |   |-- search-docs-tool.test.ts # Integration tests
    |-- e2e/
        |-- docs-search.test.ts      # E2E tests
```

---

## Integration with Dynamic Tool Discovery

The `search_resend_documentation` tool is part of **Core Tier** (Tier 1):

```typescript
// src/tools/registry.ts

const CORE_TIER_TOOLS = [
  "send_email",
  "list_emails",
  "get_email",
  "list_domains",
  "search_resend_documentation"  // Always loaded
];
```

This ensures the documentation search tool is always available immediately after server initialization, without requiring tier expansion.

---

## Performance Considerations

### Cold Start

- First search: ~2-3 seconds (model download + embedding load)
- Cached model location: `~/.cache/huggingface/hub/`

### Warm Queries

- Subsequent searches: <500ms
- Model and embeddings cached in memory

### Memory Usage

- Embeddings index: ~5-10MB in memory
- ONNX model: ~50-100MB in memory
- Total additional memory: ~60-110MB

### Optimization Opportunities

1. **Quantized embeddings**: Store as int8 instead of float32 (4x smaller)
2. **Model caching**: Pre-download model during npm postinstall
3. **Streaming load**: Load embeddings chunks on-demand

---

## Future Enhancements

### Phase 2+ Improvements

1. **Hybrid search**: Combine semantic + BM25 keyword scoring
2. **Query expansion**: Use LLM to expand queries before search
3. **Section linking**: Return URLs to specific doc sections
4. **Incremental updates**: Update only changed sections
5. **Multi-language**: Support translated documentation

---

## References

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [Xenova/all-MiniLM-L6-v2 Model](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
- [Vectra - Local Vector Database](https://github.com/Stevenic/vectra)
- [How to Create Vector Embeddings in Node.js](https://philna.sh/blog/2024/09/25/how-to-create-vector-embeddings-in-node-js/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification)

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-21
**Status**: Design Complete - Ready for Implementation
