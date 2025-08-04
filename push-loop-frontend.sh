#!/bin/bash
# Script to push loop-frontend changes

cd ../loop-frontend

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Push to current branch
git push origin "$CURRENT_BRANCH"

echo "✅ Pushed changes to $CURRENT_BRANCH"