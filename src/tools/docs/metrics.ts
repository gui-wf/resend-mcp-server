/**
 * Metrics tracking for documentation search.
 * Collects search performance metrics and outputs them as JSON lines to stderr.
 */

// AIDEV-NOTE: Use console.error for logging - stdout is reserved for MCP protocol

/**
 * Metric types for documentation search.
 */
export type MetricType =
  | "search_completed"
  | "search_error"
  | "model_loaded"
  | "embeddings_loaded";

/**
 * Search metrics data structure.
 */
export interface SearchMetrics {
  /** Metric type identifier */
  _type: "metric";
  /** Name of the metric */
  name: MetricType;
  /** Timestamp in ISO format */
  timestamp: string;
  /** Search latency in milliseconds */
  search_latency_ms?: number;
  /** Number of results returned */
  result_count?: number;
  /** Type of search performed */
  search_type?: "semantic" | "keyword" | "hybrid";
  /** Whether embeddings were cached */
  cache_hit?: boolean;
  /** Error code if search failed */
  error_code?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Rolling window entry for tracking recent searches.
 */
interface SearchEntry {
  timestamp: number;
  latencyMs: number;
  resultCount: number;
  searchType: "semantic" | "keyword" | "hybrid";
  cacheHit: boolean;
  success: boolean;
}

/** Rolling window of recent searches (max 100) */
const searchHistory: SearchEntry[] = [];

/** Maximum entries in rolling window */
const MAX_HISTORY_SIZE = 100;

/** Flag to track if embeddings were loaded from cache */
let embeddingsCacheHit = false;

/**
 * Output a metric as a JSON line to stderr.
 *
 * @param metric - The metric to output
 */
function emitMetric(metric: SearchMetrics): void {
  console.error(JSON.stringify(metric));
}

/**
 * Record a successful search and emit metric.
 *
 * @param latencyMs - Search latency in milliseconds
 * @param resultCount - Number of results returned
 * @param searchType - Type of search performed
 * @param cacheHit - Whether embeddings were cached
 */
export function recordSearch(
  latencyMs: number,
  resultCount: number,
  searchType: "semantic" | "keyword" | "hybrid",
  cacheHit: boolean
): void {
  const entry: SearchEntry = {
    timestamp: Date.now(),
    latencyMs,
    resultCount,
    searchType,
    cacheHit,
    success: true,
  };

  // Add to rolling window
  searchHistory.push(entry);
  if (searchHistory.length > MAX_HISTORY_SIZE) {
    searchHistory.shift();
  }

  // Emit metric
  emitMetric({
    _type: "metric",
    name: "search_completed",
    timestamp: new Date().toISOString(),
    search_latency_ms: latencyMs,
    result_count: resultCount,
    search_type: searchType,
    cache_hit: cacheHit,
  });
}

/**
 * Record a search error and emit metric.
 *
 * @param latencyMs - Time until error in milliseconds
 * @param errorCode - Error code from DocsErrorCode
 * @param context - Additional error context
 */
export function recordSearchError(
  latencyMs: number,
  errorCode: string,
  context?: Record<string, unknown>
): void {
  const entry: SearchEntry = {
    timestamp: Date.now(),
    latencyMs,
    resultCount: 0,
    searchType: "semantic",
    cacheHit: embeddingsCacheHit,
    success: false,
  };

  // Add to rolling window
  searchHistory.push(entry);
  if (searchHistory.length > MAX_HISTORY_SIZE) {
    searchHistory.shift();
  }

  // Emit metric
  emitMetric({
    _type: "metric",
    name: "search_error",
    timestamp: new Date().toISOString(),
    search_latency_ms: latencyMs,
    error_code: errorCode,
    context,
  });
}

/**
 * Record model loaded event.
 *
 * @param latencyMs - Model load time in milliseconds
 */
export function recordModelLoaded(latencyMs: number): void {
  emitMetric({
    _type: "metric",
    name: "model_loaded",
    timestamp: new Date().toISOString(),
    search_latency_ms: latencyMs,
  });
}

/**
 * Record embeddings loaded event.
 *
 * @param latencyMs - Embeddings load time in milliseconds
 * @param cacheHit - Whether loaded from cache
 * @param chunkCount - Number of chunks loaded
 */
export function recordEmbeddingsLoaded(
  latencyMs: number,
  cacheHit: boolean,
  chunkCount: number
): void {
  embeddingsCacheHit = cacheHit;

  emitMetric({
    _type: "metric",
    name: "embeddings_loaded",
    timestamp: new Date().toISOString(),
    search_latency_ms: latencyMs,
    cache_hit: cacheHit,
    context: { chunk_count: chunkCount },
  });
}

/**
 * Check if embeddings are cached (for cache_hit metric).
 *
 * @param isCached - Whether embeddings are currently cached
 */
export function setEmbeddingsCacheStatus(isCached: boolean): void {
  embeddingsCacheHit = isCached;
}

/**
 * Get aggregated statistics from the rolling window.
 *
 * @returns Statistics object with averages and counts
 */
export function getSearchStats(): {
  totalSearches: number;
  successfulSearches: number;
  failedSearches: number;
  averageLatencyMs: number;
  averageResultCount: number;
  searchTypeDistribution: Record<string, number>;
  cacheHitRate: number;
} {
  if (searchHistory.length === 0) {
    return {
      totalSearches: 0,
      successfulSearches: 0,
      failedSearches: 0,
      averageLatencyMs: 0,
      averageResultCount: 0,
      searchTypeDistribution: {},
      cacheHitRate: 0,
    };
  }

  const successful = searchHistory.filter((e) => e.success);
  const failed = searchHistory.filter((e) => !e.success);
  const cacheHits = searchHistory.filter((e) => e.cacheHit);

  const totalLatency = searchHistory.reduce((sum, e) => sum + e.latencyMs, 0);
  const totalResults = successful.reduce((sum, e) => sum + e.resultCount, 0);

  const typeDistribution: Record<string, number> = {};
  for (const entry of searchHistory) {
    typeDistribution[entry.searchType] = (typeDistribution[entry.searchType] || 0) + 1;
  }

  return {
    totalSearches: searchHistory.length,
    successfulSearches: successful.length,
    failedSearches: failed.length,
    averageLatencyMs: Math.round(totalLatency / searchHistory.length),
    averageResultCount:
      successful.length > 0 ? Math.round((totalResults / successful.length) * 10) / 10 : 0,
    searchTypeDistribution: typeDistribution,
    cacheHitRate: Math.round((cacheHits.length / searchHistory.length) * 100) / 100,
  };
}

/**
 * Clear metrics history.
 * Primarily for testing purposes.
 */
export function clearMetricsHistory(): void {
  searchHistory.length = 0;
  embeddingsCacheHit = false;
}

/**
 * Get the current rolling window size.
 *
 * @returns Number of entries in the rolling window
 */
export function getHistorySize(): number {
  return searchHistory.length;
}
