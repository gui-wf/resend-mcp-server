/**
 * Unit tests for vector-search module.
 * Tests cosine similarity, truncation, and embedder functions.
 */

import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  truncateToTokenBudget,
} from "../../src/tools/docs/index.js";
import { loadEmbedder, embedQuery } from "../../src/tools/docs/vector-search.js";

describe("cosineSimilarity", () => {
  it("should return 1 for identical normalized vectors", () => {
    // Normalized vector (magnitude = 1)
    const magnitude = Math.sqrt(3);
    const vector = [1 / magnitude, 1 / magnitude, 1 / magnitude];

    const similarity = cosineSimilarity(vector, vector);

    // Should be very close to 1 (allowing for floating point precision)
    expect(similarity).toBeCloseTo(1, 5);
  });

  it("should return 0 for orthogonal vectors", () => {
    // Orthogonal unit vectors
    const vectorA = [1, 0, 0];
    const vectorB = [0, 1, 0];

    const similarity = cosineSimilarity(vectorA, vectorB);

    expect(similarity).toBeCloseTo(0, 5);
  });

  it("should return -1 for opposite vectors", () => {
    // Opposite unit vectors
    const vectorA = [1, 0, 0];
    const vectorB = [-1, 0, 0];

    const similarity = cosineSimilarity(vectorA, vectorB);

    expect(similarity).toBeCloseTo(-1, 5);
  });

  it("should throw error for dimension mismatch", () => {
    const vectorA = [1, 2, 3];
    const vectorB = [1, 2];

    expect(() => cosineSimilarity(vectorA, vectorB)).toThrow(
      "Vector dimension mismatch: query has 3 dimensions, stored embedding has 2"
    );
  });

  it("should handle high-dimensional vectors", () => {
    // 384 dimensions like all-MiniLM-L6-v2
    const dimension = 384;
    const vectorA = Array(dimension).fill(1 / Math.sqrt(dimension));
    const vectorB = Array(dimension).fill(1 / Math.sqrt(dimension));

    const similarity = cosineSimilarity(vectorA, vectorB);

    expect(similarity).toBeCloseTo(1, 5);
  });

  it("should compute correct similarity for known values", () => {
    // Known test case: vectors at 60 degree angle
    // cos(60) = 0.5
    const vectorA = [1, 0];
    const vectorB = [0.5, Math.sqrt(3) / 2]; // 60 degrees from [1,0]

    const similarity = cosineSimilarity(vectorA, vectorB);

    expect(similarity).toBeCloseTo(0.5, 5);
  });
});

describe("truncateToTokenBudget", () => {
  it("should return content unchanged when within budget", () => {
    const content = "This is a short text.";
    const maxTokens = 100; // 100 * 4 = 400 chars budget

    const result = truncateToTokenBudget(content, maxTokens);

    expect(result).toBe(content);
  });

  it("should truncate content when exceeding budget", () => {
    // Create content that exceeds budget
    // 25 tokens * 4 chars = 100 chars budget
    const content = "a".repeat(200); // 200 chars = ~50 tokens
    const maxTokens = 25;

    const result = truncateToTokenBudget(content, maxTokens);

    // Should be truncated to roughly 100 chars + "..."
    expect(result.length).toBeLessThanOrEqual(103); // 100 + 3 for "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("should prefer sentence boundaries when truncating", () => {
    // Content with sentences
    const content =
      "First sentence here. Second sentence here. Third sentence that goes on and on and should be cut off.";
    // Budget that forces truncation within the third sentence
    // ~24 tokens = 96 chars budget (gets us into third sentence)
    const maxTokens = 24;

    const result = truncateToTokenBudget(content, maxTokens);

    // Should end at a sentence boundary if possible
    // The function looks for ". " in the last 20% of allowed length
    expect(result).toContain("First sentence");
    expect(result.endsWith("...")).toBe(true);
  });

  it("should fall back to word boundary if no sentence boundary", () => {
    // Content without sentence endings in the truncation zone
    const content = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10";
    // Budget that forces truncation
    const maxTokens = 10; // 40 chars

    const result = truncateToTokenBudget(content, maxTokens);

    // Should end at a word boundary (space) with ellipsis
    expect(result.endsWith("...")).toBe(true);
    // The content before "..." should end at a complete word (word boundary)
    // This verifies the function finds word boundaries, not that it avoids them
    const contentBeforeEllipsis = result.slice(0, -3).trim();
    // Should end with a complete word (wordN pattern)
    expect(contentBeforeEllipsis).toMatch(/word\d$/);
  });

  it("should handle empty content", () => {
    const result = truncateToTokenBudget("", 10);
    expect(result).toBe("");
  });

  it("should handle content exactly at budget", () => {
    // 10 tokens * 4 = 40 chars
    const content = "a".repeat(40);
    const maxTokens = 10;

    const result = truncateToTokenBudget(content, maxTokens);

    expect(result).toBe(content);
  });

  it("should handle very small budget", () => {
    const content = "This is some content that will be truncated.";
    const maxTokens = 1; // Only 4 chars

    const result = truncateToTokenBudget(content, maxTokens);

    // Should truncate but still have "..."
    expect(result.length).toBeLessThanOrEqual(7); // 4 + 3 for "..."
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("loadEmbedder", () => {
  // NOTE: These tests load the actual model, so they need longer timeout
  // The model is cached globally, so subsequent tests are fast

  it("should load the embedding model successfully", async () => {
    const pipeline = await loadEmbedder();

    expect(pipeline).toBeDefined();
    expect(typeof pipeline).toBe("function");
  });

  it("should return cached pipeline on subsequent calls", async () => {
    // First call (may or may not load, depending on test order)
    const pipeline1 = await loadEmbedder();

    // Second call should be instant (cached)
    const startTime = Date.now();
    const pipeline2 = await loadEmbedder();
    const elapsed = Date.now() - startTime;

    // Should be the same instance (cached)
    expect(pipeline2).toBe(pipeline1);
    // Should be very fast since it's cached (< 10ms typically)
    expect(elapsed).toBeLessThan(100);
  });

  it("should handle concurrent calls without multiple model loads", async () => {
    // Launch multiple concurrent calls
    const promises = [
      loadEmbedder(),
      loadEmbedder(),
      loadEmbedder(),
    ];

    const results = await Promise.all(promises);

    // All should return the same pipeline instance
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
  });
});

describe("embedQuery", () => {
  it("should generate 384-dimensional embedding", async () => {
    const embedding = await embedQuery("test query");

    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(384);
  });

  it("should generate normalized embeddings", async () => {
    const embedding = await embedQuery("test query");

    // Calculate magnitude (should be ~1 for normalized vectors)
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );

    expect(magnitude).toBeCloseTo(1, 2);
  });

  it("should generate different embeddings for different queries", async () => {
    const embedding1 = await embedQuery("send email with attachment");
    const embedding2 = await embedQuery("delete domain configuration");

    // Compute cosine similarity
    const similarity = cosineSimilarity(embedding1, embedding2);

    // Different queries should have different embeddings (similarity < 1)
    expect(similarity).toBeLessThan(0.95);
  });

  it("should generate similar embeddings for similar queries", async () => {
    const embedding1 = await embedQuery("how to send an email");
    const embedding2 = await embedQuery("sending email tutorial");

    // Compute cosine similarity
    const similarity = cosineSimilarity(embedding1, embedding2);

    // Similar queries should have reasonably similar embeddings
    expect(similarity).toBeGreaterThan(0.5);
  });
});
