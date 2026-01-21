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

// Error handling
export {
  DocsErrorCode,
  createDocsError,
  isDocsError,
  toDocsError,
  formatErrorResponse,
  type DocsError,
} from "./errors.js";

// Metrics
export {
  recordSearch,
  recordSearchError,
  recordModelLoaded,
  recordEmbeddingsLoaded,
  setEmbeddingsCacheStatus,
  getSearchStats,
  clearMetricsHistory,
  getHistorySize,
  type SearchMetrics,
  type MetricType,
} from "./metrics.js";

// Utilities for testing/debugging
export {
  loadEmbeddings,
  getLoadedEmbeddings,
  clearEmbeddingsCache,
  isEmbeddingsLoaded,
  getFreshnessWarning,
  EXPECTED_SCHEMA_VERSION,
  EXPECTED_DIMENSIONS,
} from "./embeddings-loader.js";

export {
  semanticSearch,
  keywordSearch,
  cosineSimilarity,
  truncateToTokenBudget,
  getEmbeddingsStats,
  loadEmbedder,
} from "./vector-search.js";
