/**
 * Documentation chunking utilities for semantic search.
 * Splits markdown documentation into appropriately-sized chunks.
 */

import type { ChunkOptions, RawChunk } from "./types.js";

/** Default chunking configuration - matches design spec */
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxTokens: 800,
  minTokens: 100,
  overlapTokens: 50,
};

/**
 * Estimates token count for text.
 * Uses ~4 characters per token approximation (conservative for English text).
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  // Average ~4 characters per token for English text
  // This is a conservative estimate; actual may vary by model
  return Math.ceil(text.length / 4);
}

/**
 * Splits a large section into smaller parts respecting token limits.
 * Attempts to split on paragraph boundaries when possible.
 * @param section - Section header
 * @param content - Content to split
 * @param baseId - Base ID for generating chunk IDs
 * @param options - Chunking options
 * @returns Array of RawChunks
 */
export function splitLargeSection(
  section: string,
  content: string,
  baseId: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS
): RawChunk[] {
  const chunks: RawChunk[] = [];
  const paragraphs = content.split(/\n\n+/);

  let currentContent = "";
  let partIndex = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);
    const currentTokens = estimateTokens(currentContent);

    // If adding this paragraph would exceed max, save current and start new
    if (
      currentContent &&
      currentTokens + paragraphTokens > options.maxTokens
    ) {
      // Save current chunk
      chunks.push({
        id: `${baseId}-part-${partIndex}`,
        section,
        content: currentContent.trim(),
        tokenCount: estimateTokens(currentContent.trim()),
      });
      partIndex++;

      // Start new chunk with overlap from end of previous
      if (options.overlapTokens > 0 && currentContent.length > 0) {
        // Take approximately overlapTokens worth of characters from end
        const overlapChars = options.overlapTokens * 4;
        const overlapText = currentContent.slice(-overlapChars).trim();
        currentContent = overlapText + "\n\n" + paragraph;
      } else {
        currentContent = paragraph;
      }
    } else {
      // Add paragraph to current chunk
      currentContent = currentContent
        ? currentContent + "\n\n" + paragraph
        : paragraph;
    }

    // Handle single paragraphs larger than maxTokens
    if (paragraphTokens > options.maxTokens) {
      // Force split by sentences or characters
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      let sentenceContent = "";

      for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence);
        const currentSentenceTokens = estimateTokens(sentenceContent);

        if (
          sentenceContent &&
          currentSentenceTokens + sentenceTokens > options.maxTokens
        ) {
          chunks.push({
            id: `${baseId}-part-${partIndex}`,
            section,
            content: sentenceContent.trim(),
            tokenCount: estimateTokens(sentenceContent.trim()),
          });
          partIndex++;
          sentenceContent = sentence;
        } else {
          sentenceContent = sentenceContent
            ? sentenceContent + " " + sentence
            : sentence;
        }
      }

      if (sentenceContent.trim()) {
        currentContent = sentenceContent;
      }
    }
  }

  // Don't forget the last chunk
  if (currentContent.trim()) {
    const tokenCount = estimateTokens(currentContent.trim());
    // Only add if it meets minimum token requirement or is the only chunk
    if (tokenCount >= options.minTokens || chunks.length === 0) {
      chunks.push({
        id: chunks.length === 0 ? baseId : `${baseId}-part-${partIndex}`,
        section,
        content: currentContent.trim(),
        tokenCount,
      });
    } else if (chunks.length > 0) {
      // Merge with previous chunk if too small
      const lastChunk = chunks[chunks.length - 1];
      lastChunk.content = lastChunk.content + "\n\n" + currentContent.trim();
      lastChunk.tokenCount = estimateTokens(lastChunk.content);
    }
  }

  return chunks;
}

/**
 * Chunks markdown documentation into appropriately-sized pieces.
 * Splits on ## and ### headers to preserve logical sections.
 * @param markdown - Full markdown documentation
 * @param options - Chunking options
 * @returns Array of RawChunks
 */
export function chunkDocumentation(
  markdown: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS
): RawChunk[] {
  const chunks: RawChunk[] = [];

  // Split by ## and ### headers, keeping the header with the content
  // Match headers like "## Title" or "### Subtitle"
  const sectionPattern = /^(#{2,3}\s+.+)$/gm;
  const sections: { header: string; content: string }[] = [];

  let lastHeader = "Introduction";
  let match: RegExpExecArray | null;

  // Find all headers and their positions
  const headerMatches: { header: string; index: number }[] = [];
  while ((match = sectionPattern.exec(markdown)) !== null) {
    headerMatches.push({ header: match[1], index: match.index });
  }

  // Extract content between headers
  for (let i = 0; i < headerMatches.length; i++) {
    const currentMatch = headerMatches[i];
    const nextMatch = headerMatches[i + 1];

    // Content before first header (if any)
    if (i === 0 && currentMatch.index > 0) {
      const preamble = markdown.slice(0, currentMatch.index).trim();
      if (preamble) {
        sections.push({ header: lastHeader, content: preamble });
      }
    }

    // Content from this header to the next (or end)
    const contentStart = currentMatch.index + currentMatch.header.length;
    const contentEnd = nextMatch ? nextMatch.index : markdown.length;
    const content = markdown.slice(contentStart, contentEnd).trim();

    if (content) {
      sections.push({ header: currentMatch.header, content });
    }
  }

  // Handle case with no headers
  if (headerMatches.length === 0 && markdown.trim()) {
    sections.push({ header: "Documentation", content: markdown.trim() });
  }

  // Process each section
  let sectionIndex = 0;
  for (const { header, content } of sections) {
    const tokenCount = estimateTokens(content);
    const baseId = `section-${sectionIndex}`;

    if (tokenCount <= options.maxTokens) {
      // Section fits in one chunk
      if (tokenCount >= options.minTokens) {
        chunks.push({
          id: baseId,
          section: header,
          content,
          tokenCount,
        });
      } else {
        // Try to merge with previous chunk if too small
        if (chunks.length > 0) {
          const lastChunk = chunks[chunks.length - 1];
          const combined = lastChunk.content + "\n\n" + header + "\n" + content;
          if (estimateTokens(combined) <= options.maxTokens) {
            lastChunk.content = combined;
            lastChunk.tokenCount = estimateTokens(combined);
            continue;
          }
        }
        // If can't merge, add as standalone (better to have small chunks than lose content)
        chunks.push({
          id: baseId,
          section: header,
          content,
          tokenCount,
        });
      }
    } else {
      // Section too large, split it
      const splitChunks = splitLargeSection(header, content, baseId, options);
      chunks.push(...splitChunks);
    }

    sectionIndex++;
  }

  console.error(
    `[chunker] Created ${chunks.length} chunks from ${sections.length} sections`
  );

  return chunks;
}
