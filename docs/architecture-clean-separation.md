# YoFix Clean Architecture - DRY & Single Responsibility

## Overview

YoFix follows a clean modular architecture with clear separation of concerns. Each package has a single responsibility and packages are composed to create the full workflow.

## Package Ecosystem

```
┌─────────────────────────────────────────────────────────────────┐
│                         yofix (Orchestrator)                    │
│                                                                 │
│  Coordinates the complete visual testing workflow:             │
│  1. Route Analysis  → @yofix/analyzer                          │
│  2. Screenshot Capture → @yofix/browser                        │
│  3. Storage Upload → @yofix/storage                            │
│  4. GitHub PR Reporting → Built-in                             │
└─────────────────────────────────────────────────────────────────┘
                    ↓           ↓           ↓
         ┌──────────────┐ ┌──────────┐ ┌──────────┐
         │   Analyzer   │ │ Browser  │ │ Storage  │
         │  (Routes)    │ │(Capture) │ │ (Upload) │
         └──────────────┘ └──────────┘ └──────────┘
```

---

## 1. @yofix/analyzer

**Package Location:** `/route-impact-analyzer/`

**Single Responsibility:** Analyze code changes and determine affected routes

### Features:
- LLM-powered route impact analysis
- Framework-agnostic (React, Vue, Next.js, Angular)
- Detects direct impacts, layout changes, shared components
- Smart filtering (layouts → test 1 route, direct → test all)
- Cache support (file-system based)

### API:
```typescript
import { analyzeRouteImpact } from '@yofix/analyzer'

const result = await analyzeRouteImpact({
  codebase: { path: './my-app' },
  changedFiles: ['src/components/Button.tsx'],
  options: {
    baseUrl: 'https://preview.example.com',
    llm: {
      provider: 'anthropic',
      apiKey: process.env.CLAUDE_API_KEY,
      model: 'claude-sonnet-4-5-20250929'
    },
    cache: {
      enabled: true,
      provider: 'file-system',
      forceRefresh: false
    },
    analysis: {
      includeLayouts: true,
      maxDepth: 10,
      verbose: true
    }
  }
})

// result.impacts: Array of impacted routes
// result.metadata: Framework, total files, etc.
```

### Dependencies:
- `@anthropic-ai/sdk` - Claude AI integration
- `@babel/parser` - Code parsing
- `@actions/cache` - GitHub Actions caching

---

## 2. @yofix/browser

**Package Location:** `/route-impact-browser/`

**Single Responsibility:** Browser automation and screenshot capture

### Features:
- Playwright-based browser automation
- AI-powered login flow detection (Claude)
- Multi-viewport screenshot capture
- Authentication handling
- Local file output only (no cloud storage)

### API:
```typescript
import { captureRouteScreenshots } from '@yofix/browser'

const result = await captureRouteScreenshots({
  codebase: { path: './my-app' },
  routes: ['/dashboard', '/settings'],
  baseUrl: 'https://preview.example.com',
  credentials: {
    email: 'user@example.com',
    password: 'password'
  },
  loginUrl: '/login',
  options: {
    viewports: [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' }
    ],
    llm: {
      provider: 'anthropic',
      apiKey: process.env.CLAUDE_API_KEY
    },
    auth: {
      enabled: true,
      skipLoginIfAuthenticated: false,
      cache: { enabled: true, ttl: 30 * 24 * 60 * 60 * 1000 }
    },
    browser: {
      headless: true,
      timeout: 60000,
      waitUntil: 'networkidle'
    },
    storage: {
      provider: 'local' // Always local
    }
  }
})

// result.screenshots: Array of RouteScreenshot with local file paths
// result.metadata: Timing, auth info, output directory
```

### Output Structure:
```
screenshots-{timestamp}/
├── dashboard/
│   ├── desktop.png
│   └── tablet.png
└── settings/
    ├── desktop.png
    └── tablet.png
```

### Dependencies:
- `playwright` - Browser automation
- `@anthropic-ai/sdk` - Login flow detection

---

## 3. @yofix/storage

**Package Location:** `/storage-manager/`

**Single Responsibility:** Multi-provider cloud storage operations

### Features:
- Multiple providers: Firebase, S3, GCS, Azure, GitHub Actions, Local
- Progress tracking with callbacks
- Retry logic with exponential backoff
- Batch uploads with concurrency control
- Glob pattern support
- Metadata support per file

### API:
```typescript
import { uploadFiles } from '@yofix/storage'

const result = await uploadFiles({
  storage: {
    provider: 'firebase', // or 's3', 'gcs', 'azure', 'github', 'local'
    config: {
      bucket: 'my-bucket',
      credentials: firebaseServiceAccount,
      basePath: 'pr-123/screenshots'
    }
  },
  files: [
    {
      path: './screenshots/dashboard/desktop.png',
      destination: 'dashboard/desktop.png',
      contentType: 'image/png',
      metadata: {
        route: '/dashboard',
        viewport: 'desktop',
        prNumber: '123'
      }
    }
  ],
  onProgress: (progress) => {
    console.log(`${progress.filesUploaded}/${progress.totalFiles}`)
  }
})

// result.files: Array of UploadedFile with URLs
// result.metadata: Total size, duration, provider info
```

### Providers:

#### Firebase:
```typescript
{
  provider: 'firebase',
  config: {
    bucket: 'project.appspot.com',
    credentials: serviceAccountJSON,
    basePath: 'screenshots'
  }
}
// Returns: Signed URLs (24hr expiry)
```

#### S3:
```typescript
{
  provider: 's3',
  config: {
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: 'AKIA...',
    secretAccessKey: 'secret',
    basePath: 'screenshots',
    acl: 'public-read'
  }
}
// Returns: Public S3 URLs
```

### Dependencies:
- `firebase-admin` - Firebase Storage
- `@aws-sdk/client-s3` - AWS S3
- `@actions/artifact` - GitHub Actions

---

## 4. yofix (Orchestrator)

**Package Location:** `/yofix/`

**Single Responsibility:** Orchestrate the complete visual testing workflow

### Architecture Layers:

```
src/
├── index.ts                              # Main orchestrator
├── core/
│   ├── screenshot/
│   │   └── BrowserScreenshotCapture.ts   # @yofix/browser wrapper
│   ├── storage/
│   │   └── StorageUploader.ts            # @yofix/storage wrapper (DRY)
│   ├── analysis/
│   │   └── ThirdPartyRouteImpactAnalyzer.ts  # @yofix/analyzer wrapper
│   └── github/
│       └── GitHubCommentEngine.ts        # PR reporting
└── types.ts                              # Shared types
```

### Workflow:

```typescript
// src/index.ts (simplified)

import { analyzeRoutesWithExternalTool } from './core/analysis/ThirdPartyRouteImpactAnalyzer'
import { captureScreenshotsWithBrowser } from './core/screenshot/BrowserScreenshotCapture'
import { uploadScreenshots, mapStorageUrlsToScreenshots } from './core/storage/StorageUploader'

async function runVisualTesting() {
  // Step 1: Analyze route impact
  const routeAnalysis = await analyzeRoutesWithExternalTool(prFiles, previewUrl)
  const affectedRoutes = routeAnalysis.routes

  // Step 2: Capture screenshots (local files)
  const captureResult = await captureScreenshotsWithBrowser({
    routes: affectedRoutes,
    baseUrl: previewUrl,
    viewports,
    credentials: { email, password },
    loginUrl
  })

  // Step 3: Upload to cloud storage
  const uploadResult = await uploadScreenshots({
    screenshots: captureResult.screenshots,
    outputDirectory: captureResult.outputDirectory,
    prNumber,
    storageProvider: 'firebase' // or 's3'
  })

  // Step 4: Map URLs back to screenshots
  const screenshotsWithUrls = mapStorageUrlsToScreenshots(
    captureResult.screenshots,
    uploadResult.uploadedFiles
  )

  // Step 5: Post to GitHub PR
  await githubService.createComment(createPRComment(screenshotsWithUrls))
}
```

---

## DRY Principles Applied

### 1. Storage Configuration (Single Source of Truth)

**Before (Duplicated):**
- `ThirdPartyRouteImpactAnalyzer.ts` had Firebase config
- `BrowserScreenshotCapture.ts` had Firebase config
- `index.ts` had Firebase upload logic

**After (DRY):**
- `StorageUploader.ts` contains all storage config logic
- Single function: `prepareStorageConfig(provider, prNumber)`
- Reused everywhere

### 2. File Flattening (DRY Helper)

**Before:** Each module flattened screenshots differently

**After:** Single function in `StorageUploader.ts`:
```typescript
flattenScreenshotsToFiles(screenshots: RouteScreenshot[])
```

### 3. URL Mapping (DRY Helper)

**Before:** Manual mapping in multiple places

**After:** Single function:
```typescript
mapStorageUrlsToScreenshots(screenshots, uploadedFiles)
```

### 4. Format Utilities (DRY)

Centralized in `StorageUploader.ts`:
- `formatBytes(bytes: number)`
- `formatDuration(ms: number)`
- `getTotalFileCount(screenshots)`

---

## Single Responsibility Adherence

### Package Level:
✅ **@yofix/analyzer** - Route analysis ONLY
✅ **@yofix/browser** - Browser automation ONLY
✅ **@yofix/storage** - Storage operations ONLY
✅ **yofix** - Workflow orchestration ONLY

### Module Level:
✅ **BrowserScreenshotCapture.ts** - Wraps @yofix/browser, no storage logic
✅ **StorageUploader.ts** - Wraps @yofix/storage, no browser logic
✅ **ThirdPartyRouteImpactAnalyzer.ts** - Wraps @yofix/analyzer, no capture logic

### Function Level:
✅ Each function does ONE thing:
- `captureScreenshotsWithBrowser()` - Capture only
- `uploadScreenshots()` - Upload only
- `mapStorageUrlsToScreenshots()` - Mapping only
- `prepareStorageConfig()` - Config only

---

## Benefits

### 1. Maintainability
- Changes to storage don't affect browser code
- Changes to browser don't affect analyzer
- Clear boundaries = easier debugging

### 2. Testability
- Mock @yofix/browser without storage complexity
- Test storage without browser setup
- Unit test each module independently

### 3. Reusability
- @yofix/browser can be used in other projects
- @yofix/storage is framework-agnostic
- @yofix/analyzer works standalone

### 4. Bundle Size
- Each package stays small
- No unnecessary dependencies
- Faster builds and deploys

### 5. Developer Experience
- Clear API boundaries
- Easy to understand data flow
- Self-documenting code

---

## Migration from Old Architecture

### What Changed:

**Removed from @yofix/browser:**
- ❌ Firebase storage logic
- ❌ S3 storage logic
- ❌ `storageUrl` field from output types
- ❌ Storage provider enums (firebase, s3)

**Added to yofix:**
- ✅ `StorageUploader.ts` module
- ✅ Clear separation of capture and upload
- ✅ DRY helper functions

**Renamed Packages:**
- `route-impact-analyzer` → `@yofix/analyzer`
- `storage-manager` → `@yofix/storage`
- `route-impact-browser` → `@yofix/browser`

---

## Testing Strategy

### Unit Tests:
```bash
# Test browser automation independently
cd route-impact-browser && npm test

# Test storage independently
cd storage-manager && npm test

# Test analyzer independently
cd route-impact-analyzer && npm test
```

### Integration Tests (yofix):
```bash
# Test complete workflow
cd yofix && yarn test:local
```

---

## Future Extensions

### Adding New Storage Provider:
1. Add provider to `@yofix/storage` (e.g., Azure)
2. No changes needed in `@yofix/browser`
3. Update `StorageUploader.prepareStorageConfig()`
4. Done!

### Adding New Browser Feature:
1. Add feature to `@yofix/browser`
2. No changes needed in `@yofix/storage`
3. Update `BrowserScreenshotCapture` wrapper if needed
4. Done!

### Adding New Framework Support:
1. Add framework to `@yofix/analyzer`
2. No changes needed in other packages
3. Done!

---

## Dependencies Graph

```
yofix
  ├── @yofix/analyzer (route analysis)
  ├── @yofix/browser (screenshot capture)
  ├── @yofix/storage (cloud upload)
  ├── @actions/core (GitHub Actions)
  ├── @actions/github (GitHub API)
  └── firebase-admin (baseline storage)

@yofix/browser
  ├── playwright (browser automation)
  └── @anthropic-ai/sdk (login detection)

@yofix/analyzer
  ├── @anthropic-ai/sdk (LLM analysis)
  ├── @babel/parser (code parsing)
  └── fast-glob (file matching)

@yofix/storage
  ├── firebase-admin (Firebase)
  ├── @aws-sdk/client-s3 (S3)
  ├── @actions/artifact (GitHub)
  └── glob (pattern matching)
```

---

## Summary

This architecture follows **SOLID principles**:
- **S**ingle Responsibility: Each package does ONE thing
- **O**pen/Closed: Easy to extend (new providers), hard to modify
- **L**iskov Substitution: Providers are interchangeable
- **I**nterface Segregation: Clean, minimal APIs
- **D**ependency Inversion: Depend on abstractions (@yofix/* packages)

**Result:** Clean, maintainable, testable, and scalable codebase! 🎉
