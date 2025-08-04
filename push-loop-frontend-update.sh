#!/bin/bash
# Script to commit and push loop-frontend changes

cd ../loop-frontend

# Add and commit
git add -A
git commit -m "Update YoFix to v1.0.21-dev.fe7f788 - proper GitHub context usage

This version uses the official @actions/github context API to properly
detect PR numbers in pull_request events, following GitHub's documented
best practices."

# Push to current branch
CURRENT_BRANCH=$(git branch --show-current)
git push origin "$CURRENT_BRANCH"

echo "✅ Pushed changes to $CURRENT_BRANCH"