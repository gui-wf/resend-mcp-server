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
# 4. Descriptions (LLM-optimized documentation)
# 5. Exclusions (disabled tools)
#
# Each overlay follows the OpenAPI Overlay Specification 1.0.0 format.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Paths
BASE_SPEC="$PROJECT_ROOT/openapi/resend.yaml"
OVERLAYS_DIR="$PROJECT_ROOT/openapi/overlays"
OUTPUT_SPEC="$PROJECT_ROOT/openapi/merged.yaml"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Resend MCP Server - OpenAPI Merger${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if base spec exists
if [ ! -f "$BASE_SPEC" ]; then
  echo -e "${RED}Error: Base spec not found at $BASE_SPEC${NC}"
  echo "Download with:"
  echo "  curl -o openapi/resend.yaml https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml"
  exit 1
fi

# Check if Python is available
if ! command -v python3 &> /dev/null; then
  echo -e "${RED}Error: python3 is required but not installed${NC}"
  exit 1
fi

# Check if PyYAML is available
if ! python3 -c "import yaml" 2>/dev/null; then
  echo -e "${RED}Error: PyYAML is required but not installed${NC}"
  echo "Install with: pip install pyyaml"
  exit 1
fi

# Create overlays directory if it doesn't exist
mkdir -p "$OVERLAYS_DIR"

# Run the Python merge script
python3 - "$BASE_SPEC" "$OVERLAYS_DIR" "$OUTPUT_SPEC" << 'PYTHON_SCRIPT'
#!/usr/bin/env python3
"""
OpenAPI Overlay Merger

Applies OpenAPI Overlay Specification 1.0.0 files to a base OpenAPI spec.
"""

import sys
import os
import re
import yaml
from pathlib import Path
from collections import OrderedDict

# Preserve order in YAML output
def represent_ordereddict(dumper, data):
    return dumper.represent_mapping('tag:yaml.org,2002:map', data.items())

yaml.add_representer(OrderedDict, represent_ordereddict)

# Colors for output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'


def parse_jsonpath_to_keys(target):
    """
    Parse JSONPath-like target to a list of keys.
    Example: $.paths['/emails'].post -> ['paths', '/emails', 'post']
    """
    # Remove leading $
    target = target.lstrip('$')

    keys = []
    current = ""
    in_bracket = False

    for char in target:
        if char == '.' and not in_bracket:
            if current:
                keys.append(current)
                current = ""
        elif char == '[':
            if current:
                keys.append(current)
                current = ""
            in_bracket = True
        elif char == ']':
            in_bracket = False
            # Remove quotes from key
            key = current.strip("'\"")
            keys.append(key)
            current = ""
        else:
            current += char

    if current:
        keys.append(current)

    return keys


def get_nested(data, keys):
    """Get a nested value from a dict using a list of keys."""
    for key in keys:
        if isinstance(data, dict) and key in data:
            data = data[key]
        else:
            return None
    return data


def set_nested(data, keys, value):
    """Set a nested value in a dict using a list of keys."""
    for key in keys[:-1]:
        if key not in data:
            data[key] = {}
        data = data[key]
    data[keys[-1]] = value


def deep_merge(base, update):
    """Deep merge two dictionaries."""
    if not isinstance(base, dict) or not isinstance(update, dict):
        return update

    result = dict(base)
    for key, value in update.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def apply_overlay(spec, overlay_path):
    """Apply a single overlay file to the spec."""
    overlay_name = os.path.basename(overlay_path)

    with open(overlay_path, 'r') as f:
        overlay = yaml.safe_load(f)

    if not overlay or 'actions' not in overlay:
        print(f"  {YELLOW}No actions found in overlay{NC}")
        return 0, 0

    actions = overlay['actions']
    applied = 0
    skipped = 0

    for action in actions:
        target = action.get('target', '')
        update = action.get('update', {})

        keys = parse_jsonpath_to_keys(target)

        # Check if target exists
        existing = get_nested(spec, keys)
        if existing is None:
            skipped += 1
            continue

        # Deep merge the update into the existing value
        if isinstance(existing, dict):
            merged = deep_merge(existing, update)
            set_nested(spec, keys, merged)
            applied += 1
        else:
            skipped += 1

    return applied, skipped


def count_tools_by_tier(spec):
    """Count tools by tier in the merged spec."""
    counts = {'core': 0, 'secondary': 0, 'tertiary': 0, 'excluded': 0, 'disabled': 0, 'total': 0}

    paths = spec.get('paths', {})
    for path, methods in paths.items():
        if not isinstance(methods, dict):
            continue
        for method, operation in methods.items():
            if not isinstance(operation, dict):
                continue
            mcp = operation.get('x-speakeasy-mcp', {})
            if mcp:
                counts['total'] += 1
                tier = mcp.get('tier', '')
                if tier in counts:
                    counts[tier] += 1
                if mcp.get('disabled', False):
                    counts['disabled'] += 1

    return counts


def main():
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <base_spec> <overlays_dir> <output_spec>")
        sys.exit(1)

    base_spec_path = sys.argv[1]
    overlays_dir = sys.argv[2]
    output_spec_path = sys.argv[3]

    # Load base spec
    print(f"{GREEN}Loading base spec...{NC}")
    with open(base_spec_path, 'r') as f:
        spec = yaml.safe_load(f)
    print(f"  {GREEN}Done{NC}")
    print()

    # Define overlay order
    overlay_files = [
        'scopes.yaml',
        'mcp-hints.yaml',
        'descriptions.yaml',
        'exclusions.yaml',
    ]

    total_actions = 0
    total_applied = 0
    total_skipped = 0

    # Apply overlays in order
    for overlay_file in overlay_files:
        overlay_path = os.path.join(overlays_dir, overlay_file)

        if os.path.exists(overlay_path):
            print(f"{YELLOW}Applying overlay: {overlay_file}{NC}")
            applied, skipped = apply_overlay(spec, overlay_path)

            total_actions += applied + skipped
            total_applied += applied
            total_skipped += skipped

            print(f"  {GREEN}Applied: {applied}{NC} | {YELLOW}Skipped: {skipped}{NC} (target not found)")
        else:
            print(f"{YELLOW}Overlay not found (skipping): {overlay_file}{NC}")
        print()

    # Write merged spec
    print(f"{GREEN}Writing merged spec to: {output_spec_path}{NC}")
    with open(output_spec_path, 'w') as f:
        yaml.dump(spec, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    print()

    # Count tools by tier
    print(f"{BLUE}Analyzing merged specification...{NC}")
    print()
    counts = count_tools_by_tier(spec)

    print(f"{BLUE}Tool Summary:{NC}")
    print(f"  Core tier:      {GREEN}{counts['core']}{NC} tools (always loaded)")
    print(f"  Secondary tier: {YELLOW}{counts['secondary']}{NC} tools (on-demand)")
    print(f"  Tertiary tier:  {YELLOW}{counts['tertiary']}{NC} tools (admin)")
    print(f"  Excluded tier:  {RED}{counts['excluded']}{NC} tools")
    print(f"  Disabled:       {RED}{counts['disabled']}{NC} tools")
    print(f"  Total with MCP: {BLUE}{counts['total']}{NC} operations")
    print()

    print(f"{BLUE}Overlay Application Summary:{NC}")
    print(f"  Total actions:  {total_actions}")
    print(f"  Applied:        {GREEN}{total_applied}{NC}")
    print(f"  Skipped:        {YELLOW}{total_skipped}{NC}")
    print()

    # Validate structure
    print(f"{BLUE}Validating merged spec structure...{NC}")
    openapi_version = spec.get('openapi', '')
    info_title = spec.get('info', {}).get('title', '')
    paths_count = len(spec.get('paths', {}))

    if not openapi_version:
        print(f"  {RED}Missing: openapi version{NC}")
    elif not info_title:
        print(f"  {RED}Missing: info.title{NC}")
    elif paths_count == 0:
        print(f"  {RED}No paths found{NC}")
    else:
        print(f"  {GREEN}OpenAPI version: {openapi_version}{NC}")
        print(f"  {GREEN}Title: {info_title}{NC}")
        print(f"  {GREEN}Paths: {paths_count}{NC}")
        print(f"  {GREEN}Structure validation passed{NC}")
    print()


if __name__ == '__main__':
    main()
PYTHON_SCRIPT

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Done!${NC} Ready to generate with:"
echo "  npm run generate"
echo -e "${BLUE}========================================${NC}"
