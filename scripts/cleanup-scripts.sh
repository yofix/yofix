#!/bin/bash

# Script Cleanup for YoFix
# This script will archive outdated scripts and keep only essential ones

echo "🧹 Starting YoFix scripts cleanup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create archive directory
ARCHIVE_DIR="scripts/archive"
mkdir -p "$ARCHIVE_DIR"

# Scripts to keep (production and active development)
KEEP_SCRIPTS=(
  "release.sh"
  "test-locally.sh"
  "route-impact-improved.ts"
  "test-tree-sitter.ts"
  "test-tree-sitter-import-extraction.ts"
  "test-specific-file.ts"
  "diagnose-comments.js"
)

# Scripts to archive (debug and old versions)
ARCHIVE_SCRIPTS=(
  "debug-icon-imports.ts"
  "debug-import-graph.ts"
  "debug-import-resolution.ts"
  "debug-lazy-imports.ts"
  "debug-publicRouter-parsing.ts"
  "debug-test-route-impact.ts"
  "debug-tree-sitter.ts"
  "debug-tree-sitter-enhanced.ts"
  "analyze-route-impact.ts"
  "simple-route-impact.ts"
  "precise-route-impact.ts"
  "route-impact-graph.ts"
)

echo "📦 Archiving outdated scripts..."
for script in "${ARCHIVE_SCRIPTS[@]}"; do
  if [ -f "scripts/$script" ]; then
    mv "scripts/$script" "$ARCHIVE_DIR/"
    echo "  ✓ Archived: $script"
  fi
done

echo ""
echo "✅ Scripts to keep:"
for script in "${KEEP_SCRIPTS[@]}"; do
  if [ -f "scripts/$script" ]; then
    echo "  ✓ $script"
  fi
done

# Count remaining scripts
REMAINING=$(ls -1 scripts/*.{ts,js,sh} 2>/dev/null | grep -v archive | wc -l | tr -d ' ')
ARCHIVED=$(ls -1 "$ARCHIVE_DIR"/*.{ts,js,sh} 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "📊 Cleanup Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Scripts kept: $REMAINING"
echo "  Scripts archived: $ARCHIVED"
echo "  Reduction: ~65%"
echo ""

# Update .gitignore to exclude archive directory
if ! grep -q "scripts/archive/" .gitignore 2>/dev/null; then
  echo "scripts/archive/" >> .gitignore
  echo "📝 Updated .gitignore to exclude archive directory"
fi

echo "✨ Cleanup complete!"
echo ""
echo "💡 Next steps:"
echo "  1. Review archived scripts in $ARCHIVE_DIR"
echo "  2. Delete archive directory after confirming no needed functionality"
echo "  3. Update any documentation referencing removed scripts"