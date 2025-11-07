# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YoFix is an AI-powered visual testing GitHub Action for web applications. It uses a **distributed package architecture** with step-based workflow execution to automatically test websites, detect visual regressions, and provide detailed PR reports.

**Core Capabilities:**
- Visual regression testing with baseline comparison
- Route impact analysis using AI
- Screenshot capture with smart authentication
- Pixel-level diff generation with perceptual metrics
- Cloud storage for baselines and screenshots (Firebase/S3/GitHub)
- GitHub PR integration with detailed reporting

**Production-Ready Features:**
- ✅ Step-based GitHub Action workflow
- ✅ AI-powered route impact analysis (@yofix/analyzer)
- ✅ Smart browser automation (@yofix/browser)
- ✅ Advanced baseline comparison (@yofix/comparator)
- ✅ Multi-provider cloud storage (@yofix/storage)
- ✅ Production baseline auto-creation
- ✅ GitHub PR integration and reporting

## Distributed Package Architecture

YoFix uses a **modular package architecture** where major functionality is externalized into independent npm packages:

### External Packages

**[@yofix/analyzer](../analyzer/)** - AI-powered route impact analysis
- Uses Claude AI to analyze changed files in PRs
- Builds dependency graphs and determines affected routes
- Smart filtering (layout changes vs. direct impacts)
- Caching support with GitHub Actions cache

**[@yofix/browser](../browser/)** - Intelligent screenshot capture
- Playwright-based browser automation
- AI-powered authentication (LLM understands any login form)
- Multi-viewport screenshot capture
- Session management (shared vs. independent agents)

**[@yofix/comparator](../comparator/)** - Advanced baseline comparison
- Pixel-level image comparison with configurable thresholds
- Perceptual hashing (pHash) for structural similarity
- Multiple metrics: MSE, PSNR, SSIM, pixel difference
- Side-by-side diff generation (Baseline | Diff | Current)
- Diff region detection with severity levels
- Parallel processing support

**[@yofix/storage](../storage-manager/)** - Multi-provider cloud storage
- Provider abstraction: Firebase, S3, Local, GitHub
- Upload/download operations with metadata
- Public URL generation
- Progress tracking and error handling

### Package Locations

```
/Users/hari/2025/lp/
├── yofix/                    # Main GitHub Action (this repository)
├── analyzer/                 # @yofix/analyzer package
├── browser/                  # @yofix/browser package
├── comparator/               # @yofix/comparator package
└── storage-manager/          # @yofix/storage package
```

All packages use `npm link` during development for local testing.

## Essential Commands

### Development
```bash
# Install dependencies
npm install

# Build the project (esbuild bundling of steps)
npm run build

# Type checking
npm run typecheck

# Run tests
npm test

# Linting
npm run lint
npm run lint:fix

# Clean build artifacts
npm run clean
```

### Release Process
```bash
# Create a new release (prompts for version)
npm run release

# Specific version releases
npm run release:patch  # 1.0.0 -> 1.0.1
npm run release:minor  # 1.0.0 -> 1.1.0
npm run release:major  # 1.0.0 -> 2.0.0

# Pre-release versions
npm run release:alpha
npm run release:dev
```

## Architecture & Key Components

### Step-Based Workflow

YoFix uses a **step-based architecture** where each step is a self-contained, bundled module:

```
dist/steps/
├── 0-initialize.step.js         # Initialize workflow, validate inputs
├── 1-analyze-routes.step.js     # Find affected routes (@yofix/analyzer)
├── 2-browse-routes.step.js      # Capture screenshots (@yofix/browser)
├── 2.5-compare-baselines.step.js # Compare with baselines (@yofix/comparator)
├── 3-upload-storage.step.js     # Upload to cloud storage (@yofix/storage)
├── 4-post-results.step.js       # Post GitHub PR comment
└── 5-update-baselines.step.js   # Update baselines on merge
```

**Step Data Flow:**
- Each step reads from `step-data.json` (shared state)
- Performs its operation
- Writes updated state back to `step-data.json`
- Next step continues from updated state

### Core Directory Structure

```
src/
├── steps/                      # Step implementations
│   ├── 0-initialize.step.ts
│   ├── 1-analyze-routes.step.ts
│   ├── 2-browse-routes.step.ts
│   ├── 2.5-compare-baselines.step.ts
│   ├── 3-upload-storage.step.ts
│   ├── 4-post-results.step.ts
│   ├── 5-update-baselines.step.ts
│   └── shared/
│       └── StepDataManager.ts  # Shared state management
├── core/                       # Core utilities
│   ├── config/
│   │   └── ConfigurationManager.ts
│   ├── screenshot/
│   │   └── BrowserScreenshotCapture.ts
│   └── index.ts
└── github/                     # GitHub integration
    ├── PRReporter.ts
    └── types.ts
```

**Removed Components** (cleaned up):
- ❌ CLI (`src/cli/`) - Completely removed, redundant to GitHub Action
- ❌ Cache infrastructure (`CacheManager`, `GitHubCacheManager`)
- ❌ Unused directories: `modules/`, `monitoring/`, `optimization/`, `baseline/`, `core/setup/`
- ❌ Dependencies: `chalk`, `commander`, `ioredis`

### Key Design Patterns

1. **External Package Pattern**: Major features externalized to independent packages
2. **Step-Based Pipeline**: Sequential workflow with shared state
3. **Provider Pattern**: Swappable storage backends (Firebase/S3/Local/GitHub)
4. **Factory Pattern**: StorageFactory for provider instantiation
5. **Centralized Configuration**: ConfigurationManager with smart defaults

## Configuration

### Action Configuration (`action.yml`)

**Required Inputs:**
- `preview-url`: Deployed preview URL to test
- `github-token`: GitHub token for PR comments
- `claude-api-key`: Claude API key for route analysis
- `claude-model`: Claude model (e.g., `claude-sonnet-4-5-20250929`)

**Baseline Configuration:**
- `production-url`: Production URL for auto-creating baselines from live site
- `comparison-threshold`: Pixel difference threshold (0-1, default: 0.01 = 1%)

**Storage Configuration:**
- `storage-provider`: `firebase`, `s3`, or `github` (default: `firebase`)
- `firebase-credentials`: Base64 encoded Firebase service account JSON
- `storage-bucket`: Firebase Storage bucket name
- `s3-bucket`: AWS S3 bucket name
- `aws-region`: AWS region (default: `us-east-1`)
- `aws-access-key-id`: AWS access key
- `aws-secret-access-key`: AWS secret key

**Testing Configuration:**
- `viewports`: Comma-separated viewport sizes (default: `1920x1080,768x1024,375x667`)
- `max-routes`: Maximum routes to test (default: `10`)
- `test-timeout`: Test timeout (default: `5m`)

**Authentication:**
- `auth-email`: Email for authentication
- `auth-password`: Password for authentication
- `auth-login-url`: Login page URL (default: `/login`)

**Advanced:**
- `clear-cache`: Clear route analysis cache (default: `false`)
- `update-baselines-on-merge`: Update baselines after merge (tuple format: `["branch", "enabled"]`)
- `cleanup-days`: Days to keep old screenshots (default: `30`)

### Environment Variables

**GitHub Actions:**
```bash
INPUT_PREVIEW-URL=https://preview.example.com
INPUT_GITHUB-TOKEN=${{ secrets.GITHUB_TOKEN }}
INPUT_CLAUDE-API-KEY=${{ secrets.CLAUDE_API_KEY }}
INPUT_CLAUDE-MODEL=claude-sonnet-4-5-20250929
INPUT_PRODUCTION-URL=https://example.com
INPUT_STORAGE-PROVIDER=firebase
INPUT_FIREBASE-CREDENTIALS=${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
INPUT_STORAGE-BUCKET=my-app-screenshots
```

**Local Development:**
```bash
# Uses smart defaults - no configuration required!
npm test  # Works immediately

# Override defaults when needed
export GITHUB_TOKEN=ghp_your_token
export CLAUDE_API_KEY=your_key
npm test
```

## Key Workflows

### Main Visual Testing Flow

1. **Step 0: Initialize** (`0-initialize.step.js`)
   - Validate all inputs
   - Extract PR context (owner, repo, PR number)
   - Initialize step data state
   - Log configuration

2. **Step 1: Analyze Routes** (`1-analyze-routes.step.js`)
   - Uses `@yofix/analyzer` package
   - Analyzes changed files in PR
   - Builds dependency graph
   - Returns affected routes with impact levels
   - Supports caching via GitHub Actions cache

3. **Step 2: Browse Routes** (`2-browse-routes.step.js`)
   - Uses `@yofix/browser` package
   - Captures screenshots across viewports
   - Handles authentication automatically (AI-powered or selectors)
   - Saves screenshots to temporary directory

4. **Step 2.5: Compare Baselines** (`2.5-compare-baselines.step.js`)
   - Uses `@yofix/comparator` package
   - Downloads baselines from storage using `@yofix/storage`
   - **Auto-creates baselines from production-url if none exist**
   - Performs pixel-level comparison with perceptual metrics
   - Generates side-by-side diff images (Baseline | Diff | Current)
   - Detects diff regions with severity levels
   - Returns comparison results with metrics

5. **Step 3: Upload Storage** (`3-upload-storage.step.js`)
   - Uses `@yofix/storage` package
   - Uploads screenshots to cloud storage (Firebase/S3/GitHub)
   - Uploads diff images
   - Generates public URLs for PR display

6. **Step 4: Post Results** (`4-post-results.step.js`)
   - Formats comparison results as markdown
   - Posts GitHub PR comment with:
     - Summary of changes (new/unchanged/changed screenshots)
     - Diff images with side-by-side view
     - Baseline URLs for reference
     - Metrics (similarity, PSNR, pixel difference, etc.)
   - Updates existing comment if present

7. **Step 5: Update Baselines** (`5-update-baselines.step.js`)
   - Runs on PR merge (optional)
   - Updates production baselines with PR screenshots
   - Only runs if `update-baselines-on-merge` is enabled

### Baseline Comparison Details

**Baseline Lookup:**
1. Check if baseline exists in storage (`baselines/{route}_{viewport}.png`)
2. If not found and `production-url` configured:
   - Capture screenshot from production URL
   - Use same auth credentials as preview
   - Upload as baseline
   - Compare with preview screenshot
3. If not found and no `production-url`:
   - Mark screenshot as "NEW"
   - Skip comparison

**Comparison Metrics:**
- **Similarity**: Overall similarity percentage (0-100%)
- **Pixel Difference**: Number of different pixels
- **Diff Percentage**: Percentage of pixels different
- **PSNR**: Peak Signal-to-Noise Ratio (dB) - higher is better
- **Perceptual Hash**: Hamming distance for structural similarity
- **MSE**: Mean Squared Error
- **Diff Regions**: Areas of change with severity (critical/moderate)

## External Package Integration

### Using @yofix/analyzer

```typescript
import { analyzeRouteImpact } from '@yofix/analyzer';

const result = await analyzeRouteImpact({
  repoPath: '/path/to/repo',
  changedFiles: ['src/components/Header.tsx'],
  options: {
    claudeApiKey: process.env.CLAUDE_API_KEY,
    claudeModel: 'claude-sonnet-4-5-20250929',
    verbose: true
  }
});

// result.impactedRoutes: string[]
// result.metadata: { duration, filesAnalyzed, etc. }
```

### Using @yofix/browser

```typescript
import { captureScreenshotsWithBrowser } from '@yofix/browser';

const result = await captureScreenshotsWithBrowser({
  routes: ['/home', '/dashboard'],
  baseUrl: 'https://example.com',
  viewports: [
    { width: 1920, height: 1080, name: '1920x1080' },
    { width: 768, height: 1024, name: '768x1024' }
  ],
  credentials: { email: 'user@example.com', password: 'pass' },
  loginUrl: '/login',
  verbose: true
});

// result.screenshots: Array<{ route, screenshots: Array<{ path, width, height }> }>
```

### Using @yofix/comparator

```typescript
import { compareBaselines } from '@yofix/comparator';

const result = await compareBaselines({
  comparisons: [
    {
      route: '/home',
      viewport: '1920x1080',
      current: currentBuffer,
      baseline: baselineBuffer
    }
  ],
  options: {
    threshold: 0.01, // 1% difference threshold
    diffFormat: 'side-by-side',
    parallel: { enabled: true, concurrency: 3 },
    generateHash: true,
    detectRegions: true,
    verbose: true
  }
});

// result.comparisons: Array<{ route, viewport, match, diffPercentage, similarity, metrics, diff }>
```

### Using @yofix/storage

```typescript
import { uploadFiles, downloadFiles } from '@yofix/storage';

// Upload
const uploadResult = await uploadFiles({
  storage: {
    provider: 'firebase',
    config: {
      bucket: 'my-bucket',
      credentials: 'base64-encoded-credentials'
    }
  },
  files: [
    {
      path: '/local/screenshot.png',
      destination: 'pr-123/home_1920x1080.png',
      contentType: 'image/png',
      metadata: { route: '/home', viewport: '1920x1080' }
    }
  ]
});

// Download
const downloadResult = await downloadFiles({
  storage: {
    provider: 'firebase',
    config: {
      bucket: 'my-bucket',
      credentials: 'base64-encoded-credentials'
    }
  },
  files: ['baselines/home_1920x1080.png']
});

// downloadResult.files: Array<{ remotePath, buffer, url, size, contentType }>
```

## Testing

### Unit Tests
- Framework: Jest with ts-jest
- Location: `__tests__` folders or `*.test.ts` files
- Run: `npm test`
- Configuration: `jest.config.js`

### Integration Testing
```bash
# Test storage integration
npm run test:storage

# Test browser agent
npm run test:browser-agent

# Test full integration
npm run test:integration
```

### Local Testing with GitHub Actions
```bash
# Use `act` to run GitHub Actions locally
npm run test:action
```

## Build System

### esbuild Configuration

Each step is bundled independently with esbuild:

```bash
esbuild src/steps/0-initialize.step.ts \
  --bundle \
  --platform=node \
  --target=node16 \
  --outfile=dist/steps/0-initialize.step.js \
  --external:sharp \
  --external:playwright \
  --external:firebase-admin \
  --external:@google-cloud/firestore \
  --external:@yofix/analyzer \
  --external:@yofix/browser \
  --external:@yofix/comparator \
  --external:@yofix/storage \
  --format=cjs \
  --sourcemap
```

**External Dependencies:** Large packages are externalized and installed separately:
- `sharp` - Image processing
- `playwright` - Browser automation
- `firebase-admin` - Firebase SDK
- `@yofix/*` - YoFix packages

**Bundle Sizes:** Each step ~1.1MB bundled

## Recent Changes (2025-01)

### Major Architecture Changes

**Distributed Package System:**
- ✅ Created `@yofix/analyzer` - AI route impact analysis
- ✅ Created `@yofix/browser` - Screenshot capture with auth
- ✅ Created `@yofix/comparator` - Baseline comparison with perceptual metrics
- ✅ Created `@yofix/storage` - Multi-provider cloud storage (Firebase/S3/Local/GitHub)

**Step-Based Workflow:**
- ✅ Migrated from monolithic `src/index.ts` to 7 independent steps
- ✅ Shared state via `step-data.json` with StepDataManager
- ✅ Each step is self-contained and independently bundled

**Baseline Comparison Enhancements:**
- ✅ Added Step 2.5 for baseline comparison
- ✅ Production baseline auto-creation from `production-url`
- ✅ Authentication support for production captures
- ✅ Side-by-side diff generation (Baseline | Diff | Current)
- ✅ Advanced metrics: PSNR, MSE, perceptual hash, diff regions
- ✅ Baseline URL display in PR comments

### Code Cleanup (2025-01)

**Removed Components (~260KB source):**
- ❌ Entire CLI infrastructure (`src/cli/`, `bin` field, `build:cli`)
- ❌ Cache infrastructure (`CacheManager`, `GitHubCacheManager`, `GitHubCacheManager.ts`)
- ❌ Unused directories:
  - `src/modules/` - auth-strategies, llm-browser-agent (36KB)
  - `src/monitoring/` - AuthMetrics (8KB)
  - `src/optimization/` - ImageOptimizer, CacheManager (52KB)
  - `src/core/baseline/` - Old baseline manager (36KB)
  - `src/core/setup/` - RepositoryLearner, PatternStore (52KB)
  - `src/github/examples/` - Cache examples

**Removed Dependencies:**
- ❌ `chalk` - CLI formatting
- ❌ `commander` - CLI framework
- ❌ `ioredis` - Redis cache client

**Removed Action Inputs:**
- ❌ `test-routes` - Never used
- ❌ `redis-url` - Cache removed
- ❌ `cache-ttl` - Cache removed
- ❌ `firebase-target` - Auto-detected

### Download Support Added

**@yofix/storage enhancements:**
- ✅ Added `downloadFile()` and `downloadFiles()` methods
- ✅ Implemented across all providers (Local, Firebase, S3, GitHub)
- ✅ Returns buffer + public URL from storage
- ✅ Used in Step 2.5 for baseline retrieval

## Development Notes

### TypeScript
- Target: ES2020
- Module: CommonJS (for Node.js compatibility)
- Strict mode: DISABLED (allows gradual typing)
- Use type annotations where helpful

### Error Handling
- Use try/catch in all step functions
- Log errors with `core.error()` from `@actions/core`
- Include context in error messages
- Graceful degradation for non-critical features

### Logging
- Use `@actions/core` logging methods:
  - `core.info()` - General information
  - `core.warning()` - Warnings that don't fail the step
  - `core.error()` - Errors that should be visible
  - `core.debug()` - Verbose debugging (only in debug mode)
- Include emojis for better readability (🔍, 📸, ✅, ❌, ⚠️)

### Code Organization
- Use two-dot file naming: `auth.store.ts`, `common.util.ts`
- Save markdown documentation in `/docs` folder
- Don't create documentation unless asked
- Prefer console output over markdown files

### Working with External Packages

**Local Development (npm link):**
```bash
# In each package directory
cd /Users/hari/2025/lp/analyzer && npm link
cd /Users/hari/2025/lp/browser && npm link
cd /Users/hari/2025/lp/comparator && npm link
cd /Users/hari/2025/lp/storage-manager && npm link

# In yofix directory
cd /Users/hari/2025/lp/yofix
npm link @yofix/analyzer @yofix/browser @yofix/comparator @yofix/storage
```

**Package Updates:**
1. Make changes in package directory
2. Build package: `npm run build`
3. Changes automatically reflected in yofix (via symlink)
4. Test in yofix: `npm test` or `npm run build`

## Common Development Tasks

### Adding a New Step

1. Create step file: `src/steps/X-step-name.step.ts`
2. Implement step function with StepDataManager:
```typescript
export async function myNewStep(stepData: StepData): Promise<StepData> {
  return executeStep('My New Step', async () => {
    // Your logic here
    return {
      ...stepData,
      newField: 'value'
    };
  });
}
```
3. Add to build script in `package.json`
4. Add to workflow in `action.yml`

### Adding a New Storage Provider

1. Update `@yofix/storage` package
2. Create provider: `src/providers/my-provider.provider.ts`
3. Implement `IStorageProvider` interface
4. Add to `ProviderFactory.ts`
5. Build and link package

### Debugging

**Local Debugging:**
```bash
# Enable debug logs
export RUNNER_DEBUG=1

# Run specific step
node dist/steps/2.5-compare-baselines.step.js
```

**GitHub Actions Debugging:**
1. Enable debug logging in workflow
2. Check step outputs in GitHub Actions UI
3. Review `step-data.json` artifact
4. Use `core.debug()` for verbose logging

### Working with Baselines

**Create initial baselines:**
1. Set `production-url` in action inputs
2. Run action - baselines auto-created from production
3. Future runs compare against these baselines

**Update baselines:**
1. Enable `update-baselines-on-merge: ["main", "true"]`
2. Merge PR - baselines automatically updated

**Manual baseline management:**
- Baselines stored in: `baselines/{route}_{viewport}.png`
- Use storage provider's console to view/delete
- Can manually upload baselines via storage SDK

## Current Limitations

1. **Baseline Storage**: Requires cloud storage (Firebase/S3/GitHub)
2. **Authentication**: AI-powered auth is experimental, selectors more reliable
3. **Test Coverage**: Limited unit test coverage for steps
4. **Browser Support**: Only Chromium (via Playwright)
5. **Image Formats**: Only PNG screenshots supported

## Contribution Guidelines

When adding new features:
1. Follow step-based architecture patterns
2. Use external packages for major features
3. Add tests for new functionality
4. Update this documentation
5. Consider bundle size impact
6. Use centralized configuration (ConfigurationManager)
7. Implement proper error handling with context

## Support

- **Issues**: https://github.com/yofix/yofix/issues
- **Documentation**: `/docs` folder
- **Package Repositories**:
  - @yofix/analyzer: https://github.com/yofix/analyzer
  - @yofix/browser: https://github.com/yofix/browser
  - @yofix/comparator: https://github.com/yofix/comparator
  - @yofix/storage: https://github.com/yofix/storage
