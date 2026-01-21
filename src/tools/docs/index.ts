/**
 * Documentation search tool module exports.
 * Provides semantic search functionality for Resend API documentation.
 */

// Tool implementation
export {
  getDefinition as getSearchDocsDefinition,
  execute as executeSearchDocs,
} from "./search-docs-tool.js";

// Types for consumers
export type {
  SearchResult,
  SearchResponse,
  SearchErrorResponse,
  SearchResponseType,
  ScoredChunk,
} from "./types.js";

// Utilities for testing/debugging
export {
  loadEmbeddings,
  getLoadedEmbeddings,
  clearEmbeddingsCache,
  isEmbeddingsLoaded,
} from "./embeddings-loader.js";

export {
  semanticSearch,
  keywordSearch,
  cosineSimilarity,
  truncateToTokenBudget,
  getEmbeddingsStats,
} from "./vector-search.js";
