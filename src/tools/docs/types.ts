/**
 * Runtime types for the documentation search tool.
 * These types are used during search execution, distinct from the build-time types
 * in scripts/types.ts used for embedding generation.
 */

/**
 * A search result returned to the user.
 * Contains the relevant excerpt and metadata about the match.
 */
export interface SearchResult {
  /** Section header or title of the matched documentation */
  section: string;
  /** Relevant excerpt from the documentation (may be truncated) */
  excerpt: string;
  /** Relevance score (0-1 for semantic, simple match for keyword) */
  relevance: number;
  /** Estimated token count of the excerpt */
  tokenCount: number;
  /** Optional source URL for the documentation */
  sourceUrl?: string;
}

/**
 * Internal representation of a chunk with its similarity score.
 * Used during search ranking before transforming to SearchResult.
 */
export interface ScoredChunk {
  /** Unique identifier for the chunk */
  id: string;
  /** Section header or title */
  section: string;
  /** Full content of the chunk */
  content: string;
  /** Token count of the chunk */
  tokenCount: number;
  /** Similarity score (cosine similarity for semantic search) */
  score: number;
  /** Optional source URL */
  sourceUrl?: string;
}

/**
 * Successful search response structure.
 */
export interface SearchResponse {
  /** The search query that was executed */
  query: string;
  /** Type of search performed */
  searchType: "semantic" | "keyword" | "hybrid";
  /** Number of results returned */
  resultCount: number;
  /** Total tokens across all results */
  totalTokens: number;
  /** The search results */
  results: SearchResult[];
}

/**
 * Error response structure for search failures.
 */
export interface SearchErrorResponse {
  /** Error indicator */
  error: true;
  /** Error message */
  message: string;
  /** Optional hint for resolving the error */
  hint?: string;
}

/**
 * Union type for search responses.
 */
export type SearchResponseType = SearchResponse | SearchErrorResponse;
