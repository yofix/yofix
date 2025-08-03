#!/bin/bash

# Advanced pre-release script with multiple release types
# Usage: ./scripts/release-pre.sh [type] [version-base]
# Types: dev, alpha
# Examples: 
#   ./scripts/release-pre.sh dev
#   ./scripts/release-pre.sh alpha 1.0.22

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Get release type (default: dev)
RELEASE_TYPE=${1:-dev}

# Validate release type
if [[ ! "$RELEASE_TYPE" =~ ^(dev|alpha)$ ]]; then
    echo -e "${RED}❌ Invalid release type: ${RELEASE_TYPE}${NC}"
    echo -e "Valid types: dev, alpha"
    exit 1
fi

# Get base version
if [ -z "$2" ]; then
    BASE_VERSION=$(node -p "require('./package.json').version")
else
    BASE_VERSION=$2
fi

# Get metadata
CURRENT_BRANCH=$(git branch --show-current)
COMMIT_HASH=$(git rev-parse --short=7 HEAD)  # Use 7-character hash
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# ASCII Art Header
echo -e "${PURPLE}"
echo "╔═══════════════════════════════════════╗"
echo "║        YoFix Pre-Release Tool         ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BLUE}📋 Release Configuration${NC}"
echo -e "├─ Type: ${GREEN}${RELEASE_TYPE}${NC}"
echo -e "├─ Base version: ${GREEN}${BASE_VERSION}${NC}"
echo -e "├─ Branch: ${GREEN}${CURRENT_BRANCH}${NC}"
echo -e "└─ Commit: ${GREEN}${COMMIT_HASH}${NC}"
echo ""

# Function to handle git operations
handle_git_changes() {
    if ! git diff-index --quiet HEAD --; then
        echo -e "${YELLOW}📝 Uncommitted changes detected${NC}"
        
        # Show changes summary
        local changed_files=$(git diff --name-only | wc -l | tr -d ' ')
        local added_files=$(git diff --name-only --diff-filter=A | wc -l | tr -d ' ')
        local modified_files=$(git diff --name-only --diff-filter=M | wc -l | tr -d ' ')
        local deleted_files=$(git diff --name-only --diff-filter=D | wc -l | tr -d ' ')
        
        echo -e "\n${YELLOW}Changes summary:${NC}"
        echo -e "├─ Total files: ${changed_files}"
        echo -e "├─ Added: ${GREEN}+${added_files}${NC}"
        echo -e "├─ Modified: ${YELLOW}~${modified_files}${NC}"
        echo -e "└─ Deleted: ${RED}-${deleted_files}${NC}"
        
        # Show detailed status
        echo -e "\n${YELLOW}Detailed changes:${NC}"
        git status --short
        
        # Interactive commit
        echo -e "\n${YELLOW}Do you want to:${NC}"
        echo -e "  1) Commit all changes"
        echo -e "  2) Review and stage files interactively"
        echo -e "  3) Cancel"
        echo -e -n "\n${YELLOW}Your choice (1/2/3): ${NC}"
        read -r choice
        
        case $choice in
            1)
                git add -A
                echo -e "\n${YELLOW}Enter commit message (or press Enter for default):${NC}"
                read -r commit_message
                
                if [ -z "$commit_message" ]; then
                    commit_message="chore: prepare ${RELEASE_TYPE} release ${BASE_VERSION}"
                fi
                
                git commit -m "$commit_message"
                echo -e "${GREEN}✅ Changes committed${NC}"
                ;;
            2)
                echo -e "\n${BLUE}Opening interactive staging...${NC}"
                git add -i
                
                if git diff --cached --quiet; then
                    echo -e "${RED}❌ No files staged. Exiting.${NC}"
                    exit 1
                fi
                
                echo -e "\n${YELLOW}Enter commit message:${NC}"
                read -r commit_message
                git commit -m "$commit_message"
                echo -e "${GREEN}✅ Changes committed${NC}"
                ;;
            *)
                echo -e "${RED}❌ Release cancelled${NC}"
                exit 1
                ;;
        esac
    fi
}

# Function to generate version string
generate_version() {
    local version=""
    
    case $RELEASE_TYPE in
        dev)
            version="v${BASE_VERSION}-dev.${COMMIT_HASH}"
            ;;
        alpha)
            # Check for existing alpha releases
            local alpha_count=$(git tag -l "v${BASE_VERSION}-alpha.*" | wc -l | tr -d ' ')
            local next_alpha=$((alpha_count + 1))
            version="v${BASE_VERSION}-alpha.${next_alpha}"
            ;;
    esac
    
    echo "$version"
}

# Handle git changes
handle_git_changes

# Push to origin
echo -e "\n${BLUE}📤 Pushing to origin/${CURRENT_BRANCH}...${NC}"
git push origin "${CURRENT_BRANCH}"

# Update commit hash after potential new commit
COMMIT_HASH=$(git rev-parse --short=7 HEAD)

# Generate version
PRE_VERSION=$(generate_version)

echo -e "\n${BLUE}🏷️  Creating ${RELEASE_TYPE} version: ${GREEN}${PRE_VERSION}${NC}"

# Check if tag exists
if git rev-parse "$PRE_VERSION" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Tag ${PRE_VERSION} already exists${NC}"
    echo -e -n "${YELLOW}Delete and recreate? (y/n): ${NC}"
    read -r response
    
    if [[ "$response" =~ ^[Yy]$ ]]; then
        git tag -d "$PRE_VERSION"
        git push origin ":refs/tags/$PRE_VERSION" 2>/dev/null || true
    else
        echo -e "${RED}❌ Release cancelled${NC}"
        exit 1
    fi
fi

# Create tag with appropriate message
TAG_MESSAGE="${RELEASE_TYPE^} release ${PRE_VERSION}

Release type: ${RELEASE_TYPE}
Base version: ${BASE_VERSION}
Commit: ${COMMIT_HASH}
Branch: ${CURRENT_BRANCH}
Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

This is a pre-release version for testing."

git tag -a "$PRE_VERSION" -m "$TAG_MESSAGE"

# Push tag
echo -e "\n${BLUE}📤 Pushing tag...${NC}"
git push origin "$PRE_VERSION"

# Generate release notes based on type
generate_release_notes() {
    local recent_commits=$(git log --oneline -10 --pretty=format:"- %s (%h)")
    local emoji=""
    local warning=""
    
    case $RELEASE_TYPE in
        dev)
            emoji="🔧"
            warning="Development build - highly unstable"
            ;;
        alpha)
            emoji="🧪"
            warning="Alpha release - expect bugs"
            ;;
    esac
    
    cat << EOF
## ${emoji} ${RELEASE_TYPE^} Release

${warning}

### 📌 Version Information
- **Type**: ${RELEASE_TYPE}
- **Version**: ${PRE_VERSION}
- **Base**: ${BASE_VERSION}
- **Commit**: [${COMMIT_HASH}](https://github.com/yofix/yofix/commit/${COMMIT_HASH})
- **Branch**: ${CURRENT_BRANCH}
- **Built**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

### 📝 Recent Changes
${recent_commits}

### 🚀 Installation
\`\`\`yaml
- uses: yofix/yofix@${PRE_VERSION}
  with:
    # your configuration here
\`\`\`

### ⚠️ Important Notes
- This is a ${RELEASE_TYPE} release intended for testing
- Not recommended for production use
- May contain breaking changes or bugs
- Please report issues at: https://github.com/yofix/yofix/issues

### 🔄 Upgrade Path
- Current stable: \`yofix/yofix@v${BASE_VERSION}\`
- This ${RELEASE_TYPE}: \`yofix/yofix@${PRE_VERSION}\`

---
*Automated ${RELEASE_TYPE} release from commit ${COMMIT_HASH}*
EOF
}

# Create GitHub release
echo -e "\n${BLUE}📋 Creating GitHub release...${NC}"

RELEASE_NOTES=$(generate_release_notes)

gh release create "$PRE_VERSION" \
    --title "${PRE_VERSION} - ${RELEASE_TYPE^} Release" \
    --notes "$RELEASE_NOTES" \
    --prerelease

# Success message
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ ${RELEASE_TYPE^} release created successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "Version: ${GREEN}${PRE_VERSION}${NC}"
echo -e "Type: ${GREEN}${RELEASE_TYPE}${NC}"
echo -e "Release URL: ${BLUE}https://github.com/yofix/yofix/releases/tag/${PRE_VERSION}${NC}"
echo ""
echo -e "${YELLOW}📋 Quick Copy:${NC}"
echo -e "    ${GREEN}uses: yofix/yofix@${PRE_VERSION}${NC}"
echo ""

# Additional tips based on release type
case $RELEASE_TYPE in
    dev)
        echo -e "${YELLOW}💡 Dev Tip:${NC} This version includes commit hash for easy tracking"
        ;;
    alpha)
        echo -e "${YELLOW}💡 Alpha Tip:${NC} Test core functionality thoroughly"
        ;;
esac
echo ""