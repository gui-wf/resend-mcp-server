/**
 * Integration tests for search-docs-tool.
 * Tests the full MCP tool implementation including definition and execution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getSearchDocsDefinition,
  executeSearchDocs,
  loadEmbeddings,
  clearEmbeddingsCache,
} from "../../src/tools/docs/index.js";
import type { SearchResponse, SearchErrorResponse } from "../../src/tools/docs/index.js";

describe("search-docs-tool", () => {
  // Pre-load embeddings for faster tests
  beforeAll(async () => {
    await loadEmbeddings();
  });

  // Clean up after all tests
  afterAll(() => {
    clearEmbeddingsCache();
  });

  describe("getDefinition", () => {
    it("should return valid MCP tool definition structure", () => {
      const definition = getSearchDocsDefinition();

      expect(definition).toHaveProperty("name");
      expect(definition).toHaveProperty("description");
      expect(definition).toHaveProperty("inputSchema");
      expect(typeof definition.name).toBe("string");
      expect(typeof definition.description).toBe("string");
    });

    it("should have correct tool name", () => {
      const definition = getSearchDocsDefinition();

      expect(definition.name).toBe("search_resend_documentation");
    });

    it("should have valid input schema with required properties", () => {
      const definition = getSearchDocsDefinition();
      const schema = definition.inputSchema;

      expect(schema.type).toBe("object");
      expect(schema.properties).toHaveProperty("query");
      expect(schema.properties).toHaveProperty("limit");
      expect(schema.required).toContain("query");
    });

    it("should have query property with correct constraints", () => {
      const definition = getSearchDocsDefinition();
      const querySchema = definition.inputSchema.properties.query;

      expect(querySchema.type).toBe("string");
      expect(querySchema.minLength).toBe(3);
      expect(querySchema.maxLength).toBe(500);
    });

    it("should have limit property with correct constraints", () => {
      const definition = getSearchDocsDefinition();
      const limitSchema = definition.inputSchema.properties.limit;

      expect(limitSchema.type).toBe("integer");
      expect(limitSchema.minimum).toBe(1);
      expect(limitSchema.maximum).toBe(10);
      expect(limitSchema.default).toBe(3);
    });

    it("should have annotations for tool behavior hints", () => {
      const definition = getSearchDocsDefinition();

      expect(definition).toHaveProperty("annotations");
      expect(definition.annotations).toHaveProperty("title");
      expect(definition.annotations).toHaveProperty("readOnlyHint");
      expect(definition.annotations).toHaveProperty("destructiveHint");
      expect(definition.annotations).toHaveProperty("idempotentHint");
      expect(definition.annotations).toHaveProperty("openWorldHint");
    });

    it("should have correct annotation values", () => {
      const definition = getSearchDocsDefinition();
      const annotations = definition.annotations;

      expect(annotations.readOnlyHint).toBe(true);
      expect(annotations.destructiveHint).toBe(false);
      expect(annotations.idempotentHint).toBe(true);
      expect(annotations.openWorldHint).toBe(false);
    });
  });

  describe("execute - validation", () => {
    it("should return error for missing query", async () => {
      const result = await executeSearchDocs({});

      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text) as SearchErrorResponse;
      expect(response.error).toBe(true);
      expect(response.message).toContain("query");
    });

    it("should return error for query too short", async () => {
      const result = await executeSearchDocs({ query: "ab" });

      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text) as SearchErrorResponse;
      expect(response.error).toBe(true);
      expect(response.message).toContain("at least 3 characters");
    });

    it("should return error for query too long", async () => {
      const longQuery = "a".repeat(501);
      const result = await executeSearchDocs({ query: longQuery });

      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text) as SearchErrorResponse;
      expect(response.error).toBe(true);
      expect(response.message).toContain("at most 500 characters");
    });

    it("should return error for invalid limit type", async () => {
      const result = await executeSearchDocs({
        query: "send email",
        limit: "five", // Should be number
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text) as SearchErrorResponse;
      expect(response.error).toBe(true);
      expect(response.message).toContain("limit");
    });

    it("should return error for limit below minimum", async () => {
      const result = await executeSearchDocs({
        query: "send email",
        limit: 0,
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text) as SearchErrorResponse;
      expect(response.error).toBe(true);
      expect(response.message).toContain("at least 1");
    });

    it("should return error for limit above maximum", async () => {
      const result = await executeSearchDocs({
        query: "send email",
        limit: 15,
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse(result.content[0].text) as SearchErrorResponse;
      expect(response.error).toBe(true);
      expect(response.message).toContain("at most 10");
    });

    it("should include hint in error response", async () => {
      const result = await executeSearchDocs({});

      const response = JSON.parse(result.content[0].text) as SearchErrorResponse;
      expect(response.hint).toBeDefined();
      expect(response.hint).toContain("query");
    });
  });

  describe("execute - search functionality", () => {
    it("should return search results for valid query", async () => {
      const result = await executeSearchDocs({ query: "send email" });

      expect(result.isError).toBeUndefined();

      const response = JSON.parse(result.content[0].text) as SearchResponse;
      expect(response.query).toBe("send email");
      expect(response.resultCount).toBeGreaterThan(0);
      expect(Array.isArray(response.results)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const result = await executeSearchDocs({
        query: "send email",
        limit: 2,
      });

      const response = JSON.parse(result.content[0].text) as SearchResponse;
      expect(response.results.length).toBeLessThanOrEqual(2);
    });

    it("should use default limit when not specified", async () => {
      const result = await executeSearchDocs({ query: "send email" });

      const response = JSON.parse(result.content[0].text) as SearchResponse;
      // Default limit is 3
      expect(response.results.length).toBeLessThanOrEqual(3);
    });

    it("should include required fields in each result", async () => {
      const result = await executeSearchDocs({ query: "send email" });

      const response = JSON.parse(result.content[0].text) as SearchResponse;
      expect(response.results.length).toBeGreaterThan(0);

      const firstResult = response.results[0];
      expect(firstResult).toHaveProperty("section");
      expect(firstResult).toHaveProperty("excerpt");
      expect(firstResult).toHaveProperty("relevance");
      expect(firstResult).toHaveProperty("tokenCount");
    });

    it("should include searchType in response", async () => {
      const result = await executeSearchDocs({ query: "send email" });

      const response = JSON.parse(result.content[0].text) as SearchResponse;
      expect(["semantic", "keyword", "hybrid"]).toContain(response.searchType);
    });

    it("should include totalTokens in response", async () => {
      const result = await executeSearchDocs({ query: "send email" });

      const response = JSON.parse(result.content[0].text) as SearchResponse;
      expect(typeof response.totalTokens).toBe("number");
      expect(response.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it("should have relevance scores between 0 and 1", async () => {
      const result = await executeSearchDocs({ query: "send email" });

      const response = JSON.parse(result.content[0].text) as SearchResponse;
      for (const item of response.results) {
        expect(item.relevance).toBeGreaterThanOrEqual(0);
        expect(item.relevance).toBeLessThanOrEqual(1);
      }
    });

    it("should return MCP content format", async () => {
      const result = await executeSearchDocs({ query: "send email" });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
    });
  });

  describe("token budget", () => {
    it("should stay under 3000 total tokens", async () => {
      // Request max results
      const result = await executeSearchDocs({
        query: "send email",
        limit: 10,
      });

      const response = JSON.parse(result.content[0].text) as SearchResponse;

      // The tool uses MAX_TOTAL_TOKENS = 2800, should always be under 3000
      expect(response.totalTokens).toBeLessThanOrEqual(3000);
    });

    it("should report accurate token count", async () => {
      const result = await executeSearchDocs({
        query: "send email",
        limit: 5,
      });

      const response = JSON.parse(result.content[0].text) as SearchResponse;

      // Calculate sum of individual token counts
      const sumOfTokenCounts = response.results.reduce(
        (sum, r) => sum + r.tokenCount,
        0
      );

      // Total should equal sum of individual counts
      expect(response.totalTokens).toBe(sumOfTokenCounts);
    });

    it("should truncate results to fit token budget", async () => {
      // This tests that applyTokenBudget works correctly
      const result = await executeSearchDocs({
        query: "send email api resend",
        limit: 10, // Request many results
      });

      const response = JSON.parse(result.content[0].text) as SearchResponse;

      // Should never exceed the budget (MAX_TOTAL_TOKENS = 2800)
      expect(response.totalTokens).toBeLessThanOrEqual(2800);
    });
  });

  describe("edge cases", () => {
    it("should handle query with special characters", async () => {
      const result = await executeSearchDocs({
        query: "email@test.com <script>",
      });

      // Should not error, may or may not find results
      expect(result.content[0].type).toBe("text");
    });

    it("should handle query at minimum length", async () => {
      const result = await executeSearchDocs({ query: "abc" });

      // Should not error
      expect(result.isError).toBeUndefined();
    });

    it("should handle query at maximum length", async () => {
      const longQuery = "send ".repeat(100); // 500 chars
      const result = await executeSearchDocs({ query: longQuery });

      // Should not error (query is valid length)
      expect(result.isError).toBeUndefined();
    });

    it("should handle query with only numbers", async () => {
      const result = await executeSearchDocs({ query: "123456" });

      // Should not error
      expect(result.content[0].type).toBe("text");
    });

    it("should return valid response even with unlikely match query", async () => {
      const result = await executeSearchDocs({
        query: "xyzqwerty unlikely match",
      });

      // Should return valid response structure even if no results
      const response = JSON.parse(result.content[0].text) as SearchResponse;
      expect(response).toHaveProperty("query");
      expect(response).toHaveProperty("searchType");
      expect(response).toHaveProperty("resultCount");
      expect(response).toHaveProperty("results");
    });
  });
});
