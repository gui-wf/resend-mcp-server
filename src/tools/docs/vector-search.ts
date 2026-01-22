/**
 * Core vector search functionality for documentation.
 * Provides semantic search using embeddings and keyword search as fallback.
 */

import type { ScoredChunk } from "./types.js";
import { loadEmbeddings } from "./embeddings-loader.js";
import { createDocsError, DocsErrorCode } from "./errors.js";

// NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[docs-search] ${message}`);

/** Timeout for model loading in milliseconds (2 minutes) */
const MODEL_LOAD_TIMEOUT_MS = 120000;

/** Maximum retry attempts for model loading */
const MODEL_LOAD_MAX_RETRIES = 2;

/** Delay between retry attempts in milliseconds */
const MODEL_LOAD_RETRY_DELAY_MS = 1000;

/**
 * Type definition for the transformer pipeline.
 * We use dynamic import to load @xenova/transformers.
 */
type Pipeline = (
  texts: string[],
  options?: { pooling: string; normalize: boolean }
) => Promise<{ data: Float32Array }>;

/** Cached embedding pipeline */
let embedderPipeline: Pipeline | null = null;

/** Loading promise to prevent concurrent model loads */
let embedderLoadingPromise: Promise<Pipeline> | null = null;

/**
 * Helper to create a timeout promise.
 *
 * @param ms - Timeout in milliseconds
 * @param operation - Description of the operation for error message
 * @returns Promise that rejects after timeout
 */
function createTimeout(ms: number, operation: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        createDocsError(
          DocsErrorCode.NETWORK_TIMEOUT,
          `${operation} timed out after ${ms}ms`
        )
      );
    }, ms);
  });
}

/**
 * Helper to delay execution.
 *
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Internal function to load the model without retry logic.
 *
 * @returns Promise resolving to the embedding pipeline
 */
async function loadModelInternal(): Promise<Pipeline> {
  // Dynamic import to avoid loading the heavy transformers library until needed
  const { pipeline } = await import("@xenova/transformers");

  const extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );

  return extractor as Pipeline;
}

/**
 * Load the embedding model (Xenova/all-MiniLM-L6-v2).
 * Lazy loads on first call and caches for subsequent use.
 * Includes timeout and retry logic for robustness.
 *
 * @returns Promise resolving to the embedding pipeline function
 */
export async function loadEmbedder(): Promise<Pipeline> {
  if (embedderPipeline !== null) {
    return embedderPipeline;
  }

  if (embedderLoadingPromise !== null) {
    return embedderLoadingPromise;
  }

  log("Loading embedding model: Xenova/all-MiniLM-L6-v2");
  const startTime = Date.now();

  embedderLoadingPromise = (async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MODEL_LOAD_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        log(`Retrying model load (attempt ${attempt + 1}/${MODEL_LOAD_MAX_RETRIES + 1})...`);
        await delay(MODEL_LOAD_RETRY_DELAY_MS);
      }

      try {
        // Race between model loading and timeout
        const extractor = await Promise.race([
          loadModelInternal(),
          createTimeout(MODEL_LOAD_TIMEOUT_MS, "Model loading"),
        ]);

        const loadTime = Date.now() - startTime;
        log(`Embedding model loaded in ${loadTime}ms`);

        embedderPipeline = extractor;
        embedderLoadingPromise = null;
        return embedderPipeline;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log(`Model load attempt ${attempt + 1} failed: ${lastError.message}`);

        // If it's a timeout or network error, retry
        // If it's a different error (e.g., invalid model), don't retry
        const isRetryable =
          lastError.message.includes("timeout") ||
          lastError.message.includes("ETIMEDOUT") ||
          lastError.message.includes("ECONNRESET") ||
          lastError.message.includes("fetch");

        if (!isRetryable || attempt >= MODEL_LOAD_MAX_RETRIES) {
          break;
        }
      }
    }

    embedderLoadingPromise = null;

    // Convert to DocsError if not already
    if (lastError && "code" in lastError) {
      throw lastError;
    }

    throw createDocsError(
      DocsErrorCode.MODEL_LOAD_FAILURE,
      `Failed to load embedding model after ${MODEL_LOAD_MAX_RETRIES + 1} attempts: ${lastError?.message ?? "Unknown error"}`
    );
  })();

  return embedderLoadingPromise;
}

/**
 * Generate embedding vector for a query string.
 *
 * @param query - The text to embed
 * @returns Promise resolving to 384-dimensional embedding vector
 */
export async function embedQuery(query: string): Promise<number[]> {
  const extractor = await loadEmbedder();

  const result = await extractor([query], {
    pooling: "mean",
    normalize: true,
  });

  // Convert Float32Array to regular array
  return Array.from(result.data);
}

/**
 * Compute cosine similarity between two vectors.
 * Assumes vectors are already normalized (which they are from the model).
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score between -1 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw createDocsError(
      DocsErrorCode.DIMENSION_MISMATCH,
      `Vector dimension mismatch: query has ${a.length} dimensions, stored embedding has ${b.length}`
    );
  }

  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }

  // Vectors are already normalized, so we just return the dot product
  return dotProduct;
}

/**
 * Perform semantic search using vector embeddings.
 *
 * @param query - The search query
 * @param limit - Maximum number of results to return
 * @param maxTokensPerResult - Optional max tokens per result for truncation
 * @returns Promise resolving to array of scored chunks
 */
export async function semanticSearch(
  query: string,
  limit: number,
  maxTokensPerResult?: number
): Promise<ScoredChunk[]> {
  const startTime = Date.now();

  // Load embeddings and generate query embedding in parallel
  const [index, queryEmbedding] = await Promise.all([
    loadEmbeddings(),
    embedQuery(query),
  ]);

  // Score all chunks by cosine similarity
  const scoredChunks: ScoredChunk[] = index.chunks.map((chunk) => ({
    id: chunk.id,
    section: chunk.section,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
    sourceUrl: chunk.sourceUrl,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Sort by score descending and take top results
  scoredChunks.sort((a, b) => b.score - a.score);
  const topResults = scoredChunks.slice(0, limit);

  // Optionally truncate content
  if (maxTokensPerResult !== undefined) {
    for (const result of topResults) {
      if (result.tokenCount > maxTokensPerResult) {
        result.content = truncateToTokenBudget(result.content, maxTokensPerResult);
        result.tokenCount = maxTokensPerResult;
      }
    }
  }

  const searchTime = Date.now() - startTime;
  log(`Semantic search completed in ${searchTime}ms, found ${topResults.length} results`);

  return topResults;
}

/**
 * Perform keyword-based search as fallback.
 * Uses simple case-insensitive substring matching with basic relevance scoring.
 *
 * @param query - The search query
 * @param limit - Maximum number of results to return
 * @returns Promise resolving to array of scored chunks
 */
export async function keywordSearch(
  query: string,
  limit: number
): Promise<ScoredChunk[]> {
  const startTime = Date.now();
  const index = await loadEmbeddings();

  // Normalize query for matching
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((term) => term.length >= 2);

  if (queryTerms.length === 0) {
    return [];
  }

  // Score chunks based on keyword matches
  const scoredChunks: ScoredChunk[] = [];

  for (const chunk of index.chunks) {
    const contentLower = chunk.content.toLowerCase();
    const sectionLower = chunk.section.toLowerCase();

    // Count term matches
    let matchCount = 0;
    let exactPhraseMatch = false;

    // Check for exact phrase match (higher weight)
    if (contentLower.includes(queryLower) || sectionLower.includes(queryLower)) {
      exactPhraseMatch = true;
      matchCount += queryTerms.length * 2;
    }

    // Check individual term matches
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matchCount++;
      }
      if (sectionLower.includes(term)) {
        matchCount += 0.5; // Section matches are valuable but less than content
      }
    }

    if (matchCount > 0) {
      // Normalize score to 0-1 range (roughly)
      // Max possible score: terms * 2 (exact) + terms (content) + terms * 0.5 (section)
      const maxScore = queryTerms.length * 3.5;
      const normalizedScore = Math.min(matchCount / maxScore, 1);

      scoredChunks.push({
        id: chunk.id,
        section: chunk.section,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        sourceUrl: chunk.sourceUrl,
        score: exactPhraseMatch ? Math.max(normalizedScore, 0.5) : normalizedScore,
      });
    }
  }

  // Sort by score descending and take top results
  scoredChunks.sort((a, b) => b.score - a.score);
  const topResults = scoredChunks.slice(0, limit);

  const searchTime = Date.now() - startTime;
  log(`Keyword search completed in ${searchTime}ms, found ${topResults.length} results`);

  return topResults;
}

/**
 * Truncate content to fit within a token budget.
 * Uses approximate token estimation (4 chars per token).
 *
 * @param content - The content to truncate
 * @param maxTokens - Maximum tokens allowed
 * @returns Truncated content with ellipsis if needed
 */
export function truncateToTokenBudget(content: string, maxTokens: number): string {
  // Approximate: 1 token ~= 4 characters for English text
  const maxChars = maxTokens * 4;

  if (content.length <= maxChars) {
    return content;
  }

  // Find a good break point (end of sentence or word)
  let truncateAt = maxChars;

  // Try to find end of sentence within last 20% of allowed length
  const searchStart = Math.floor(maxChars * 0.8);
  const sentenceEnd = content.lastIndexOf(". ", truncateAt);
  if (sentenceEnd > searchStart) {
    truncateAt = sentenceEnd + 1;
  } else {
    // Fall back to word boundary
    const wordEnd = content.lastIndexOf(" ", truncateAt);
    if (wordEnd > searchStart) {
      truncateAt = wordEnd;
    }
  }

  return content.slice(0, truncateAt).trim() + "...";
}

/**
 * Get statistics about the loaded embeddings.
 * Useful for debugging and status reporting.
 *
 * @returns Object with embeddings statistics, or null if not loaded
 */
export async function getEmbeddingsStats(): Promise<{
  chunkCount: number;
  dimensions: number;
  model: string;
  generatedAt: string;
} | null> {
  try {
    const index = await loadEmbeddings();
    return {
      chunkCount: index.chunks.length,
      dimensions: index.dimensions,
      model: index.model,
      generatedAt: index.generatedAt,
    };
  } catch {
    return null;
  }
}
