#!/bin/bash

# Release script for development/pre-release versions with commit hash
# Usage: ./scripts/release-dev.sh [version-base] [--auto-commit]
# Example: ./scripts/release-dev.sh 1.0.21
# Example: ./scripts/release-dev.sh --auto-commit

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the base version from argument or package.json
if [ -z "$1" ]; then
    BASE_VERSION=$(node -p "require('./package.json').version")
else
    BASE_VERSION=$1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

echo -e "${BLUE}🚀 YoFix Dev Release Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Base version: ${GREEN}${BASE_VERSION}${NC}"
echo -e "Current branch: ${GREEN}${CURRENT_BRANCH}${NC}"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}📝 Uncommitted changes detected${NC}"
    
    # Show status
    echo -e "\n${YELLOW}Current status:${NC}"
    git status --short
    
    # Ask if we should commit
    echo -e "\n${YELLOW}Do you want to commit these changes? (Y/n)${NC}"
    read -r response
    
    # Default to "Y" if user just presses Enter
    if [[ -z "$response" || "$response" =~ ^[Yy]$ ]]; then
        # Add all changes
        echo -e "\n${BLUE}📦 Staging all changes...${NC}"
        git add -A
        
        # Generate automatic commit message based on changes
        echo -e "\n${BLUE}📝 Generating commit message...${NC}"
        
        # Get list of modified files
        MODIFIED_FILES=$(git diff --cached --name-only | head -5)
        FILE_COUNT=$(git diff --cached --name-only | wc -l)
        
        # Check if it's a feature, fix, or chore based on file paths
        if git diff --cached --name-only | grep -q "^src/"; then
            if git diff --cached --name-only | grep -q "test"; then
                COMMIT_TYPE="test"
            elif git diff --cached --name-only | grep -q "^src/.*\.md$"; then
                COMMIT_TYPE="docs"
            else
                COMMIT_TYPE="feat"
            fi
        elif git diff --cached --name-only | grep -q "^docs/"; then
            COMMIT_TYPE="docs"
        elif git diff --cached --name-only | grep -q "package.json\|yarn.lock"; then
            COMMIT_TYPE="chore"
        else
            COMMIT_TYPE="chore"
        fi
        
        # Generate message based on type
        if [ "$COMMIT_TYPE" = "feat" ]; then
            commit_message="feat: update implementation (${FILE_COUNT} files)"
        elif [ "$COMMIT_TYPE" = "test" ]; then
            commit_message="test: update tests (${FILE_COUNT} files)"
        elif [ "$COMMIT_TYPE" = "docs" ]; then
            commit_message="docs: update documentation (${FILE_COUNT} files)"
        else
            commit_message="chore: prepare dev release (${FILE_COUNT} files)"
        fi
        
        # Show generated message and allow editing
        echo -e "${GREEN}Generated commit message:${NC} $commit_message"
        echo -e "${YELLOW}Press Enter to accept, or type a new message:${NC}"
        read -r custom_message
        
        # If user typed something, use it. Otherwise keep generated message
        if [ -n "$custom_message" ]; then
            commit_message="$custom_message"
        fi
        
        # Commit
        git commit -m "$commit_message"
        echo -e "${GREEN}✅ Changes committed${NC}"
    else
        echo -e "${RED}❌ Cannot proceed with uncommitted changes${NC}"
        exit 1
    fi
fi

# Push to current branch
echo -e "\n${BLUE}📤 Pushing to origin/${CURRENT_BRANCH}...${NC}"
git push origin "${CURRENT_BRANCH}"

# Get the current commit hash (7 characters)
COMMIT_HASH=$(git rev-parse --short=7 HEAD)

# Create version tag
DEV_VERSION="v${BASE_VERSION}-dev.${COMMIT_HASH}"

echo -e "\n${BLUE}🏷️  Creating dev version: ${GREEN}${DEV_VERSION}${NC}"

# Check if tag already exists
if git rev-parse "$DEV_VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Tag ${DEV_VERSION} already exists. Deleting old tag...${NC}"
    git tag -d "$DEV_VERSION"
    git push origin ":refs/tags/$DEV_VERSION" 2>/dev/null || true
fi

# Create new tag
git tag -a "$DEV_VERSION" -m "Dev release ${DEV_VERSION}

Development build from commit ${COMMIT_HASH}
Branch: ${CURRENT_BRANCH}
Base version: ${BASE_VERSION}

This is a pre-release version for testing purposes."

# Push tag
echo -e "\n${BLUE}📤 Pushing tag to origin...${NC}"
git push origin "$DEV_VERSION"

# Create GitHub release
echo -e "\n${BLUE}📋 Creating GitHub pre-release...${NC}"

# Get recent commits for release notes
RECENT_COMMITS=$(git log --oneline -5 --pretty=format:"- %s (%h)")

# Create release notes
RELEASE_NOTES="## 🧪 Development Release

This is a development release for testing purposes.

### 📌 Version Info
- **Base version**: ${BASE_VERSION}
- **Commit**: ${COMMIT_HASH}
- **Branch**: ${CURRENT_BRANCH}
- **Build time**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

### 📝 Recent Changes
${RECENT_COMMITS}

### 🚀 Usage
\`\`\`yaml
- uses: yofix/yofix@${DEV_VERSION}
  with:
    # your configuration...
\`\`\`

### ⚠️ Warning
This is a development version for testing only. For production, use the latest stable release.

---
*Automated dev release from commit ${COMMIT_HASH}*"

# Create GitHub release
gh release create "$DEV_VERSION" \
    --title "$DEV_VERSION - Development Build" \
    --notes "$RELEASE_NOTES" \
    --prerelease

echo -e "\n${GREEN}✅ Dev release created successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Version: ${GREEN}${DEV_VERSION}${NC}"
echo -e "GitHub Release: ${BLUE}https://github.com/yofix/yofix/releases/tag/${DEV_VERSION}${NC}"
echo ""
echo -e "${YELLOW}📋 To use this version in GitHub Actions:${NC}"
echo -e "    ${GREEN}uses: yofix/yofix@${DEV_VERSION}${NC}"
echo ""