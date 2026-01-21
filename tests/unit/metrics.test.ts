/**
 * Unit tests for metrics module.
 * Tests recording, rolling window, and statistics functions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  recordSearch,
  recordSearchError,
  recordModelLoaded,
  recordEmbeddingsLoaded,
  setEmbeddingsCacheStatus,
  getSearchStats,
  clearMetricsHistory,
  getHistorySize,
} from "../../src/tools/docs/metrics.js";

describe("metrics", () => {
  // Mock console.error to capture metrics output
  let capturedMetrics: string[] = [];

  beforeEach(() => {
    clearMetricsHistory();
    capturedMetrics = [];
    vi.spyOn(console, "error").mockImplementation((msg: unknown) => {
      if (typeof msg === "string" && msg.includes('"_type":"metric"')) {
        capturedMetrics.push(msg);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("recordSearch", () => {
    it("should emit a search_completed metric", () => {
      recordSearch(150, 3, "semantic", true);

      expect(capturedMetrics.length).toBe(1);
      const metric = JSON.parse(capturedMetrics[0]);
      expect(metric._type).toBe("metric");
      expect(metric.name).toBe("search_completed");
      expect(metric.search_latency_ms).toBe(150);
      expect(metric.result_count).toBe(3);
      expect(metric.search_type).toBe("semantic");
      expect(metric.cache_hit).toBe(true);
      expect(metric.timestamp).toBeDefined();
    });

    it("should add entry to rolling window", () => {
      expect(getHistorySize()).toBe(0);

      recordSearch(100, 2, "keyword", false);

      expect(getHistorySize()).toBe(1);
    });

    it("should respect MAX_HISTORY_SIZE of 100", () => {
      // Add 105 entries
      for (let i = 0; i < 105; i++) {
        recordSearch(100, 1, "semantic", true);
      }

      // Should cap at 100
      expect(getHistorySize()).toBe(100);
    });
  });

  describe("recordSearchError", () => {
    it("should emit a search_error metric", () => {
      recordSearchError(50, "EMBEDDINGS_NOT_FOUND", { path: "/missing" });

      expect(capturedMetrics.length).toBe(1);
      const metric = JSON.parse(capturedMetrics[0]);
      expect(metric._type).toBe("metric");
      expect(metric.name).toBe("search_error");
      expect(metric.search_latency_ms).toBe(50);
      expect(metric.error_code).toBe("EMBEDDINGS_NOT_FOUND");
      expect(metric.context).toEqual({ path: "/missing" });
    });

    it("should add failed entry to rolling window", () => {
      recordSearchError(50, "NETWORK_TIMEOUT");

      const stats = getSearchStats();
      expect(stats.failedSearches).toBe(1);
      expect(stats.successfulSearches).toBe(0);
    });
  });

  describe("recordModelLoaded", () => {
    it("should emit a model_loaded metric", () => {
      recordModelLoaded(5000);

      expect(capturedMetrics.length).toBe(1);
      const metric = JSON.parse(capturedMetrics[0]);
      expect(metric._type).toBe("metric");
      expect(metric.name).toBe("model_loaded");
      expect(metric.search_latency_ms).toBe(5000);
    });
  });

  describe("recordEmbeddingsLoaded", () => {
    it("should emit an embeddings_loaded metric", () => {
      recordEmbeddingsLoaded(200, true, 150);

      expect(capturedMetrics.length).toBe(1);
      const metric = JSON.parse(capturedMetrics[0]);
      expect(metric._type).toBe("metric");
      expect(metric.name).toBe("embeddings_loaded");
      expect(metric.search_latency_ms).toBe(200);
      expect(metric.cache_hit).toBe(true);
      expect(metric.context).toEqual({ chunk_count: 150 });
    });

    it("should update embeddings cache status", () => {
      recordEmbeddingsLoaded(200, true, 150);

      // Record a search to verify cache_hit is tracked
      recordSearch(100, 1, "semantic", false);

      // The internal embeddingsCacheHit should be true now
      // This is reflected in error recording
      recordSearchError(10, "TEST_ERROR");

      // Check stats include cache hits
      const stats = getSearchStats();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });
  });

  describe("setEmbeddingsCacheStatus", () => {
    it("should set the embeddings cache status for subsequent error records", () => {
      setEmbeddingsCacheStatus(true);

      // Record an error - it should use the cache status
      recordSearchError(50, "TEST_ERROR");

      const stats = getSearchStats();
      // The error entry should have cacheHit = true
      expect(stats.cacheHitRate).toBe(1);
    });

    it("should update cache status when changed", () => {
      setEmbeddingsCacheStatus(false);
      recordSearch(100, 1, "semantic", false);

      setEmbeddingsCacheStatus(true);
      recordSearch(100, 1, "semantic", true);

      const stats = getSearchStats();
      expect(stats.cacheHitRate).toBe(0.5);
    });
  });

  describe("getSearchStats", () => {
    it("should return empty stats when no searches recorded", () => {
      const stats = getSearchStats();

      expect(stats.totalSearches).toBe(0);
      expect(stats.successfulSearches).toBe(0);
      expect(stats.failedSearches).toBe(0);
      expect(stats.averageLatencyMs).toBe(0);
      expect(stats.averageResultCount).toBe(0);
      expect(stats.searchTypeDistribution).toEqual({});
      expect(stats.cacheHitRate).toBe(0);
    });

    it("should compute correct averages", () => {
      recordSearch(100, 2, "semantic", true);
      recordSearch(200, 4, "semantic", true);
      recordSearch(300, 6, "keyword", false);

      const stats = getSearchStats();

      expect(stats.totalSearches).toBe(3);
      expect(stats.successfulSearches).toBe(3);
      expect(stats.failedSearches).toBe(0);
      expect(stats.averageLatencyMs).toBe(200); // (100+200+300)/3
      expect(stats.averageResultCount).toBe(4); // (2+4+6)/3
    });

    it("should compute search type distribution", () => {
      recordSearch(100, 1, "semantic", true);
      recordSearch(100, 1, "semantic", true);
      recordSearch(100, 1, "keyword", true);
      recordSearch(100, 1, "hybrid", true);

      const stats = getSearchStats();

      expect(stats.searchTypeDistribution).toEqual({
        semantic: 2,
        keyword: 1,
        hybrid: 1,
      });
    });

    it("should compute cache hit rate", () => {
      recordSearch(100, 1, "semantic", true);
      recordSearch(100, 1, "semantic", true);
      recordSearch(100, 1, "semantic", false);
      recordSearch(100, 1, "semantic", false);

      const stats = getSearchStats();

      expect(stats.cacheHitRate).toBe(0.5);
    });

    it("should count failures separately from successes", () => {
      recordSearch(100, 2, "semantic", true);
      recordSearchError(50, "ERROR_CODE");

      const stats = getSearchStats();

      expect(stats.totalSearches).toBe(2);
      expect(stats.successfulSearches).toBe(1);
      expect(stats.failedSearches).toBe(1);
    });

    it("should not include failed searches in average result count", () => {
      recordSearch(100, 5, "semantic", true);
      recordSearchError(50, "ERROR_CODE");

      const stats = getSearchStats();

      // Average should only consider successful searches
      expect(stats.averageResultCount).toBe(5);
    });
  });

  describe("clearMetricsHistory", () => {
    it("should clear all recorded metrics", () => {
      recordSearch(100, 1, "semantic", true);
      recordSearch(200, 2, "keyword", false);
      recordSearchError(50, "ERROR");

      expect(getHistorySize()).toBe(3);

      clearMetricsHistory();

      expect(getHistorySize()).toBe(0);
      expect(getSearchStats().totalSearches).toBe(0);
    });

    it("should reset embeddings cache status", () => {
      setEmbeddingsCacheStatus(true);
      clearMetricsHistory();

      // After clear, cache status should be reset
      recordSearchError(50, "ERROR");

      const stats = getSearchStats();
      expect(stats.cacheHitRate).toBe(0);
    });
  });

  describe("getHistorySize", () => {
    it("should return current number of entries", () => {
      expect(getHistorySize()).toBe(0);

      recordSearch(100, 1, "semantic", true);
      expect(getHistorySize()).toBe(1);

      recordSearch(100, 1, "semantic", true);
      expect(getHistorySize()).toBe(2);

      recordSearchError(50, "ERROR");
      expect(getHistorySize()).toBe(3);
    });
  });
});
