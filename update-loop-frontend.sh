#!/bin/bash
# Generic script to update loop-frontend with latest YoFix version

# Get the latest YoFix version from git tags
LATEST_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "unknown")
CURRENT_COMMIT=$(git rev-parse --short HEAD)

echo "🚀 Updating loop-frontend with YoFix version: ${LATEST_VERSION}"

# Navigate to loop-frontend
cd ../loop-frontend

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

# Add and commit the changes
git add -A

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "ℹ️  No changes to commit"
else
    git commit -m "Update YoFix to ${LATEST_VERSION} (${CURRENT_COMMIT})

    Latest YoFix improvements for visual testing and route analysis."
    
    echo "✅ Changes committed"
fi

# Push the changes
git push origin "$CURRENT_BRANCH"

echo "✅ Loop-frontend updated successfully!"