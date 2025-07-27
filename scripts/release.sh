#!/bin/bash

# Release script for YoFix
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if logged in to gh
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not logged in to GitHub CLI${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Get version type
VERSION_TYPE=${1:-patch}
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid version type. Use patch, minor, or major${NC}"
    exit 1
fi

echo -e "${YELLOW}Starting $VERSION_TYPE release process...${NC}"

# Ensure we're on main and up to date
echo "📋 Checking git status..."
git checkout main
git pull origin main

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}Error: You have uncommitted changes${NC}"
    git status -s
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}$CURRENT_VERSION${NC}"

# Create release branch
BRANCH_NAME="release/v$CURRENT_VERSION-$VERSION_TYPE"
echo -e "\n📝 Creating release branch: ${YELLOW}$BRANCH_NAME${NC}"
git checkout -b "$BRANCH_NAME"

# Bump version
echo -e "\n📦 Bumping $VERSION_TYPE version..."
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "New version: ${GREEN}$NEW_VERSION${NC}"

# Build the project
echo -e "\n🔨 Building project..."
npm run build

# Commit changes
echo -e "\n💾 Committing changes..."
git add -A
git commit -m "chore: release v$NEW_VERSION

- Bump version from $CURRENT_VERSION to $NEW_VERSION
- Build dist for release"

# Push branch
echo -e "\n📤 Pushing branch..."
git push -u origin "$BRANCH_NAME"

# Create pull request
echo -e "\n🔄 Creating pull request..."
PR_URL=$(gh pr create \
  --title "Release v$NEW_VERSION" \
  --body "## 🚀 Release v$NEW_VERSION

This PR bumps the version from \`$CURRENT_VERSION\` to \`$NEW_VERSION\` ($VERSION_TYPE release).

### Changes
- Version bump in package.json
- Built dist/ folder for release

### Post-merge actions
After merging, the release workflow will:
1. Create a GitHub release
2. Update the major version tag
3. Publish to GitHub Marketplace

---
*This PR was created by the automated release script*" \
  --base main \
  --head "$BRANCH_NAME")

echo -e "Pull request created: ${GREEN}$PR_URL${NC}"

# Wait for checks to pass
echo -e "\n⏳ Waiting for CI checks to pass..."
gh pr checks "$PR_URL" --watch

# Auto-merge if checks pass
echo -e "\n✅ CI checks passed! Auto-merging..."
gh pr merge "$PR_URL" --auto --merge --delete-branch

# Wait for merge
echo -e "\n⏳ Waiting for PR to be merged..."
while [[ $(gh pr view "$PR_URL" --json state -q .state) != "MERGED" ]]; do
    sleep 5
    echo -n "."
done
echo ""

# Switch back to main and pull
echo -e "\n📥 Updating local main branch..."
git checkout main
git pull origin main

# Create and push tag
echo -e "\n🏷️  Creating and pushing tag v$NEW_VERSION..."
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"

# Update major version tag
MAJOR_VERSION=$(echo $NEW_VERSION | cut -d. -f1)
echo -e "\n🏷️  Updating major version tag v$MAJOR_VERSION..."
git tag -f "v$MAJOR_VERSION"
git push origin "v$MAJOR_VERSION" --force

# Generate changelog for this release
echo -e "\n📝 Generating changelog..."
PREVIOUS_TAG=$(git describe --tags --abbrev=0 v$NEW_VERSION^ 2>/dev/null || echo "v1.0.0")
COMMITS=$(git log --pretty=format:"- %s" $PREVIOUS_TAG..v$NEW_VERSION 2>/dev/null | grep -v "^- chore: release" | grep -v "^- Merge pull request" | head -20)

# Group commits by type
FEATURES=$(echo "$COMMITS" | grep -E "^- feat(\(.*\))?: " | sed 's/^- feat(\(.*\))?: /- /' || true)
FIXES=$(echo "$COMMITS" | grep -E "^- fix(\(.*\))?: " | sed 's/^- fix(\(.*\))?: /- /' || true)
OTHER=$(echo "$COMMITS" | grep -vE "^- (feat|fix)(\(.*\))?: " || true)

# Build changelog sections
CHANGELOG=""
if [ -n "$FEATURES" ]; then
    CHANGELOG="### 🚀 Features
$FEATURES

"
fi
if [ -n "$FIXES" ]; then
    CHANGELOG="${CHANGELOG}### 🐛 Bug Fixes
$FIXES

"
fi
if [ -n "$OTHER" ]; then
    CHANGELOG="${CHANGELOG}### 📦 Other Changes
$OTHER

"
fi

# Fallback if no commits found
if [ -z "$CHANGELOG" ]; then
    CHANGELOG="- Version bump to v$NEW_VERSION"
fi

# Create GitHub release
echo -e "\n📦 Creating GitHub release..."
gh release create "v$NEW_VERSION" \
  --title "v$NEW_VERSION" \
  --notes "## What's Changed

$CHANGELOG

**Full Changelog**: https://github.com/yofix/yofix/compare/$PREVIOUS_TAG...v$NEW_VERSION

---
*Released by automated release script*" \
  --latest

echo -e "\n${GREEN}✨ Release v$NEW_VERSION completed successfully!${NC}"
echo -e "\nRelease created: ${GREEN}https://github.com/yofix/yofix/releases/tag/v$NEW_VERSION${NC}"
echo -e "\nThe GitHub Marketplace will automatically update within 5-10 minutes."