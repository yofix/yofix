#!/bin/bash
# Script to update loop-frontend workflow

echo "Updating loop-frontend workflow to use new YoFix version..."

# Navigate to loop-frontend
cd ../loop-frontend

# Add and commit the changes
git add -A
git commit -m "Update YoFix action to v1.0.21-dev.9440a79 with enhanced logging

This version includes:
- Detailed logging of all PR files found
- Enhanced GitHub context logging
- Fails fast if pull_request event has no PR number
- Better debugging information for PR context issues"

# Push the changes
git push origin pr/fix-filter-popup

echo "✅ Loop-frontend workflow updated successfully!"