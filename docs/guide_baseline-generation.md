# Baseline Screenshot Generation Guide

This guide explains how to generate baseline screenshots for visual regression testing using YoFix.

## Overview

YoFix provides a dedicated workflow for generating baseline screenshots from your production or staging environment. These baselines serve as reference images for visual regression testing in pull requests.

## GitHub Action Workflow

The baseline generation workflow can be triggered manually through GitHub Actions using the "Run workflow" button.

### Configuration

The workflow accepts the following inputs:

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `production-url` | Production URL to capture baselines from | Yes | https://example.com |
| `test-routes` | Comma-separated list of routes to capture | No | - |
| `enable-ai-navigation` | Enable AI-powered route discovery when test-routes is empty | No | false |
| `max-routes` | Maximum number of routes when using AI discovery | No | 10 |
| `viewports` | Viewport sizes for screenshots | No | 1920x1080,768x1024,375x667 |
| `storage-provider` | Where to store baselines (firebase, s3, github) | No | firebase |
| `auth-email` | Email for authentication (if app requires login) | No | - |
| `auth-password` | Password for authentication (if app requires login) | No | - |
| `auth-login-url` | Login page URL path | No | /login/password |
| `auth-mode` | Authentication mode: llm, selectors, or smart | No | llm |

**Notes:**
- If no `test-routes` are provided and `enable-ai-navigation` is false, only the homepage (/) will be captured
- When `enable-ai-navigation` is true and no routes specified, AI will discover routes automatically
- Authentication is automatically enabled when both `auth-email` and `auth-password` are provided

### Running the Workflow

1. Go to your repository's Actions tab
2. Select "Generate Baseline Screenshots" workflow
3. Click "Run workflow"
4. Fill in the required inputs:
   - Set your production URL
   - Specify routes to capture (e.g., `/,/about,/products`)
   - Configure authentication if needed
5. Click "Run workflow" button

### Example Usage

#### Basic Usage - Single Route
```yaml
production-url: https://example.com
test-routes: /
```

#### Multiple Specific Routes
```yaml
production-url: https://example.com
test-routes: /,/dashboard,/settings,/profile
```

#### AI-Powered Route Discovery
```yaml
production-url: https://example.com
enable-ai-navigation: true
max-routes: 15
# No test-routes specified - AI will discover them
```

#### With Authentication
```yaml
production-url: https://example.com
test-routes: /,/dashboard,/settings
auth-email: test@example.com
auth-password: ${{ secrets.TEST_PASSWORD }}
auth-login-url: /login
auth-mode: llm
```

#### Combined: AI Discovery + Authentication
```yaml
production-url: https://example.com
enable-ai-navigation: true
max-routes: 20
auth-email: test@example.com
auth-password: ${{ secrets.TEST_PASSWORD }}
# AI will login first, then discover protected routes
```

## Storage Configuration

### Firebase Storage (Default)
Ensure these secrets are configured:
- `FIREBASE_CREDENTIALS` - Base64 encoded service account JSON
- `FIREBASE_BUCKET` - Storage bucket name

### AWS S3 Storage
Configure these secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET`

### GitHub Artifacts
If external storage is not configured, baselines are saved as GitHub artifacts.

## Baseline Naming Convention

Screenshots are saved with the following naming pattern:
```
{route}_{width}x{height}.png
```

Examples:
- `root_1920x1080.png` - Homepage at desktop viewport
- `dashboard_768x1024.png` - Dashboard at tablet viewport
- `settings_375x667.png` - Settings at mobile viewport

Routes with slashes are sanitized:
- `/` becomes `root`
- `/user/profile` becomes `user_profile`

## Workflow Outputs

The workflow provides the following outputs:
- `baseline-count` - Number of screenshots generated
- `baseline-files` - JSON array of generated file names
- `baseline-routes` - JSON array of captured routes

## Best Practices

1. **Initial Setup**: Run baseline generation on your main branch before implementing visual testing
2. **Regular Updates**: Regenerate baselines when making intentional visual changes
3. **Route Selection**: Start with critical user-facing routes
4. **Viewport Coverage**: Include desktop, tablet, and mobile viewports
5. **Storage**: Use cloud storage (Firebase/S3) for better performance

## Troubleshooting

### Routes Not Captured
If routes fail to capture:
1. Ensure all routes in `test-routes` are valid and accessible
2. Check that the production URL is reachable
3. Verify authentication if the routes require login

### Authentication Issues
For sites requiring login:
1. Provide both `auth-email` and `auth-password`
2. Set the correct `auth-login-url` if different from default
3. Choose appropriate `auth-mode` (llm for AI-powered, selectors for CSS-based)
4. The system will automatically handle the login flow

### Storage Upload Failures
If baselines aren't uploading:
1. Verify storage credentials are configured
2. Check bucket permissions
3. Baselines will fallback to GitHub artifacts

## Integration with Visual Testing

Once baselines are generated, they're automatically used in PR visual testing:

1. When a PR is created, YoFix captures screenshots of the preview URL
2. Screenshots are compared against the baselines
3. Visual differences are reported as PR comments
4. Failed visual tests can block PR merging

## Advanced Configuration

### Custom Viewport Sizes
```yaml
viewports: 1440x900,1024x768,414x896,390x844
```

### Selective Route Updates
Update only specific routes while keeping others:
```yaml
test-routes: /checkout,/payment
# Only these routes will be updated
```

### Multiple Environment Support
You can maintain baselines for different environments by using different storage paths or buckets for staging vs production.

## Example Workflow File

Here's the complete workflow file (`.github/workflows/generate-baseline.yml`):

```yaml
name: Generate Baseline Screenshots

on:
  workflow_dispatch:
    inputs:
      production-url:
        description: 'Production URL to capture baselines from'
        required: true
        type: string
        default: 'https://example.com'
      test-routes:
        description: 'Comma-separated routes to capture'
        required: true
        type: string
        default: '/'
      viewports:
        description: 'Viewport sizes'
        required: false
        default: '1920x1080,768x1024,375x667'
        type: string
      auth-email:
        description: 'Email for authentication'
        required: false
        type: string
      auth-password:
        description: 'Password for authentication'
        required: false
        type: string

jobs:
  generate-baselines:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./
        with:
          preview-url: ${{ inputs.production-url }}
          production-url: ${{ inputs.production-url }}
          mode: baseline-generation
          test-routes: ${{ inputs.test-routes }}
          viewports: ${{ inputs.viewports }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          storage-provider: firebase
          firebase-credentials: ${{ secrets.FIREBASE_CREDENTIALS }}
          storage-bucket: ${{ secrets.FIREBASE_BUCKET }}
          auth-email: ${{ inputs.auth-email }}
          auth-password: ${{ inputs.auth-password }}
```

## Summary

The baseline generation workflow provides a simple, automated way to create reference screenshots for visual regression testing. By running this workflow periodically or after major visual updates, you ensure your visual tests have accurate baselines for comparison.