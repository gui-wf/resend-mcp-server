/**
 * MCP Tool implementation for searching Resend documentation.
 * Provides semantic search with keyword fallback for documentation queries.
 */

import { z } from "zod";
import type { SearchResult, SearchResponse, SearchErrorResponse } from "./types.js";
import { semanticSearch, keywordSearch, truncateToTokenBudget } from "./vector-search.js";

// AIDEV-NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[docs-search] ${message}`);

/** Minimum relevance threshold for semantic search results */
const SEMANTIC_RELEVANCE_THRESHOLD = 0.3;

/** Maximum total tokens across all results */
const MAX_TOTAL_TOKENS = 2800;

/** Default number of results to return */
const DEFAULT_LIMIT = 3;

/** Minimum query length */
const MIN_QUERY_LENGTH = 3;

/** Maximum query length */
const MAX_QUERY_LENGTH = 500;

/** Maximum results allowed */
const MAX_LIMIT = 10;

/**
 * Zod schema for input validation.
 */
const inputSchema = z.object({
  query: z
    .string()
    .min(MIN_QUERY_LENGTH, `Query must be at least ${MIN_QUERY_LENGTH} characters`)
    .max(MAX_QUERY_LENGTH, `Query must be at most ${MAX_QUERY_LENGTH} characters`)
    .describe("Search query or question about Resend API usage"),
  limit: z
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(MAX_LIMIT, `Limit must be at most ${MAX_LIMIT}`)
    .default(DEFAULT_LIMIT)
    .describe("Maximum number of results to return (1-10, default: 3)"),
});

type SearchInput = z.infer<typeof inputSchema>;

/**
 * Get the MCP tool definition for search_resend_documentation.
 * Includes annotations for tool behavior hints.
 *
 * @returns Tool definition object
 */
export function getDefinition() {
  return {
    name: "search_resend_documentation",
    description:
      "Search Resend API documentation using semantic search. Returns relevant documentation " +
      "excerpts for API usage, code examples, error handling, and best practices. Use this " +
      "when you need information about sending emails, managing domains, contacts, audiences, " +
      "templates, or any other Resend API features.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query or question about Resend API usage",
          minLength: MIN_QUERY_LENGTH,
          maxLength: MAX_QUERY_LENGTH,
        },
        limit: {
          type: "integer",
          description: "Maximum number of results to return (1-10, default: 3)",
          minimum: 1,
          maximum: MAX_LIMIT,
          default: DEFAULT_LIMIT,
        },
      },
      required: ["query"],
    },
    annotations: {
      // Tool behavior hints for MCP clients
      title: "Search Resend Documentation",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
}

/**
 * Execute a documentation search.
 *
 * @param args - Raw arguments from MCP call
 * @returns MCP tool response with search results or error
 */
export async function execute(args: unknown): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);

  if (!parseResult.success) {
    const errorMessage = parseResult.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");

    const errorResponse: SearchErrorResponse = {
      error: true,
      message: `Invalid input: ${errorMessage}`,
      hint: "Provide a 'query' string (3-500 chars) and optional 'limit' (1-10)",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(errorResponse, null, 2) }],
      isError: true,
    };
  }

  const input: SearchInput = parseResult.data;
  log(`Searching documentation: "${input.query}" (limit: ${input.limit})`);

  try {
    // Try semantic search first
    let results = await semanticSearch(input.query, input.limit);
    let searchType: "semantic" | "keyword" | "hybrid" = "semantic";

    // Check if best semantic result meets quality threshold
    // Fall back to keyword search if no results OR best result is below threshold
    const bestScore = results[0]?.score ?? 0;

    if (results.length === 0 || bestScore < SEMANTIC_RELEVANCE_THRESHOLD) {
      // Fall back to keyword search
      log(
        `Semantic search returned low relevance results (best: ${bestScore.toFixed(3)}), falling back to keyword search`
      );
      const keywordResults = await keywordSearch(input.query, input.limit);

      if (keywordResults.length > 0) {
        // Use keyword results, mark as keyword search type
        results = keywordResults;
        searchType = "keyword";
      } else if (results.length === 0) {
        // No results from either search
        const noResultsResponse: SearchResponse = {
          query: input.query,
          searchType: "keyword",
          resultCount: 0,
          totalTokens: 0,
          results: [],
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(noResultsResponse, null, 2),
            },
          ],
        };
      }
      // If keyword search returned nothing but we have some semantic results,
      // keep the semantic results even if below threshold
    }

    // Apply token budget
    const searchResults = applyTokenBudget(results, MAX_TOTAL_TOKENS);

    // Calculate total tokens
    const totalTokens = searchResults.reduce((sum, r) => sum + r.tokenCount, 0);

    // Build response
    const response: SearchResponse = {
      query: input.query,
      searchType,
      resultCount: searchResults.length,
      totalTokens,
      results: searchResults,
    };

    log(
      `Search complete: ${searchResults.length} results, ${totalTokens} tokens, type: ${searchType}`
    );

    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Search error: ${errorMessage}`);

    const errorResponse: SearchErrorResponse = {
      error: true,
      message: `Search failed: ${errorMessage}`,
      hint: errorMessage.includes("embeddings")
        ? "Run 'npm run build:embeddings' to generate the embeddings index"
        : "Check server logs for details",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(errorResponse, null, 2) }],
      isError: true,
    };
  }
}

/**
 * Apply token budget to search results.
 * Truncates results to fit within the total token limit.
 *
 * @param results - Scored chunks from search
 * @param maxTotalTokens - Maximum total tokens allowed
 * @returns Array of SearchResult objects within budget
 */
function applyTokenBudget(
  results: Array<{
    id: string;
    section: string;
    content: string;
    tokenCount: number;
    score: number;
    sourceUrl?: string;
  }>,
  maxTotalTokens: number
): SearchResult[] {
  const searchResults: SearchResult[] = [];
  let remainingTokens = maxTotalTokens;

  for (const result of results) {
    if (remainingTokens <= 0) {
      break;
    }

    let excerpt = result.content;
    let tokenCount = result.tokenCount;

    // Truncate if needed to fit remaining budget
    if (tokenCount > remainingTokens) {
      excerpt = truncateToTokenBudget(excerpt, remainingTokens);
      tokenCount = remainingTokens;
    }

    searchResults.push({
      section: result.section,
      excerpt,
      relevance: Math.round(result.score * 1000) / 1000, // Round to 3 decimal places
      tokenCount,
      sourceUrl: result.sourceUrl,
    });

    remainingTokens -= tokenCount;
  }

  return searchResults;
}
