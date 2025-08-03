# Production URL Configuration for Baseline Creation

## Overview

The `production-url` configuration has been fully implemented to enable dynamic baseline creation from production or staging environments. This allows YoFix to compare preview URLs against known-good production baselines for accurate visual regression testing.

## Configuration

### GitHub Action Input

```yaml
- uses: yofix/yofix@v1
  with:
    preview-url: https://project--pr-123-app.web.app
    production-url: https://myapp.com  # Required for visual baseline comparisons
    github-token: ${{ secrets.GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    # ... other inputs
```

> **Note**: The `production-url` input is **optional** but **required for visual baseline comparisons**. Without it, YoFix will skip baseline creation and visual regression testing.

### Environment Variable

The action automatically sets the `PRODUCTION_URL` environment variable:

```bash
INPUT_PRODUCTION-URL: ${{ inputs.production-url }}
```

## Implementation Details

### 1. Action Configuration (`action.yml`)

- Added `production-url` input with description
- Added environment variable mapping `INPUT_PRODUCTION-URL`
- Made the input optional (not required)

### 2. Type Definitions (`src/types.ts`)

- Added `productionUrl?: string` to `ActionInputs` interface

### 3. Input Parsing (`src/index.ts`)

- Added parsing of `production-url` input in `parseInputs()` function
- Added environment variable setting: `process.env.PRODUCTION_URL = inputs.productionUrl`
- Added logging when production URL is configured

### 4. Baseline Manager Integration

The `DynamicBaselineManager` behavior:

1. **Production URL Configured**: Creates baselines from the specified `production-url`
2. **No Production URL**: Skips baseline creation and visual comparisons entirely

## Usage Scenarios

### 1. Static Production URL

```yaml
production-url: https://myapp.com
```

Uses the specified production URL for all baseline creation.

### 2. Staging Environment

```yaml
production-url: https://staging.myapp.com
```

Uses staging environment as the baseline source (useful for comparing feature branches against staging).

### 3. No Configuration

If `production-url` is not provided:
- Visual baseline comparisons are skipped
- Tests will still run but without baseline validation
- Logs will clearly indicate that baseline comparisons are disabled

## Baseline Creation Flow

**When `production-url` is configured:**
1. **Route Discovery**: Routes are discovered and saved to storage via `RouteImpactAnalyzer`
2. **Baseline Check**: System checks if baselines exist for discovered routes
3. **Baseline Creation**: If missing, creates baselines from production URL
4. **Visual Comparison**: Compares preview screenshots against baselines using pixel-perfect matching

**When `production-url` is NOT configured:**
1. **Route Discovery**: Routes are still discovered for impact analysis
2. **Skip Baselines**: Baseline creation and visual comparisons are skipped
3. **Standard Testing**: Other tests (functional, accessibility) continue normally

## Benefits

- **Accurate Comparisons**: Compare against known-good production state when configured
- **Flexible Configuration**: Support both production and staging environments
- **Simple and Reliable**: No complex auto-detection that might fail
- **Performance**: Only creates missing baselines (incremental approach)
- **Clear Behavior**: Explicitly requires configuration for baseline comparisons

## Example Workflow

```yaml
name: Visual Regression Tests
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy Preview
        # ... deploy to preview URL
        
      - name: Run YoFix Visual Tests
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.preview_url }}
          production-url: https://myapp.com  # ✅ Production baseline
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          storage-provider: firebase
          firebase-credentials: ${{ secrets.FIREBASE_CREDENTIALS }}
          storage-bucket: ${{ secrets.STORAGE_BUCKET }}
```

## Configuration Notes

- The `production-url` can point to any accessible URL (production, staging, or development)
- URLs should be fully qualified (include `https://`)
- The URL should be accessible without authentication for baseline creation
- If authentication is required, consider using a staging environment that doesn't require auth