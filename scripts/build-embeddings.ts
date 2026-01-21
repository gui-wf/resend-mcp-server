#!/usr/bin/env tsx
/**
 * Builds embeddings index from Resend documentation.
 * Fetches docs, chunks content, generates embeddings, and saves to data/embeddings.json.
 *
 * Usage:
 *   npm run build:embeddings        - Build with cache check (skip if unchanged)
 *   npm run build:embeddings:force  - Force rebuild regardless of cache
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chunkDocumentation, DEFAULT_CHUNK_OPTIONS } from "./chunker.js";
import type { DocumentChunk, EmbeddingsIndex } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command-line arguments
const args = process.argv.slice(2);
const forceRebuild = args.includes("--force") || args.includes("-f");

// Configuration
const DOCS_URL = "https://resend.com/docs/llms-full.txt";
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMENSIONS = 384;
const OUTPUT_DIR = join(__dirname, "..", "data");
const OUTPUT_FILE = join(OUTPUT_DIR, "embeddings.json");
const INDEX_VERSION = "1.0.0";

/**
 * Computes MD5 hash of content for cache invalidation.
 */
function computeHash(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

/**
 * Fetches documentation from Resend.
 */
async function fetchDocumentation(): Promise<string> {
  console.error(`[build-embeddings] Fetching documentation from ${DOCS_URL}`);

  const response = await fetch(DOCS_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch documentation: ${response.status} ${response.statusText}`
    );
  }

  const text = await response.text();
  console.error(
    `[build-embeddings] Fetched ${text.length} characters (${Math.round(text.length / 1024)}KB)`
  );

  return text;
}

/**
 * Checks if regeneration is needed based on source hash.
 */
function checkCacheValidity(sourceHash: string): boolean {
  if (!existsSync(OUTPUT_FILE)) {
    console.error("[build-embeddings] No existing embeddings file found");
    return false;
  }

  try {
    const existingData = JSON.parse(
      readFileSync(OUTPUT_FILE, "utf-8")
    ) as EmbeddingsIndex;

    if (existingData.sourceHash === sourceHash) {
      console.error(
        "[build-embeddings] Source hash matches existing embeddings - skipping regeneration"
      );
      return true;
    }

    console.error(
      "[build-embeddings] Source hash changed - regeneration required"
    );
    return false;
  } catch (error) {
    console.error("[build-embeddings] Error reading existing embeddings:", error);
    return false;
  }
}

/**
 * Loads the transformer model and generates embeddings.
 */
async function generateEmbeddings(
  chunks: Array<{ id: string; section: string; content: string; tokenCount: number }>
): Promise<DocumentChunk[]> {
  console.error(`[build-embeddings] Loading model: ${MODEL_NAME}`);
  console.error(
    "[build-embeddings] First load may take a while to download the model..."
  );

  // Dynamic import to avoid loading transformers until needed
  const { pipeline } = await import("@xenova/transformers");

  // Create feature extraction pipeline
  const extractor = await pipeline("feature-extraction", MODEL_NAME, {
    quantized: true, // Use quantized model for faster inference
  });

  console.error(
    `[build-embeddings] Model loaded. Generating embeddings for ${chunks.length} chunks...`
  );

  const documentChunks: DocumentChunk[] = [];
  const startTime = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Generate embedding for the chunk content
    // Prepend section header for better context
    const textToEmbed = `${chunk.section}\n${chunk.content}`;
    const output = await extractor(textToEmbed, {
      pooling: "mean",
      normalize: true,
    });

    // Extract embedding array from tensor
    const embedding = Array.from(output.data as Float32Array);

    documentChunks.push({
      ...chunk,
      embedding,
      sourceUrl: DOCS_URL,
    });

    // Progress logging every 10 chunks
    if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = (chunks.length - i - 1) / rate;
      console.error(
        `[build-embeddings] Progress: ${i + 1}/${chunks.length} chunks ` +
          `(${Math.round(rate * 10) / 10}/s, ~${Math.round(remaining)}s remaining)`
      );
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.error(
    `[build-embeddings] Generated ${documentChunks.length} embeddings in ${Math.round(totalTime)}s`
  );

  return documentChunks;
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  console.error("[build-embeddings] Starting embedding generation...");
  console.error(`[build-embeddings] Output: ${OUTPUT_FILE}`);

  if (forceRebuild) {
    console.error("[build-embeddings] Force rebuild requested - skipping cache check");
  }

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.error(`[build-embeddings] Created output directory: ${OUTPUT_DIR}`);
  }

  // Fetch documentation
  const documentation = await fetchDocumentation();
  const sourceHash = computeHash(documentation);
  console.error(`[build-embeddings] Source hash: ${sourceHash}`);

  // Check cache (skip if force rebuild)
  if (!forceRebuild && checkCacheValidity(sourceHash)) {
    console.error("[build-embeddings] Using cached embeddings - done!");
    return;
  }

  // Chunk documentation
  console.error("[build-embeddings] Chunking documentation...");
  const chunks = chunkDocumentation(documentation, DEFAULT_CHUNK_OPTIONS);
  console.error(
    `[build-embeddings] Created ${chunks.length} chunks (avg ${Math.round(
      chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length
    )} tokens/chunk)`
  );

  // Generate embeddings
  const documentChunks = await generateEmbeddings(chunks);

  // Build index
  const index: EmbeddingsIndex = {
    version: INDEX_VERSION,
    model: MODEL_NAME,
    dimensions: EMBEDDING_DIMENSIONS,
    generatedAt: new Date().toISOString(),
    sourceHash,
    chunks: documentChunks,
  };

  // Write to file
  writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
  const fileSizeKB = Math.round(
    readFileSync(OUTPUT_FILE).length / 1024
  );
  console.error(
    `[build-embeddings] Wrote ${OUTPUT_FILE} (${fileSizeKB}KB, ${index.chunks.length} chunks)`
  );

  console.error("[build-embeddings] Done!");
}

// Run main
main().catch((error) => {
  console.error("[build-embeddings] Fatal error:", error);
  process.exit(1);
});
