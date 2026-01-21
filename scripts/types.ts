/**
 * TypeScript interfaces for documentation embedding generation.
 * Used by chunker.ts and build-embeddings.ts scripts.
 */

/**
 * Configuration options for chunking documentation.
 */
export interface ChunkOptions {
  /** Maximum tokens per chunk (default: 800) */
  maxTokens: number;
  /** Minimum tokens per chunk to avoid tiny fragments (default: 100) */
  minTokens: number;
  /** Overlap tokens between consecutive chunks for context continuity (default: 50) */
  overlapTokens: number;
}

/**
 * Raw chunk before embedding generation.
 * Contains the text content and metadata about the section.
 */
export interface RawChunk {
  /** Unique identifier for the chunk (e.g., "section-0", "section-1-part-2") */
  id: string;
  /** Section header or title (e.g., "## Sending Emails") */
  section: string;
  /** The actual text content of the chunk */
  content: string;
  /** Estimated token count for the chunk */
  tokenCount: number;
}

/**
 * Document chunk with embedding vector.
 * Ready for semantic search indexing.
 */
export interface DocumentChunk extends RawChunk {
  /** Embedding vector from the transformer model */
  embedding: number[];
  /** Optional URL to the source documentation */
  sourceUrl?: string;
}

/**
 * Complete embeddings index structure.
 * Serialized to data/embeddings.json.
 */
export interface EmbeddingsIndex {
  /** Schema version for future compatibility */
  version: string;
  /** Model used to generate embeddings (e.g., "Xenova/all-MiniLM-L6-v2") */
  model: string;
  /** Embedding vector dimensions (e.g., 384 for MiniLM) */
  dimensions: number;
  /** ISO timestamp of generation */
  generatedAt: string;
  /** MD5 hash of source documentation for cache invalidation */
  sourceHash: string;
  /** Array of document chunks with embeddings */
  chunks: DocumentChunk[];
}
