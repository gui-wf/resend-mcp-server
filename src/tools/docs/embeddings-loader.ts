/**
 * Lazy loader for pre-computed embeddings.
 * Loads embeddings from data/embeddings.json on first access and caches them.
 * Uses ES module path resolution for compatibility with both dev (tsx) and production (node).
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// AIDEV-NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[docs-search] ${message}`);

/**
 * Structure of the embeddings index file.
 * Mirrors the EmbeddingsIndex from scripts/types.ts but defined here
 * to avoid importing build-time dependencies at runtime.
 */
export interface EmbeddingsIndex {
  version: string;
  model: string;
  dimensions: number;
  generatedAt: string;
  sourceHash: string;
  chunks: EmbeddingChunk[];
}

/**
 * A single chunk with its embedding vector.
 */
export interface EmbeddingChunk {
  id: string;
  section: string;
  content: string;
  tokenCount: number;
  embedding: number[];
  sourceUrl?: string;
}

/** Cached embeddings index, null if not yet loaded */
let cachedEmbeddings: EmbeddingsIndex | null = null;

/** Loading promise to prevent concurrent loads */
let loadingPromise: Promise<EmbeddingsIndex> | null = null;

/**
 * Resolve the path to the embeddings.json file.
 * Uses import.meta.url for ES module path resolution.
 *
 * In development (tsx): src/tools/docs/embeddings-loader.ts -> data/embeddings.json
 * In production (node): dist/tools/docs/embeddings-loader.js -> data/embeddings.json
 *
 * Both resolve to the same data/ directory at project root.
 */
function getEmbeddingsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // From src/tools/docs/ or dist/tools/docs/, go up 3 levels to project root
  return join(currentDir, "..", "..", "..", "data", "embeddings.json");
}

/**
 * Load embeddings from disk.
 * This is the internal loader, called once and cached.
 */
async function loadFromDisk(): Promise<EmbeddingsIndex> {
  const embeddingsPath = getEmbeddingsPath();
  log(`Loading embeddings from: ${embeddingsPath}`);

  const startTime = Date.now();

  try {
    const content = await readFile(embeddingsPath, "utf-8");
    const index = JSON.parse(content) as EmbeddingsIndex;

    const loadTime = Date.now() - startTime;
    log(
      `Loaded ${index.chunks.length} chunks (${index.dimensions}D vectors) in ${loadTime}ms`
    );

    // Validate basic structure
    if (!index.chunks || !Array.isArray(index.chunks)) {
      throw new Error("Invalid embeddings format: missing chunks array");
    }

    if (index.chunks.length === 0) {
      throw new Error("Invalid embeddings format: empty chunks array");
    }

    // Validate first chunk has expected fields
    const firstChunk = index.chunks[0];
    if (!firstChunk.embedding || !Array.isArray(firstChunk.embedding)) {
      throw new Error("Invalid embeddings format: chunk missing embedding array");
    }

    if (firstChunk.embedding.length !== index.dimensions) {
      throw new Error(
        `Dimension mismatch: expected ${index.dimensions}, got ${firstChunk.embedding.length}`
      );
    }

    return index;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Embeddings file not found at ${embeddingsPath}. Run 'npm run build:embeddings' to generate.`
      );
    }
    throw error;
  }
}

/**
 * Load embeddings asynchronously with caching.
 * Safe to call multiple times; will return cached data after first load.
 * Concurrent calls will share the same loading promise.
 *
 * @returns Promise resolving to the embeddings index
 * @throws Error if embeddings file is missing or invalid
 */
export async function loadEmbeddings(): Promise<EmbeddingsIndex> {
  // Return cached if available
  if (cachedEmbeddings !== null) {
    return cachedEmbeddings;
  }

  // If already loading, wait for that promise
  if (loadingPromise !== null) {
    return loadingPromise;
  }

  // Start loading and cache the promise
  loadingPromise = loadFromDisk()
    .then((index) => {
      cachedEmbeddings = index;
      loadingPromise = null;
      return index;
    })
    .catch((error) => {
      loadingPromise = null;
      throw error;
    });

  return loadingPromise;
}

/**
 * Get cached embeddings synchronously.
 * Returns null if embeddings haven't been loaded yet.
 * Use loadEmbeddings() for guaranteed access.
 *
 * @returns The cached embeddings index, or null if not loaded
 */
export function getLoadedEmbeddings(): EmbeddingsIndex | null {
  return cachedEmbeddings;
}

/**
 * Clear the embeddings cache.
 * Primarily for testing purposes.
 */
export function clearEmbeddingsCache(): void {
  cachedEmbeddings = null;
  loadingPromise = null;
  log("Embeddings cache cleared");
}

/**
 * Check if embeddings are currently loaded.
 *
 * @returns true if embeddings are cached
 */
export function isEmbeddingsLoaded(): boolean {
  return cachedEmbeddings !== null;
}
