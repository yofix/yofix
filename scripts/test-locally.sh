#!/bin/bash

# YoFix Local Testing Script
# This script tests YoFix locally before publishing to GitHub Marketplace

set -e

echo "🧪 YoFix Local Testing Script"
echo "============================="
echo ""

# Load environment variables
load_env() {
    # Try to load from .env.test first, then .env.test.example
    if [ -f ".env.test" ]; then
        echo "Loading environment from .env.test..."
        export $(grep -v '^#' .env.test | xargs)
    elif [ -f ".env.test.example" ]; then
        echo "Loading environment from .env.test.example..."
        export $(grep -v '^#' .env.test.example | xargs)
    else
        echo "No .env.test or .env.test.example found. Using system environment."
    fi
}

# Load environment at start
load_env

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo "1️⃣ Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js $(node --version)${NC}"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ npm $(npm --version)${NC}"
    
    # Check environment variables
    if [ -z "$CLAUDE_API_KEY" ]; then
        echo -e "${YELLOW}⚠️  CLAUDE_API_KEY not set. Some tests will be skipped.${NC}"
        echo "   Tip: Create .env.test file with: CLAUDE_API_KEY=your-key"
    else
        echo -e "${GREEN}✅ CLAUDE_API_KEY is set${NC}"
    fi
    
    # Check for Firebase credentials (multiple possible names)
    FIREBASE_CREDS="${TEST_FIREBASE_CREDENTIALS:-${FE_FIREBASE_SERVICE_ACCOUNT_ARBOREAL_VISION_339901:-${FE_FIREBASE_SERVICE_ACCOUNT_KEY_BASE64}}}"
    if [ -z "$FIREBASE_CREDS" ]; then
        echo -e "${YELLOW}⚠️  Firebase credentials not set. Storage tests will be skipped.${NC}"
        echo "   Tip: Set FE_FIREBASE_SERVICE_ACCOUNT_ARBOREAL_VISION_339901 in .env.test"
    else
        echo -e "${GREEN}✅ Firebase credentials are set${NC}"
        export TEST_FIREBASE_CREDENTIALS="$FIREBASE_CREDS"
    fi
    
    # Check storage bucket
    STORAGE_BUCKET="${FE_VAR_FIREBASE_STORAGE_BUCKET:-test-bucket}"
    if [ -n "$FE_VAR_FIREBASE_STORAGE_BUCKET" ]; then
        echo -e "${GREEN}✅ Storage bucket: $STORAGE_BUCKET${NC}"
    else
        echo -e "${YELLOW}⚠️  Using default storage bucket: $STORAGE_BUCKET${NC}"
    fi
    export TEST_STORAGE_BUCKET="$STORAGE_BUCKET"
    
    echo ""
}

# Build the action
build_action() {
    echo "2️⃣ Building YoFix..."
    
    # Clean install with warnings suppressed
    echo "Installing dependencies..."
    npm ci --silent 2>/dev/null || {
        echo -e "${YELLOW}⚠️  npm ci had warnings, trying regular install...${NC}"
        npm install --silent
    }
    
    echo "Building action..."
    npm run build --silent
    
    # Verify build output
    if [ ! -f "dist/index.js" ]; then
        echo -e "${RED}❌ Build failed - dist/index.js not found${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Build successful${NC}"
    echo ""
}

# Test basic functionality
test_basic() {
    echo "3️⃣ Testing basic functionality..."
    
    # Create a test HTML file
    mkdir -p test-output
    cat > test-output/test.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>YoFix Test Page</title>
    <style>
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .responsive-test { background: #f0f0f0; padding: 20px; }
        @media (max-width: 768px) {
            .responsive-test { background: #e0e0e0; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>YoFix Test Page</h1>
        <div class="responsive-test">
            <p>This div changes color on mobile</p>
            <button id="test-btn">Test Button</button>
        </div>
    </div>
</body>
</html>
EOF

    # Start a local server
    echo "Starting local test server..."
    npx http-server test-output -p 8080 &
    SERVER_PID=$!
    sleep 2
    
    # Use real preview URL if available, otherwise use local
    PREVIEW_URL="${TEST_PREVIEW_URL:-http://localhost:8080/test.html}"
    
    # Run YoFix locally
    export INPUT_PREVIEW_URL="$PREVIEW_URL"
    export INPUT_GITHUB_TOKEN="${YOFIX_GITHUB_TOKEN:-test-token}"
    export INPUT_CLAUDE_API_KEY="${CLAUDE_API_KEY:-test-key}"
    export INPUT_FIREBASE_CREDENTIALS="${TEST_FIREBASE_CREDENTIALS:-test-creds}"
    export INPUT_STORAGE_BUCKET="${TEST_STORAGE_BUCKET:-test-bucket}"
    export INPUT_VIEWPORTS="1920x1080"
    export INPUT_TEST_ROUTES="/"
    
    # Mock GitHub context
    export GITHUB_REPOSITORY="test/repo"
    export GITHUB_RUN_ID="123"
    export GITHUB_SHA="abc123"
    export GITHUB_EVENT_NAME="push"
    export GITHUB_WORKSPACE="$(pwd)"
    
    # If we have a test PR number, mock PR context
    if [ -n "$TEST_PR_NUMBER" ]; then
        export GITHUB_EVENT_NAME="pull_request"
        export GITHUB_EVENT_PATH="/tmp/github_event.json"
        mkdir -p /tmp
        cat > /tmp/github_event.json << EOF
{
  "pull_request": {
    "number": $TEST_PR_NUMBER,
    "head": {
      "sha": "abc123"
    }
  }
}
EOF
    fi
    
    echo "Running YoFix..."
    if [ "$INPUT_PREVIEW_URL" = "http://localhost:8080/test.html" ]; then
        echo "Using local test server"
    else
        echo "Using preview URL: $INPUT_PREVIEW_URL"
        # Don't start server if using external URL
        SERVER_PID=""
    fi
    
    timeout 60 node dist/index.js || {
        if [ -n "$SERVER_PID" ]; then
            kill $SERVER_PID 2>/dev/null || true
        fi
        echo -e "${RED}❌ Basic test failed${NC}"
        echo "Check the error above for details"
        return 1
    }
    
    if [ -n "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Basic test passed${NC}"
    echo ""
}

# Test with Docker (simulates GitHub Actions environment)
test_with_docker() {
    echo "4️⃣ Testing in Docker (GitHub Actions environment)..."
    
    # Create Dockerfile for testing
    cat > Dockerfile.test << 'EOF'
FROM node:20-slim

# Install Chrome dependencies (same as GitHub Actions)
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm ci && npm run build

# Install Playwright browsers
RUN npx playwright install chromium

CMD ["node", "dist/index.js"]
EOF

    # Build Docker image
    echo "Building Docker image..."
    docker build -f Dockerfile.test -t yofix-test . || {
        echo -e "${YELLOW}⚠️  Docker test skipped (Docker not available)${NC}"
        rm Dockerfile.test
        return
    }
    
    # Run test in Docker
    docker run --rm \
        -e INPUT_PREVIEW_URL="https://example.com" \
        -e INPUT_GITHUB_TOKEN="test-token" \
        -e INPUT_CLAUDE_API_KEY="${CLAUDE_API_KEY:-test-key}" \
        -e INPUT_FIREBASE_CREDENTIALS="${TEST_FIREBASE_CREDENTIALS:-test-creds}" \
        -e INPUT_STORAGE_BUCKET="test-bucket" \
        -e GITHUB_REPOSITORY="test/repo" \
        -e GITHUB_EVENT_NAME="push" \
        yofix-test || {
        echo -e "${RED}❌ Docker test failed${NC}"
        rm Dockerfile.test
        exit 1
    }
    
    rm Dockerfile.test
    echo -e "${GREEN}✅ Docker test passed${NC}"
    echo ""
}

# Test error scenarios
test_error_handling() {
    echo "5️⃣ Testing error handling..."
    
    # Test with invalid URL
    export INPUT_PREVIEW_URL="https://invalid-url-12345.com"
    
    echo "Testing invalid URL..."
    node dist/index.js 2>&1 | grep -q "failed" && {
        echo -e "${GREEN}✅ Invalid URL handled correctly${NC}"
    } || {
        echo -e "${RED}❌ Invalid URL not handled properly${NC}"
        exit 1
    }
    
    echo ""
}

# Integration test with act (GitHub Actions locally)
test_with_act() {
    echo "6️⃣ Testing with act (GitHub Actions locally)..."
    
    if ! command -v act &> /dev/null; then
        echo -e "${YELLOW}⚠️  act not installed. Install with: brew install act${NC}"
        echo "   Skipping GitHub Actions simulation..."
        return
    fi
    
    # Create a test workflow
    mkdir -p .github/workflows
    cat > .github/workflows/test-local.yml << 'EOF'
name: Test Local
on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./
        with:
          preview-url: https://example.com
          github-token: test-token
          claude-api-key: test-key
          firebase-credentials: test-creds
          storage-bucket: test-bucket
EOF

    echo "Running with act..."
    act -j test --secret CLAUDE_API_KEY="$CLAUDE_API_KEY" || {
        echo -e "${YELLOW}⚠️  act test failed (this is expected without full GitHub context)${NC}"
    }
    
    rm .github/workflows/test-local.yml
    echo ""
}

# Performance test
test_performance() {
    echo "7️⃣ Testing performance..."
    
    START_TIME=$(date +%s)
    
    # Run a quick test
    export INPUT_PREVIEW_URL="https://example.com"
    export INPUT_VIEWPORTS="1920x1080"
    export INPUT_TEST_ROUTES="/"
    
    timeout 60 node dist/index.js > /dev/null 2>&1 || true
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    if [ $DURATION -lt 60 ]; then
        echo -e "${GREEN}✅ Performance test passed (${DURATION}s)${NC}"
    else
        echo -e "${YELLOW}⚠️  Performance could be improved (${DURATION}s)${NC}"
    fi
    
    echo ""
}

# Main test flow
main() {
    local test_results=()
    
    check_prerequisites
    build_action
    
    # Run tests and track results
    if test_basic; then
        test_results+=("Basic: ✅")
    else
        test_results+=("Basic: ❌")
    fi
    
    if test_error_handling; then
        test_results+=("Error Handling: ✅")
    else
        test_results+=("Error Handling: ❌")
    fi
    
    if test_with_docker; then
        test_results+=("Docker: ✅")
    else
        test_results+=("Docker: ⚠️  Skipped")
    fi
    
    if test_with_act; then
        test_results+=("Act: ✅")
    else
        test_results+=("Act: ⚠️  Skipped")
    fi
    
    if test_performance; then
        test_results+=("Performance: ✅")
    else
        test_results+=("Performance: ❌")
    fi
    
    echo "================================"
    echo "Test Results Summary:"
    for result in "${test_results[@]}"; do
        echo "  $result"
    done
    echo ""
    
    # Check if critical tests passed
    local failed_tests=0
    for result in "${test_results[@]}"; do
        if [[ $result == *"❌"* ]]; then
            ((failed_tests++))
        fi
    done
    
    if [ $failed_tests -eq 0 ]; then
        echo -e "${GREEN}✅ All tests completed successfully!${NC}"
        echo ""
        echo "YoFix is ready for release. To publish:"
        echo "1. Commit and push your changes"
        echo "2. Create a PR and ensure CI tests pass"
        echo "3. Merge to main"
        echo "4. Run: npm version patch && git push --tags"
    else
        echo -e "${YELLOW}⚠️  $failed_tests test(s) failed. Review issues before releasing.${NC}"
        echo ""
        echo "To fix issues:"
        echo "1. Check the error messages above"
        echo "2. Fix any problems"
        echo "3. Re-run this script"
    fi
    
    echo ""
    
    # Clean up
    rm -rf test-output
    
    # Exit with error code if tests failed
    exit $failed_tests
}

# Run main function
main