# YoFix Deployment Guide

## Overview

YoFix is a **GitHub Action** distributed through the GitHub Marketplace. It runs directly in users' GitHub workflows on GitHub's infrastructure - not a traditional web service requiring server deployment.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Repo    │────▶│  GitHub Action   │────▶│  User's PR      │
│  (yofix/yofix)  │     │  (Marketplace)   │     │  (Runs YoFix)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                                                  │
        │                                                  ▼
        ▼                                          ┌─────────────────┐
┌─────────────────┐                                │  External APIs  │
│  Compiled dist/ │                                │  - Claude AI    │
│  (JavaScript)   │                                │  - Firebase     │
└─────────────────┘                                │  - S3 Storage   │
                                                   └─────────────────┘
```

## Deployment Methods

### 1. GitHub Action (Current) ✅

The primary way to use YoFix is as a GitHub Action in your workflow.

#### Basic Setup

```yaml
name: Visual Testing
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  yofix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Deploy your app (example with Vercel)
      - name: Deploy Preview
        id: deploy
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
      
      # Run YoFix
      - uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.preview-url }}
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
```

#### With Authentication

```yaml
- uses: yofix/yofix@v1
  with:
    preview-url: ${{ steps.deploy.outputs.preview-url }}
    github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
    # Authentication
    auth-email: ${{ secrets.TEST_USER_EMAIL }}
    auth-password: ${{ secrets.TEST_USER_PASSWORD }}
    auth-login-url: /login
```

#### Advanced Configuration

```yaml
- uses: yofix/yofix@v1
  with:
    # Required
    preview-url: https://preview.example.com
    github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    
    # Storage (S3 instead of Firebase)
    storage-provider: s3
    s3-bucket: ${{ secrets.S3_BUCKET }}
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1
    
    # Optional Configuration
    viewports: "1920x1080,1440x900,768x1024,375x812"
    test-timeout: "45000"
    max-routes: "25"
    cleanup-days: "7"
    
    # Caching (Redis)
    redis-url: ${{ secrets.REDIS_URL }}
    cache-ttl: "86400"
```

### 2. GitHub App (Future) 🔮

Coming soon: Install YoFix as a GitHub App for automatic PR analysis.

#### Planned Features
- No workflow file needed
- Automatic PR detection
- Centralized configuration
- Team management

#### Configuration (`.github/yofix.yml`)
```yaml
# Future YoFix App Configuration
enabled: true
preview:
  provider: vercel  # or firebase, netlify
  pattern: "https://{project}-{pr}.vercel.app"

authentication:
  required: true
  method: email-password
  loginUrl: /auth/login

storage:
  provider: yofix-cloud  # Managed storage
```

### 3. CLI Tool (Development) 🛠️

For local development and testing:

```bash
# Install globally
npm install -g yofix

# Run locally
yofix test https://localhost:3000 \
  --claude-key=$CLAUDE_API_KEY \
  --output=./yofix-report
```

## Build & Release Process

### Build Process

```bash
# 1. Install dependencies
npm ci

# 2. Run quality checks
npm run lint
npm run typecheck
npm test

# 3. Build distribution
npm run build

# Creates dist/index.js with all dependencies bundled
# Uses @vercel/ncc to create a single file
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Lint
        run: npm run lint
        
      - name: Type check
        run: npm run typecheck
        
      - name: Test
        run: npm test
        
      - name: Build
        run: npm run build
        
      - name: Verify dist
        run: |
          if [ -n "$(git status --porcelain dist/)" ]; then
            echo "dist/ has changes. Run 'npm run build' locally"
            exit 1
          fi
```

### Release Process

```bash
# 1. Update version
npm version patch  # or minor/major

# 2. Build and commit
npm run build
git add dist/
git commit -m "build: release v$(node -p "require('./package.json').version")"

# 3. Create tag
git tag v$(node -p "require('./package.json').version")

# 4. Push to GitHub
git push origin main --tags

# 5. Create GitHub Release
# This triggers marketplace update
```

### Automated Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
          draft: false
          prerelease: false
```

## Environment Configuration

### Required Secrets

```yaml
# Repository Secrets (Settings → Secrets → Actions)
CLAUDE_API_KEY          # From console.anthropic.com
FIREBASE_SERVICE_ACCOUNT # Base64 encoded JSON
FIREBASE_STORAGE_BUCKET  # Your bucket name

# Optional
REDIS_URL               # Redis connection string
SLACK_WEBHOOK_URL       # For notifications
SENTRY_DSN             # Error tracking
```

### Environment Variables

```yaml
# Repository Variables (Settings → Variables → Actions)
STORAGE_PROVIDER: firebase  # or s3
DEFAULT_VIEWPORTS: "1920x1080,768x1024,375x667"
MAX_ROUTES: "20"
TEST_TIMEOUT: "30000"
```

## Monitoring & Observability

### GitHub Insights

Monitor usage through GitHub:
- Actions tab → Workflow runs
- Insights → Traffic
- Marketplace → Analytics

### Custom Monitoring

```yaml
# Add to your workflow
- name: Track Metrics
  if: always()
  uses: yofix/metrics@v1
  with:
    run-id: ${{ github.run_id }}
    status: ${{ job.status }}
    duration: ${{ steps.yofix.outputs.duration }}
    issues-found: ${{ steps.yofix.outputs.issues-count }}
```

### Error Tracking

```typescript
// Built-in Sentry integration
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: 'production',
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
    ],
  });
}
```

## Security Considerations

### Secrets Management
- Never log sensitive information
- Use GitHub's encrypted secrets
- Rotate API keys regularly
- Limit secret access to required workflows

### Permissions
```yaml
# Minimal required permissions
permissions:
  contents: read
  pull-requests: write
  issues: write
```

### Domain Restrictions
- Validate preview URLs
- Whitelist allowed domains
- Prevent SSRF attacks
- Sandbox browser execution

## Troubleshooting

### Common Issues

1. **Build failures**
   ```bash
   # Ensure clean build
   rm -rf node_modules dist
   npm ci
   npm run build
   ```

2. **TypeScript errors**
   ```bash
   # Check types
   npm run typecheck
   ```

3. **Action not found**
   - Ensure version tag exists
   - Check marketplace listing
   - Use full action path: `yofix/yofix@v1`

4. **Storage issues**
   - Verify credentials are base64 encoded
   - Check bucket permissions
   - Ensure service account has write access

### Debug Mode

```yaml
- uses: yofix/yofix@v1
  with:
    debug: true  # Enable verbose logging
  env:
    ACTIONS_STEP_DEBUG: true  # GitHub debug mode
```

## Production Best Practices

### 1. Version Pinning
```yaml
# Good - Pin to major version
- uses: yofix/yofix@v1

# Better - Pin to specific version
- uses: yofix/yofix@v1.2.3

# Bad - Using latest
- uses: yofix/yofix@main
```

### 2. Timeout Configuration
```yaml
- uses: yofix/yofix@v1
  timeout-minutes: 10  # Prevent hanging
  with:
    test-timeout: "30000"  # 30s per test
```

### 3. Conditional Execution
```yaml
- uses: yofix/yofix@v1
  if: |
    github.event_name == 'pull_request' &&
    !contains(github.event.pull_request.labels.*.name, 'skip-visual-test')
```

### 4. Matrix Testing
```yaml
strategy:
  matrix:
    viewport: ['desktop', 'tablet', 'mobile']
    
- uses: yofix/yofix@v1
  with:
    viewports: ${{ matrix.viewport }}
```

## Scaling Considerations

### Current Architecture
- Runs on GitHub's infrastructure
- No server costs
- Scales with GitHub Actions limits
- Pay-per-use model (API calls)

### Future Scaling
- GitHub App for centralized processing
- Worker pool for parallel execution
- CDN for screenshot delivery
- Redis cluster for distributed caching

## Migration Guide

### From Other Visual Testing Tools

#### From Percy
```yaml
# Before (Percy)
- name: Percy
  run: percy exec -- npm run test

# After (YoFix)
- uses: yofix/yofix@v1
  with:
    preview-url: ${{ steps.deploy.outputs.url }}
```

#### From Chromatic
```yaml
# Before (Chromatic)
- uses: chromaui/action@v1
  with:
    projectToken: ${{ secrets.CHROMATIC_TOKEN }}

# After (YoFix)
- uses: yofix/yofix@v1
  with:
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

## Support

- 📚 Documentation: [github.com/yofix/yofix/docs](https://github.com/yofix/yofix/docs)
- 🐛 Issues: [github.com/yofix/yofix/issues](https://github.com/yofix/yofix/issues)
- 💬 Discussions: [github.com/yofix/yofix/discussions](https://github.com/yofix/yofix/discussions)
- 📧 Email: support@yofix.dev