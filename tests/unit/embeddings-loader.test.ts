/**
 * Unit tests for embeddings-loader module.
 * Tests lazy loading, caching, and concurrent call handling.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  loadEmbeddings,
  getLoadedEmbeddings,
  clearEmbeddingsCache,
  isEmbeddingsLoaded,
} from "../../src/tools/docs/index.js";

describe("embeddings-loader", () => {
  // Clean up cache after each test to ensure isolation
  afterEach(() => {
    clearEmbeddingsCache();
  });

  describe("loadEmbeddings", () => {
    it("should load embeddings from disk", async () => {
      const index = await loadEmbeddings();

      expect(index).toBeDefined();
      expect(index.chunks).toBeDefined();
      expect(Array.isArray(index.chunks)).toBe(true);
      expect(index.chunks.length).toBeGreaterThan(0);
    });

    it("should cache embeddings after first load", async () => {
      // First load
      const index1 = await loadEmbeddings();

      // Second load should return same reference (cached)
      const index2 = await loadEmbeddings();

      // Should be the exact same object reference
      expect(index1).toBe(index2);
    });

    it("should handle concurrent calls without multiple loads", async () => {
      // Clear cache to ensure fresh state
      clearEmbeddingsCache();

      // Start multiple concurrent loads
      const loadPromises = [
        loadEmbeddings(),
        loadEmbeddings(),
        loadEmbeddings(),
      ];

      // All should resolve to the same object
      const results = await Promise.all(loadPromises);

      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
  });

  describe("getLoadedEmbeddings", () => {
    it("should return null when embeddings not loaded", () => {
      // Cache is cleared in afterEach
      const result = getLoadedEmbeddings();

      expect(result).toBeNull();
    });

    it("should return embeddings after load", async () => {
      // Load embeddings first
      await loadEmbeddings();

      const result = getLoadedEmbeddings();

      expect(result).not.toBeNull();
      expect(result?.chunks).toBeDefined();
    });
  });

  describe("clearEmbeddingsCache", () => {
    it("should clear the cached embeddings", async () => {
      // Load embeddings first
      await loadEmbeddings();
      expect(isEmbeddingsLoaded()).toBe(true);

      // Clear the cache
      clearEmbeddingsCache();

      // Should now be unloaded
      expect(isEmbeddingsLoaded()).toBe(false);
      expect(getLoadedEmbeddings()).toBeNull();
    });
  });

  describe("isEmbeddingsLoaded", () => {
    it("should return false when not loaded", () => {
      expect(isEmbeddingsLoaded()).toBe(false);
    });

    it("should return true after loading", async () => {
      await loadEmbeddings();

      expect(isEmbeddingsLoaded()).toBe(true);
    });
  });

  describe("chunk structure validation", () => {
    let embeddings: Awaited<ReturnType<typeof loadEmbeddings>>;

    beforeAll(async () => {
      embeddings = await loadEmbeddings();
    });

    it("should have valid chunk structure with required fields", () => {
      const chunk = embeddings.chunks[0];

      // Validate required fields exist
      expect(chunk).toHaveProperty("id");
      expect(chunk).toHaveProperty("section");
      expect(chunk).toHaveProperty("content");
      expect(chunk).toHaveProperty("embedding");
      expect(chunk).toHaveProperty("tokenCount");
    });

    it("should have string id", () => {
      const chunk = embeddings.chunks[0];
      expect(typeof chunk.id).toBe("string");
      expect(chunk.id.length).toBeGreaterThan(0);
    });

    it("should have string section", () => {
      const chunk = embeddings.chunks[0];
      expect(typeof chunk.section).toBe("string");
      expect(chunk.section.length).toBeGreaterThan(0);
    });

    it("should have string content", () => {
      const chunk = embeddings.chunks[0];
      expect(typeof chunk.content).toBe("string");
      expect(chunk.content.length).toBeGreaterThan(0);
    });

    it("should have numeric array embedding", () => {
      const chunk = embeddings.chunks[0];
      expect(Array.isArray(chunk.embedding)).toBe(true);
      expect(chunk.embedding.length).toBe(embeddings.dimensions);
      expect(typeof chunk.embedding[0]).toBe("number");
    });

    it("should have positive tokenCount", () => {
      const chunk = embeddings.chunks[0];
      expect(typeof chunk.tokenCount).toBe("number");
      expect(chunk.tokenCount).toBeGreaterThan(0);
    });

    it("should have matching dimensions across all chunks", () => {
      const expectedDimensions = embeddings.dimensions;

      // Check a sample of chunks (first 10 or all if less)
      const sampleSize = Math.min(10, embeddings.chunks.length);
      for (let i = 0; i < sampleSize; i++) {
        expect(embeddings.chunks[i].embedding.length).toBe(expectedDimensions);
      }
    });

    it("should have valid index metadata", () => {
      expect(typeof embeddings.version).toBe("string");
      expect(typeof embeddings.model).toBe("string");
      expect(typeof embeddings.dimensions).toBe("number");
      expect(typeof embeddings.generatedAt).toBe("string");
      expect(embeddings.dimensions).toBeGreaterThan(0);
    });
  });
});
