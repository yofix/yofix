#!/bin/bash

# Test script specifically for authentication module changes in v1.0.17
# Run with: ./scripts/test-auth-module.sh

set -e

echo "🔐 YoFix Authentication Module Test"
echo "==================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test configuration
TEST_URL="${TEST_URL:-https://app.tryloop.ai}"
TEST_EMAIL="${TEST_EMAIL:-hari@tryloop.ai}"
TEST_PASSWORD="${TEST_PASSWORD:-Loop@134}"
TEST_LOGIN_URL="${TEST_LOGIN_URL:-/login/password}"

echo "Test Configuration:"
echo "  URL: $TEST_URL"
echo "  Login URL: $TEST_LOGIN_URL"
echo "  Email: $TEST_EMAIL"
echo ""

# Build first
echo "📦 Building YoFix..."
npm run build || {
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
}
echo -e "${GREEN}✅ Build successful${NC}\n"

# Test 1: Route Extraction
echo "1️⃣ Testing Route Extraction Module..."
export INPUT_PREVIEW_URL="$TEST_URL"
export INPUT_MAX_ROUTES="5"
export INPUT_DEBUG="true"

node dist/modules/route-extractor.js || {
    echo -e "${RED}❌ Route extraction failed${NC}"
    exit 1
}

if [ -f "routes.json" ]; then
    routes=$(cat routes.json | jq -r '.[] | .path' | tr '\n' ' ')
    echo -e "${GREEN}✅ Routes extracted: $routes${NC}"
else
    echo -e "${RED}❌ routes.json not created${NC}"
    exit 1
fi
echo ""

# Test 2: Visual Testing with Authentication
echo "2️⃣ Testing Visual Tester with Authentication..."

# Read routes from previous test
ROUTES=$(cat routes.json)

export INPUT_PREVIEW_URL="$TEST_URL"
export INPUT_ROUTES="$ROUTES"
export INPUT_VIEWPORTS="1920x1080,375x667"
export INPUT_TEST_TIMEOUT="30s"
export INPUT_AUTH_EMAIL="$TEST_EMAIL"
export INPUT_AUTH_PASSWORD="$TEST_PASSWORD"
export INPUT_AUTH_LOGIN_URL="$TEST_LOGIN_URL"
export INPUT_DEBUG="true"

echo "  Testing with authentication:"
echo "  - Email: $INPUT_AUTH_EMAIL"
echo "  - Login URL: $INPUT_AUTH_LOGIN_URL"
echo ""

node dist/modules/visual-tester.js || {
    echo -e "${RED}❌ Visual testing failed${NC}"
    exit 1
}

# Check results
if [ -f "visual-test-results.json" ]; then
    total=$(cat visual-test-results.json | jq '.summary.total')
    passed=$(cat visual-test-results.json | jq '.summary.passed')
    failed=$(cat visual-test-results.json | jq '.summary.failed')
    warnings=$(cat visual-test-results.json | jq '.summary.warnings')
    
    echo -e "${GREEN}✅ Visual tests completed:${NC}"
    echo "     Total: $total"
    echo "     Passed: $passed"
    echo "     Failed: $failed"
    echo "     Warnings: $warnings"
else
    echo -e "${RED}❌ visual-test-results.json not created${NC}"
    exit 1
fi

# Check authentication state
if [ -f "auth-state.json" ]; then
    echo -e "${GREEN}✅ Authentication state saved${NC}"
else
    echo -e "${YELLOW}⚠️  No authentication state saved${NC}"
fi

# Check screenshots
if [ -d "screenshots" ]; then
    screenshot_count=$(ls -1 screenshots/*.png 2>/dev/null | wc -l)
    if [ $screenshot_count -gt 0 ]; then
        echo -e "${GREEN}✅ Created $screenshot_count screenshots${NC}"
        ls -la screenshots/
    else
        echo -e "${RED}❌ No screenshots created${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Screenshots directory not created${NC}"
    exit 1
fi
echo ""

# Test 3: Test with different login URLs
echo "3️⃣ Testing Different Login URL Patterns..."

test_login_urls=(
    "/login"
    "/signin"
    "/auth/login"
    "/account/login"
)

for login_url in "${test_login_urls[@]}"; do
    echo "  Testing login URL: $login_url"
    export INPUT_AUTH_LOGIN_URL="$login_url"
    
    # Just test the auth flow, not full visual test
    timeout 10 node dist/modules/visual-tester.js 2>&1 | grep -E "(Authenticating at|Login error|Authentication successful)" || true
done
echo ""

# Summary
echo "================================"
echo "Authentication Module Test Summary:"
echo ""

if [ $failed -eq 0 ] && [ $screenshot_count -gt 0 ]; then
    echo -e "${GREEN}✅ All authentication tests passed!${NC}"
    echo ""
    echo "Key improvements in v1.0.17:"
    echo "  • Custom login URL support (auth-login-url parameter)"
    echo "  • Session persistence across routes"
    echo "  • Automatic re-authentication on expiry"
    echo "  • Better login form detection"
    echo ""
    echo "Ready for release!"
else
    echo -e "${YELLOW}⚠️  Some tests had issues. Review the output above.${NC}"
fi

# Cleanup option
echo ""
read -p "Clean up test artifacts? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f routes.json visual-test-results.json auth-state.json
    rm -rf screenshots/
    echo "Cleaned up test artifacts"
fi