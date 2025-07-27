# YoFix Example Workflows

This directory contains example GitHub Actions workflows demonstrating various YoFix configurations.

## Examples

### 1. Basic Usage (`basic.yml`)
Simple setup with Vercel deployment and Firebase storage.

### 2. With Authentication (`with-authentication.yml`)
Testing protected routes that require login.

### 3. Advanced Configuration (`advanced-configuration.yml`)
- AWS S3 storage
- Custom viewports
- Redis caching
- Extended timeouts

### 4. Conditional Testing (`conditional-testing.yml`)
- Only runs when UI files change
- Skips when `skip-visual-test` label is present
- Uses path filters

### 5. Matrix Testing (`matrix-testing.yml`)
Tests different viewport groups in parallel.

## Quick Start

1. Copy the example that matches your needs
2. Replace the secrets with your own:
   - `CLAUDE_API_KEY` - Get from [console.anthropic.com](https://console.anthropic.com)
   - `FIREBASE_SERVICE_ACCOUNT` - Base64 encoded service account JSON
   - Deployment platform credentials (Vercel, Netlify, etc.)

3. Customize the configuration as needed

## Common Patterns

### Skip visual tests for certain PRs
Add a `skip-visual-test` label to the PR.

### Test only specific routes
Use bot commands:
```
@yofix test /dashboard and /profile
```

### Update baselines
```
@yofix update baseline
```

### Fix specific issues
```
@yofix fix the mobile menu overlap
```