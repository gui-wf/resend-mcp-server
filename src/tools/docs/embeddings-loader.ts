/**
 * Lazy loader for pre-computed embeddings.
 * Loads embeddings from data/embeddings.json on first access and caches them.
 * Uses ES module path resolution for compatibility with both dev (tsx) and production (node).
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDocsError, DocsErrorCode } from "./errors.js";

// NOTE: Use console.error for logging - stdout is reserved for MCP protocol
const log = (message: string) => console.error(`[docs-search] ${message}`);

/** Expected schema version - must match build-embeddings.ts INDEX_VERSION */
export const EXPECTED_SCHEMA_VERSION = "1.0.0";

/** Expected embedding dimensions for Xenova/all-MiniLM-L6-v2 */
export const EXPECTED_DIMENSIONS = 384;

/** Maximum age in days before showing a warning */
const FRESHNESS_WARNING_DAYS = 14;

/** Maximum age in days before returning an error hint */
const FRESHNESS_ERROR_DAYS = 30;

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

/** Freshness warning message if embeddings are stale */
let freshnessWarning: string | null = null;

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
 * Validate the schema version of loaded embeddings.
 *
 * @param index - The loaded embeddings index
 * @throws DocsError if version mismatch
 */
function validateSchemaVersion(index: EmbeddingsIndex): void {
  if (!index.version) {
    throw createDocsError(
      DocsErrorCode.EMBEDDINGS_CORRUPT,
      "Embeddings file missing version field"
    );
  }

  // For now, only accept exact version match
  // Future: implement semver compatibility checking
  if (index.version !== EXPECTED_SCHEMA_VERSION) {
    throw createDocsError(
      DocsErrorCode.EMBEDDINGS_VERSION_MISMATCH,
      `Embeddings version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${index.version}`
    );
  }
}

/**
 * Check embeddings freshness and set warning if stale.
 *
 * @param index - The loaded embeddings index
 * @returns Warning message if stale, null otherwise
 */
function checkFreshness(index: EmbeddingsIndex): string | null {
  if (!index.generatedAt) {
    return "Embeddings file missing generatedAt timestamp";
  }

  const generatedDate = new Date(index.generatedAt);
  const now = new Date();
  const ageMs = now.getTime() - generatedDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays > FRESHNESS_ERROR_DAYS) {
    return `Embeddings are ${Math.floor(ageDays)} days old (generated: ${index.generatedAt}). Consider running 'npm run build:embeddings' to update.`;
  }

  if (ageDays > FRESHNESS_WARNING_DAYS) {
    return `Embeddings are ${Math.floor(ageDays)} days old. Consider refreshing soon.`;
  }

  return null;
}

/**
 * Validate embedding dimensions match expected model output.
 *
 * @param index - The loaded embeddings index
 * @throws DocsError if dimension mismatch
 */
function validateDimensions(index: EmbeddingsIndex): void {
  if (index.dimensions !== EXPECTED_DIMENSIONS) {
    throw createDocsError(
      DocsErrorCode.DIMENSION_MISMATCH,
      `Embeddings dimension mismatch: expected ${EXPECTED_DIMENSIONS}, got ${index.dimensions}. ` +
        "This may indicate the embeddings were generated with a different model."
    );
  }

  // Also validate first chunk's actual embedding length
  if (index.chunks.length > 0) {
    const firstChunk = index.chunks[0];
    if (firstChunk.embedding && firstChunk.embedding.length !== index.dimensions) {
      throw createDocsError(
        DocsErrorCode.DIMENSION_MISMATCH,
        `Chunk embedding dimension mismatch: header says ${index.dimensions}, actual is ${firstChunk.embedding.length}`
      );
    }
  }
}

/**
 * Load embeddings from disk.
 * This is the internal loader, called once and cached.
 * Performs schema version validation and freshness checks.
 */
async function loadFromDisk(): Promise<EmbeddingsIndex> {
  const embeddingsPath = getEmbeddingsPath();
  log(`Loading embeddings from: ${embeddingsPath}`);

  const startTime = Date.now();

  try {
    const content = await readFile(embeddingsPath, "utf-8");
    let index: EmbeddingsIndex;

    try {
      index = JSON.parse(content) as EmbeddingsIndex;
    } catch (parseError) {
      throw createDocsError(
        DocsErrorCode.EMBEDDINGS_CORRUPT,
        `Failed to parse embeddings JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    const loadTime = Date.now() - startTime;
    log(
      `Loaded ${index.chunks.length} chunks (${index.dimensions}D vectors) in ${loadTime}ms`
    );

    // Validate schema version
    validateSchemaVersion(index);

    // Validate dimensions
    validateDimensions(index);

    // Validate basic structure
    if (!index.chunks || !Array.isArray(index.chunks)) {
      throw createDocsError(
        DocsErrorCode.EMBEDDINGS_CORRUPT,
        "Invalid embeddings format: missing chunks array"
      );
    }

    if (index.chunks.length === 0) {
      throw createDocsError(
        DocsErrorCode.EMBEDDINGS_CORRUPT,
        "Invalid embeddings format: empty chunks array"
      );
    }

    // Validate first chunk has expected fields
    const firstChunk = index.chunks[0];
    if (!firstChunk.embedding || !Array.isArray(firstChunk.embedding)) {
      throw createDocsError(
        DocsErrorCode.EMBEDDINGS_CORRUPT,
        "Invalid embeddings format: chunk missing embedding array"
      );
    }

    // Check freshness and store warning
    freshnessWarning = checkFreshness(index);
    if (freshnessWarning) {
      log(`Freshness warning: ${freshnessWarning}`);
    }

    return index;
  } catch (error) {
    // Re-throw DocsError as-is
    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }

    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw createDocsError(
        DocsErrorCode.EMBEDDINGS_NOT_FOUND,
        `Embeddings file not found at ${embeddingsPath}`
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
  freshnessWarning = null;
  log("Embeddings cache cleared");
}

/**
 * Get the freshness warning message if embeddings are stale.
 * Returns null if embeddings are fresh or not yet loaded.
 *
 * @returns Freshness warning message, or null
 */
export function getFreshnessWarning(): string | null {
  return freshnessWarning;
}

/**
 * Check if embeddings are currently loaded.
 *
 * @returns true if embeddings are cached
 */
export function isEmbeddingsLoaded(): boolean {
  return cachedEmbeddings !== null;
}
