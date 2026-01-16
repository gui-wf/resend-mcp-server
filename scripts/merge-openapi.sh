#!/usr/bin/env bash
#
# merge-openapi.sh - Merge OpenAPI base spec with overlays
#
# This script merges the base Resend OpenAPI specification with
# customization overlays to produce the final merged spec used for generation.
#
# Overlay application order:
# 1. Base spec (openapi/resend.yaml)
# 2. Scopes (read/write/admin tags)
# 3. MCP hints (annotations for MCP behavior)
# 4. Exclusions (disabled tools)
# 5. Descriptions (LLM-optimized documentation)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Paths
BASE_SPEC="$PROJECT_ROOT/openapi/resend.yaml"
OVERLAYS_DIR="$PROJECT_ROOT/openapi/overlays"
OUTPUT_SPEC="$PROJECT_ROOT/openapi/merged.yaml"

# Overlay files in application order
OVERLAYS=(
  "$OVERLAYS_DIR/scopes.yaml"
  "$OVERLAYS_DIR/mcp-hints.yaml"
  "$OVERLAYS_DIR/exclusions.yaml"
  "$OVERLAYS_DIR/descriptions.yaml"
)

echo -e "${GREEN}Merging OpenAPI spec with overlays...${NC}"

# Check if base spec exists
if [ ! -f "$BASE_SPEC" ]; then
  echo -e "${RED}Error: Base spec not found at $BASE_SPEC${NC}"
  echo "Please download from https://github.com/resend/resend-openapi"
  exit 1
fi

# Check if yq is available
if ! command -v yq &> /dev/null; then
  echo -e "${RED}Error: yq is required but not installed${NC}"
  echo "Install with: nix develop (if using Nix)"
  echo "Or install yq from https://github.com/mikefarah/yq"
  exit 1
fi

# Create overlays directory if it doesn't exist
mkdir -p "$OVERLAYS_DIR"

# Start with base spec
cp "$BASE_SPEC" "$OUTPUT_SPEC"
echo -e "${GREEN}✓${NC} Copied base spec"

# Apply each overlay if it exists
for overlay in "${OVERLAYS[@]}"; do
  overlay_name=$(basename "$overlay")

  if [ -f "$overlay" ]; then
    echo -e "${YELLOW}Applying overlay: $overlay_name${NC}"

    # TODO: Implement actual overlay merging
    # For now, this is a placeholder. Actual implementation depends on
    # whether we use yq, jq, or a dedicated OpenAPI overlay tool.
    #
    # Example with yq (simplified):
    # yq eval-all 'select(fileIndex == 0) * select(fileIndex == 1)' \
    #   "$OUTPUT_SPEC" "$overlay" > "$OUTPUT_SPEC.tmp"
    # mv "$OUTPUT_SPEC.tmp" "$OUTPUT_SPEC"

    echo -e "${YELLOW}  (Overlay merging not yet implemented)${NC}"
  else
    echo -e "${YELLOW}⚠  Overlay not found (skipping): $overlay_name${NC}"
  fi
done

echo -e "${GREEN}✓ Merged spec written to: $OUTPUT_SPEC${NC}"

# Validate the merged spec if Speakeasy is available
if command -v speakeasy &> /dev/null || [ -f "$PROJECT_ROOT/node_modules/.bin/speakeasy" ]; then
  echo -e "${YELLOW}Validating merged spec...${NC}"

  if command -v speakeasy &> /dev/null; then
    speakeasy validate -s "$OUTPUT_SPEC"
  else
    npx speakeasy validate -s "$OUTPUT_SPEC"
  fi

  echo -e "${GREEN}✓ Validation complete${NC}"
else
  echo -e "${YELLOW}⚠  Speakeasy not available, skipping validation${NC}"
  echo "  Install with: npm install -D @speakeasy-api/sdk"
fi

echo ""
echo -e "${GREEN}Done!${NC} Ready to generate with:"
echo "  npm run generate"
