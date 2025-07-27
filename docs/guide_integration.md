# YoFix Integration Guide

## Quick Start

This guide helps you integrate YoFix into any repository for automated visual testing and fixes.

## Prerequisites

- GitHub repository
- Preview deployment system (Vercel, Netlify, Firebase, etc.)
- Claude API key from [Anthropic](https://console.anthropic.com)

## Step 1: Set Up Secrets

Add these secrets to your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add the following secrets:

```bash
CLAUDE_API_KEY          # Your Anthropic API key
FIREBASE_SERVICE_ACCOUNT # Base64 encoded Firebase service account (if using Firebase storage)
TEST_USER_EMAIL         # (Optional) For authenticated routes
TEST_USER_PASSWORD      # (Optional) For authenticated routes
```

## Step 2: Create YoFix Configuration

Create `.yofix.yml` in your repository root:

```yaml
# .yofix.yml
version: 1

# Scanning configuration
scan:
  # Routes to scan - 'auto' will detect from PR changes
  routes: auto
  
  # Viewports to test
  viewports:
    desktop:
      width: 1920
      height: 1080
    tablet:
      width: 768
      height: 1024
    mobile:
      width: 375
      height: 667
  
  # Visual difference threshold (0-1)
  threshold: 0.1
  
  # Max routes to scan (to control costs)
  maxRoutes: 10

# Authentication (if needed)
auth:
  required: true
  loginUrl: /login
  # Credentials will come from GitHub secrets

# Baseline management
baseline:
  strategy: branch  # branch, main, or tag
  autoUpdate: true

# AI configuration
ai:
  model: claude-3-haiku  # Fast and cost-effective
  temperature: 0.3

# Issue detection
issues:
  detect:
    - layout-shift
    - responsive-breakage
    - text-overflow
    - element-overlap
    - color-contrast
  
  # Ignore specific selectors
  ignore:
    - ".third-party-widget"
    - "[data-test-ignore]"
```

## Step 3: Add GitHub Workflow

Create `.github/workflows/yofix.yml`:

### For Vercel Projects

```yaml
name: YoFix Visual Testing

on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  yofix:
    if: |
      github.event_name == 'pull_request' || 
      (github.event.issue.pull_request && contains(github.event.comment.body, '@yofix'))
    
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      # Wait for Vercel deployment
      - name: Wait for Vercel Preview
        uses: patrickedqvist/wait-for-vercel-preview@v1.3.1
        id: vercel
        with:
          token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          max_timeout: 600
      
      # Run YoFix
      - name: YoFix Analysis
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.vercel.outputs.url }}
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          
          # Storage configuration
          storage-provider: yofix-cloud  # Free tier available
          
          # Optional authentication
          auth-email: ${{ secrets.TEST_USER_EMAIL }}
          auth-password: ${{ secrets.TEST_USER_PASSWORD }}
```

### For Firebase Projects

```yaml
name: YoFix Visual Testing

on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  yofix:
    if: |
      github.event_name == 'pull_request' || 
      (github.event.issue.pull_request && contains(github.event.comment.body, '@yofix'))
    
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      # Deploy to Firebase Preview
      - name: Deploy Preview
        id: deploy
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.YOFIX_GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: pr-${{ github.event.pull_request.number || github.event.issue.number }}
      
      # Run YoFix
      - name: YoFix Analysis
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.details_url }}
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
```

### For Netlify Projects

```yaml
name: YoFix Visual Testing

on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  yofix:
    if: |
      github.event_name == 'pull_request' || 
      (github.event.issue.pull_request && contains(github.event.comment.body, '@yofix'))
    
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      # Deploy to Netlify
      - name: Deploy to Netlify
        id: deploy
        uses: nwtgck/actions-netlify@v2.0
        with:
          publish-dir: './dist'
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          deploy-message: "PR #${{ github.event.pull_request.number }}"
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
      
      # Run YoFix
      - name: YoFix Analysis
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.deploy-url }}
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

## Step 4: Configure Authentication (Optional)

If your app requires authentication:

### Email/Password Authentication

```yaml
# In your workflow
auth-email: ${{ secrets.TEST_USER_EMAIL }}
auth-password: ${{ secrets.TEST_USER_PASSWORD }}
auth-login-url: /login  # Your login page URL
```

### Custom Authentication

Create `.yofix.auth.js`:

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    // Navigate to login
    await page.goto('/auth/login');
    
    // Custom login logic
    await page.fill('[name="email"]', credentials.email);
    await page.fill('[name="password"]', credentials.password);
    await page.click('[type="submit"]');
    
    // Wait for auth to complete
    await page.waitForURL('/dashboard');
  }
};
```

## Step 5: Test the Integration

1. **Create a test PR** with a small UI change
2. **Wait for deployment** and YoFix analysis
3. **Check PR comments** for visual analysis results
4. **Test bot commands** by commenting:
   ```
   @yofix scan /specific-route
   @yofix fix #1
   @yofix help
   ```

## Framework-Specific Setup

### React (Create React App)

```yaml
# .yofix.yml additions
framework:
  type: react
  buildCommand: npm run build
  buildDir: build
  
routes:
  # Auto-detect from React Router
  detection: auto
  # Or specify manually
  manual:
    - /
    - /about
    - /products
```

### Next.js

```yaml
# .yofix.yml additions
framework:
  type: nextjs
  buildCommand: npm run build
  buildDir: .next
  
routes:
  # Auto-detect from pages/ or app/
  detection: auto
  # Handle dynamic routes
  dynamic:
    - /blog/[slug]
    - /products/[id]
```

### Vue.js

```yaml
# .yofix.yml additions
framework:
  type: vue
  buildCommand: npm run build
  buildDir: dist
  
routes:
  # Auto-detect from Vue Router
  detection: auto
```

### Angular

```yaml
# .yofix.yml additions
framework:
  type: angular
  buildCommand: ng build
  buildDir: dist/app-name
  
routes:
  # Auto-detect from Angular Router
  detection: auto
```

## Advanced Configuration

### Custom Route Detection

Create `.yofix.routes.js`:

```javascript
// .yofix.routes.js
module.exports = {
  async detectRoutes(changedFiles) {
    const routes = new Set(['/']); // Always test home
    
    // Custom logic based on your app structure
    for (const file of changedFiles) {
      if (file.includes('pages/')) {
        const route = file
          .replace('src/pages', '')
          .replace('/index.js', '')
          .replace('.js', '');
        routes.add(route || '/');
      }
    }
    
    return Array.from(routes);
  }
};
```

### Custom Visual Checks

Create `.yofix.checks.js`:

```javascript
// .yofix.checks.js
module.exports = {
  checks: [
    {
      name: 'brand-colors',
      description: 'Ensure brand colors are correct',
      async check(page) {
        const logo = await page.locator('.logo');
        const color = await logo.evaluate(el => 
          window.getComputedStyle(el).color
        );
        
        if (color !== 'rgb(0, 123, 255)') {
          return {
            passed: false,
            message: 'Logo color is incorrect'
          };
        }
        
        return { passed: true };
      }
    }
  ]
};
```

### Baseline Strategies

```yaml
# .yofix.yml - Different baseline strategies

# Strategy 1: Branch-based (default)
baseline:
  strategy: branch
  # Each branch maintains its own baseline

# Strategy 2: Main branch baseline
baseline:
  strategy: main
  # Always compare against main branch

# Strategy 3: Tag-based
baseline:
  strategy: tag
  pattern: 'release-*'
  # Compare against latest release tag

# Strategy 4: Custom
baseline:
  strategy: custom
  script: .yofix.baseline.js
```

### Performance Optimization

```yaml
# .yofix.yml - Performance settings
performance:
  # Run tests in parallel
  parallel: true
  maxConcurrent: 3
  
  # Skip unchanged routes
  smartMode: true
  
  # Cache screenshots
  cache:
    enable: true
    ttl: 3600
  
  # Reduce screenshot quality for faster processing
  screenshot:
    quality: 85
    fullPage: false  # Only visible viewport
```

## Troubleshooting

### YoFix not running on PRs

1. Check workflow syntax
2. Verify secrets are set correctly
3. Ensure preview deployment completes first

### Authentication failures

1. Test credentials manually
2. Check login URL is correct
3. Try custom authentication script

### High costs

1. Reduce `maxRoutes` in config
2. Use `smartMode` to skip unchanged routes
3. Lower screenshot quality
4. Use branch-based baselines

### Bot not responding

1. Ensure workflow includes `issue_comment` trigger
2. Check bot mention format: `@yofix command`
3. Verify GitHub token permissions

## Getting Help

- **Documentation**: [yofix.dev/docs](https://yofix.dev/docs)
- **GitHub Issues**: [github.com/yofix/yofix/issues](https://github.com/yofix/yofix/issues)
- **Discord**: [discord.gg/yofix](https://discord.gg/yofix)
- **Email**: support@yofix.dev