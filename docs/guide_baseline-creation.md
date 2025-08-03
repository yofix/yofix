# Dynamic Baseline Creation Guide

YoFix now supports dynamic baseline creation from production or main branch deployments. This allows you to create visual regression baselines without requiring existing baseline files.

## Overview

The baseline creation feature allows you to:
- Create baselines from production URL
- Create baselines from main branch deployments
- Automatically discover and save all application routes
- Create baselines only for missing routes
- Compare screenshots with dynamically fetched baselines

## How It Works

### 1. Route Discovery and Manifest

When YoFix analyzes your PR, it:
- Discovers all routes in your application using Tree-sitter AST parsing
- Saves a route manifest to storage (Firebase/S3)
- Uses this manifest for baseline creation

### 2. Baseline Creation Strategies

#### From Main Branch
```bash
@yofix baseline create main
```

This command:
1. Looks for the latest successful deployment of the main branch
2. Extracts the deployment URL from GitHub deployments API
3. Creates baselines by visiting each route at that URL
4. Saves screenshots to storage for future comparisons

#### From Production
```bash
@yofix baseline create production
```

This requires setting the `PRODUCTION_URL` environment variable:
```yaml
- name: Run YoFix
  uses: yofix/yofix@v1
  with:
    production-url: https://myapp.com
```

### 3. Automatic Baseline Creation

When running visual tests, YoFix will:
1. Check if baselines exist for the routes being tested
2. If no baselines exist, attempt to create them from main branch
3. If main branch creation fails, fall back to production URL
4. Save the baselines for future comparisons

## Configuration

### Environment Variables

```yaml
env:
  PRODUCTION_URL: https://myapp.com  # Your production URL
  MAIN_BRANCH_URL: https://staging.myapp.com  # Optional: explicit main branch URL
```

### GitHub Action Configuration

```yaml
- name: YoFix Visual Testing
  uses: yofix/yofix@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    firebase-credentials: ${{ secrets.FIREBASE_CREDENTIALS }}
    storage-bucket: my-project-screenshots
    production-url: https://myapp.com
    enable-dynamic-baselines: true  # Enable automatic baseline creation
```

## Bot Commands

### Create All Baselines
```bash
@yofix baseline create main
```
Creates baselines for all discovered routes from the main branch deployment.

### Create Specific Route Baselines
```bash
@yofix baseline create production /home /about /contact
```
Creates baselines only for the specified routes from production.

### Update Missing Baselines
```bash
@yofix baseline update /new-route
```
Creates baselines only for routes that don't have existing baselines.

### Check Baseline Status
```bash
@yofix baseline status
```
Shows which routes have baselines and which viewports are covered.

## Implementation Details

### Route Manifest Structure
```json
{
  "version": "1.0",
  "timestamp": 1704067200000,
  "repository": "my-app",
  "totalRoutes": 15,
  "routes": ["/", "/about", "/contact", ...],
  "routeDetails": [
    {
      "path": "/",
      "file": "src/routes/index.tsx",
      "component": "HomePage"
    },
    ...
  ]
}
```

### Baseline Storage Structure
```
baselines/
├── root_1920x1080.png
├── root_768x1024.png
├── root_375x667.png
├── about_1920x1080.png
├── about_768x1024.png
└── ...
```

## Best Practices

1. **Initial Setup**: Run `@yofix baseline create main` on your first PR to establish baselines
2. **Route Changes**: When adding new routes, baselines will be created automatically
3. **Production Fallback**: Set `PRODUCTION_URL` as a fallback when main branch deployments aren't available
4. **Viewport Coverage**: Default viewports are desktop (1920x1080), tablet (768x1024), and mobile (375x667)

## Troubleshooting

### No Baselines Found
If you see warnings about missing baselines:
1. Check that your storage provider is configured correctly
2. Run `@yofix baseline status` to see current coverage
3. Use `@yofix baseline create` to manually create baselines

### Main Branch URL Not Found
If automatic main branch detection fails:
1. Ensure your deployment creates GitHub deployment records
2. Set `MAIN_BRANCH_URL` explicitly in your workflow
3. Fall back to production URL with `PRODUCTION_URL`

### Route Discovery Issues
If routes aren't being discovered:
1. Run `@yofix cache clear` to rebuild the route analysis
2. Check that your route definitions follow common patterns (React Router, Next.js, etc.)
3. Review the route manifest in storage to verify discovered routes