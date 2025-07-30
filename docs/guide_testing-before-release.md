# Testing YoFix Before Release

## Overview

This guide explains how to thoroughly test YoFix before publishing new versions to the GitHub Marketplace.

## Testing Strategy

### 1. **Local Testing**
Test the action locally without GitHub Actions environment.

### 2. **Docker Testing**
Test in a containerized environment similar to GitHub Actions.

### 3. **GitHub Actions Testing**
Test using actual GitHub Actions infrastructure.

### 4. **Pre-Release Testing**
Full integration test with PR creation and verification.

## Quick Start

### Option 1: Local Testing Script

```bash
# Run all local tests
./scripts/test-locally.sh

# This will:
# - Build the action
# - Test basic functionality
# - Test error handling
# - Test in Docker
# - Run performance tests
```

### Option 2: GitHub Actions Testing

```bash
# Run pre-release test workflow
gh workflow run pre-release-test.yml \
  -f version=v1.0.13 \
  -f release-type=patch
```

### Option 3: Manual Testing

```bash
# 1. Build the action
npm ci
npm run build

# 2. Create test environment
export INPUT_PREVIEW_URL="https://example.com"
export INPUT_GITHUB_TOKEN="test-token"
export INPUT_CLAUDE_API_KEY="your-api-key"
export INPUT_FIREBASE_CREDENTIALS="your-creds"
export INPUT_STORAGE_BUCKET="test-bucket"

# 3. Run the action
node dist/index.js
```

## Detailed Testing Procedures

### 1. Local Development Testing

#### Setup Test Environment

```bash
# Install dependencies
npm ci

# Build the action
npm run build

# Run tests
npm test
```

#### Test with act (GitHub Actions locally)

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash  # Linux

# Run workflows locally
act -j test-basic
act -j test-auth
act -j test-ai-features
```

### 2. Integration Testing

#### Create Test Repository

1. Create a new repository: `yofix-test-app`
2. Add test workflow:

```yaml
name: Test YoFix
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    
    steps:
      - uses: actions/checkout@v4
      
      # Use local YoFix
      - uses: yofix/yofix@main
        with:
          preview-url: https://your-test-app.com
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          firebase-credentials: ${{ secrets.FIREBASE_CREDENTIALS }}
          storage-bucket: test-bucket
```

3. Create a PR and verify YoFix comments are posted

### 3. Feature-Specific Testing

#### Test PR Comments

```yaml
# .github/workflows/test-comments.yml
name: Test PR Comments
on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      issues: write
    
    steps:
      - uses: ./
        with:
          preview-url: https://example.com
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # ... other inputs
```

#### Test Smart Authentication

```yaml
# Test with a real login page
- uses: ./
  with:
    preview-url: https://app-with-login.com
    enable-smart-auth: 'true'
    auth-email: test@example.com
    auth-password: testpass
    auth-login-url: /login
```

#### Test AI Features

```yaml
# Test AI navigation discovery
- uses: ./
  with:
    preview-url: https://complex-app.com
    enable-ai-navigation: 'true'
    enable-ai-test-generation: 'true'
    routes: 'auto'
```

### 4. Error Scenario Testing

Test these scenarios to ensure proper error handling:

1. **Invalid URL**
   ```yaml
   preview-url: https://invalid-url-12345.com
   ```

2. **Missing Permissions**
   ```yaml
   # Remove permissions block to test
   ```

3. **Wrong Event Type**
   ```yaml
   on: push  # Should warn about PR context
   ```

4. **Network Failures**
   - Test with offline mode
   - Test with slow connections

### 5. Performance Testing

Monitor these metrics:
- Action execution time
- Memory usage
- Screenshot processing speed
- API rate limits

```bash
# Run performance test
time node dist/index.js

# Monitor resources
top -pid $(pgrep node)
```

## Pre-Release Checklist

Before releasing, ensure:

- [ ] All tests pass locally
- [ ] Docker tests pass
- [ ] GitHub Actions tests pass
- [ ] PR comments are posted correctly
- [ ] Screenshots are uploaded
- [ ] Error handling works
- [ ] Performance is acceptable
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Documentation is updated
- [ ] CHANGELOG is updated

## Testing Matrix

| Feature | Local | Docker | GitHub Actions | Real PR |
|---------|-------|--------|----------------|---------|
| Basic Tests | ✅ | ✅ | ✅ | ✅ |
| PR Comments | ❌ | ❌ | ✅ | ✅ |
| Auth | ✅ | ✅ | ✅ | ✅ |
| AI Features | ✅ | ✅ | ✅ | ✅ |
| Screenshots | ✅ | ✅ | ✅ | ✅ |
| Error Handling | ✅ | ✅ | ✅ | ✅ |

## Automated Release Process

Once all tests pass:

```bash
# 1. Update version
npm version patch  # or minor/major

# 2. Push with tags
git push origin main --tags

# 3. Release workflow automatically:
#    - Creates GitHub release
#    - Publishes to marketplace
#    - Updates documentation
```

## Rollback Procedure

If issues are found after release:

1. **Immediate Rollback**
   ```bash
   # Revert to previous version
   git revert HEAD
   git push origin main
   
   # Tag as hotfix
   npm version patch
   git push --tags
   ```

2. **Update Marketplace**
   - Mark problematic version as pre-release
   - Update marketplace listing

3. **Notify Users**
   - Create issue explaining the problem
   - Post in discussions

## Continuous Testing

Set up continuous testing:

1. **Scheduled Tests**
   ```yaml
   on:
     schedule:
       - cron: '0 0 * * *'  # Daily
   ```

2. **Dependency Updates**
   - Use Dependabot
   - Test with updated dependencies

3. **Compatibility Testing**
   - Test with different Node versions
   - Test with different OS versions

## Troubleshooting

### Tests Failing Locally

1. Check environment variables
2. Verify dependencies are installed
3. Check Node.js version
4. Clear cache: `rm -rf node_modules && npm ci`

### GitHub Actions Tests Failing

1. Check permissions
2. Verify secrets are set
3. Check workflow syntax
4. Review action logs

### Docker Tests Failing

1. Ensure Docker is running
2. Check Docker resources
3. Verify image builds correctly
4. Check container logs

## Best Practices

1. **Test Early and Often**
   - Run tests on every commit
   - Test before creating PR
   - Test before merging

2. **Use Test Branches**
   - Create `test/*` branches
   - Test features in isolation
   - Merge only after tests pass

3. **Monitor Production**
   - Track marketplace installs
   - Monitor issue reports
   - Respond quickly to problems

4. **Document Issues**
   - Keep test failure log
   - Document workarounds
   - Update tests for edge cases