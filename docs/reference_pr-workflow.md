# YoFix Pull Request Workflow Reference

> **Last Updated**: 2025-10-30
> **Version**: 1.0.11+

This document provides a comprehensive reference for understanding how YoFix processes GitHub Pull Requests, including detailed execution flow, file mappings, and annotated diagrams.

---

## Table of Contents

1. [Overview](#overview)
2. [Trigger Configuration](#trigger-configuration)
3. [Complete Execution Flow](#complete-execution-flow)
4. [Architecture Diagrams](#architecture-diagrams)
5. [Key Files and Responsibilities](#key-files-and-responsibilities)
6. [Data Flow](#data-flow)
7. [Bot Command Workflow](#bot-command-workflow)
8. [Testing Deep Dive](#testing-deep-dive)

---

## Overview

YoFix is an AI-powered visual testing tool that automatically runs when a Pull Request is created or updated on GitHub. It:

1. **Analyzes** which routes are affected by code changes
2. **Tests** those routes visually using Playwright
3. **Compares** screenshots against baseline images
4. **Reports** results directly in the PR with visual diffs
5. **Responds** to bot commands for on-demand testing

**Key Workflow Characteristics:**
- Smart route detection using Tree-sitter AST parsing
- Hybrid testing (LLM for authentication, deterministic for screenshots)
- Automatic baseline creation and management
- Pixel-by-pixel visual regression detection
- Rich PR comments with side-by-side comparisons
- Interactive bot for on-demand actions

---

## Trigger Configuration

**File**: `action.yml`

YoFix is implemented as a GitHub Composite Action that triggers on:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]
```

**Event Types:**
- `pull_request` → Runs full visual testing workflow
- `issue_comment` → Processes `@yofix` bot commands

---

## Complete Execution Flow

### High-Level Overview

```
PR Event → GitHub Action → YoFix → Route Analysis → Visual Testing → Screenshot Comparison → PR Report
```

### Detailed Phase Breakdown

#### **Phase 1: GitHub Action Setup** (Steps 1-8)

Prepares the execution environment before running tests.

```mermaid
graph TD
    A[PR Event Triggered] --> B[Step 1: Display Info]
    B --> C[Step 2: Validate Config]
    C --> D{Config Valid?}
    D -->|No| E[Fail Action]
    D -->|Yes| F[Step 3: Detect Playwright Version]
    F --> G[Step 4: Cache Playwright Browsers]
    G --> H{Cache Hit?}
    H -->|Yes| I[Step 5: Skip Browser Install]
    H -->|No| J[Step 5: Install Chromium]
    I --> K[Step 6: Install Dependencies]
    J --> K
    K --> L[Step 7: Initialize Storage]
    L --> M[Step 8: Prepare Test Environment]
    M --> N[Phase 2: Visual Testing]

    style A fill:#e1f5ff
    style N fill:#fff4e1
    style E fill:#ffe1e1
```

**Step Details:**

| Step | Action | File/Location | Purpose |
|------|--------|---------------|---------|
| 1 | YoFix Initialization | `action.yml:150-167` | Display version, config info |
| 2 | Configuration Validation | `action.yml:169-228` | Validate inputs (URLs, tokens, storage) |
| 3 | Playwright Version Detection | `action.yml:230-237` | Set Playwright v1.54.1 |
| 4 | Cache Playwright Browsers | `action.yml:239-253` | Cache Chromium binaries by OS |
| 5 | Setup Playwright | `action.yml:255-271` | Install Chromium if not cached |
| 6 | Install Dependencies | `action.yml:273-317` | `npm install` + rebuild native modules |
| 7 | Initialize Storage | `action.yml:319-333` | Validate Firebase/S3 config |
| 8 | Prepare Test Environment | `action.yml:335-362` | Set env vars and feature flags |

---

#### **Phase 2: Visual Testing Execution** (Step 9)

The main execution logic that orchestrates the entire testing workflow.

**Entry Point**: `src/index.ts` → `run()` function (lines 32-66)

```mermaid
graph TD
    A[Step 9: Run YoFix] --> B{Event Type?}
    B -->|issue_comment| C[Bot Command Path]
    B -->|pull_request| D[Visual Testing Path]

    D --> E[Parse Action Inputs]
    E --> F[Extract PR Context]
    F --> G[Route Impact Analysis]
    G --> H[Extract Components]
    H --> I[Create Route Analysis Result]
    I --> J[Run Visual Tests]
    J --> K[Upload Screenshots]
    K --> L[Create Verification Result]
    L --> M[Post Results to PR]
    M --> N[Cleanup Resources]

    C --> O[Parse Bot Command]
    O --> P[Execute Command]
    P --> M

    style A fill:#fff4e1
    style B fill:#e1e1ff
    style C fill:#ffe1ff
    style D fill:#e1ffe1
```

---

### Visual Testing Path - Detailed Breakdown

#### **Step 2.1: Parse Action Inputs**

**File**: `src/index.ts:100-112`

```typescript
// Reads all configuration from environment variables
const config = {
  websiteUrl: process.env.INPUT_WEBSITE_URL,
  githubToken: process.env.INPUT_GITHUB_TOKEN,
  claudeApiKey: process.env.INPUT_CLAUDE_API_KEY,
  storageProvider: process.env.INPUT_STORAGE_PROVIDER,
  // ... more config
}
```

**Purpose**: Load and validate all action inputs from GitHub Actions environment.

---

#### **Step 2.2: Extract PR Context**

**File**: `src/index.ts:135-168`

```mermaid
sequenceDiagram
    participant GH as GitHub API
    participant Index as index.ts
    participant Cache as GitHubCacheManager

    Index->>GH: Get PR number from event context
    GH-->>Index: PR #123
    Index->>Index: Validate PR context exists
    Index->>Cache: Cache preview URL for bot
    Cache-->>Index: Cached
    Index->>Index: Log repo info, SHA, actor
```

**Key Operations:**
- Extracts PR number from `github.context.payload`
- Validates that the action is running in a PR context
- Caches preview URL for later bot access
- Logs repository information and commit SHA

**Critical Check**: Fails the action if `prNumber` is undefined (not in PR context).

---

#### **Step 2.3: Route Impact Analysis** ⭐

**File**: `src/core/analysis/RouteImpactAnalyzer.ts`
**Lines**: `src/index.ts:174-271`

This is the most sophisticated part of YoFix - it intelligently determines which routes need testing based on code changes.

```mermaid
graph LR
    A[Get Changed Files] --> B[Analyze Codebase Structure]
    B --> C[Parse Routes with Tree-sitter]
    C --> D[Map Components to Routes]
    D --> E[Identify Shared Components]
    E --> F[Build Impact Tree]
    F --> G[Post PR Comment]
    G --> H[Return Affected Routes]

    style A fill:#e1f5ff
    style C fill:#ffe1e1
    style D fill:#e1ffe1
    style G fill:#fff4e1
```

**Detailed Process:**

1. **Get Changed Files** (`RouteImpactAnalyzer.ts:getChangedFiles()`)
   - Calls GitHub API to get all files modified in the PR
   - Returns array of file paths with change status

2. **Analyze Codebase Structure** (`CodebaseAnalyzer.ts`)
   - Scans entire project directory
   - Builds file tree and dependency graph
   - Identifies project structure (React/Vue/Angular)

3. **Parse Routes with Tree-sitter** (`TreeSitterRouteAnalyzer.ts`)
   - Initializes Tree-sitter parser for JavaScript/TypeScript
   - Parses AST (Abstract Syntax Tree) of route files
   - Extracts route definitions (React Router, Next.js, etc.)
   - Examples:
     ```typescript
     // Detects:
     <Route path="/dashboard" component={Dashboard} />
     { path: '/users/:id', component: UserProfile }
     export default function HomePage() { ... } // Next.js
     ```

4. **Map Components to Routes** (`RouteImpactAnalyzer.ts:analyzeWithBacktracking()`)
   - For each changed file, traces which routes import it
   - Uses import graph to backtrack from component to route
   - Handles nested imports (A imports B, B imports C, C changed)
   - Creates component-to-route mapping

5. **Identify Shared Components**
   - Detects components used by multiple routes
   - Flags these as high-risk (affect many routes)
   - Examples: Header, Footer, AuthProvider, Theme

6. **Build Impact Tree**
   - Creates hierarchical structure:
     ```
     Route: /dashboard
       └─ Direct Changes:
          └─ src/components/DashboardWidget.tsx
       └─ Indirect Changes:
          └─ src/utils/dataFormatter.ts (via DashboardWidget)
     ```

7. **Post PR Comment** (`RouteImpactAnalyzer.ts:formatImpactTree()`)
   - Formats impact tree as markdown
   - Posts as PR comment for visibility
   - Includes risk assessment

8. **Return Affected Routes**
   - Returns list of routes that need testing
   - Prioritizes by risk level (shared components = higher priority)

**Example Impact Analysis Output:**

```markdown
## 📊 Route Impact Analysis

### High Risk (3 routes affected)
- `/dashboard` - Uses shared component: `<Header />`
- `/profile` - Uses shared component: `<Header />`
- `/settings` - Direct changes to `SettingsForm.tsx`

### Routes to Test:
1. /dashboard
2. /profile
3. /settings

### Components Changed:
- src/components/Header.tsx (shared)
- src/components/SettingsForm.tsx
```

---

#### **Step 2.4: Extract Components**

**File**: `src/index.ts:282-328`

```typescript
// Extract unique components from impact tree
const components = new Set<string>();
for (const route of impactTree.routes) {
  route.directChanges.forEach(c => components.add(c));
  route.indirectChanges.forEach(c => components.add(c));
}
// Limit to 10 to avoid spam
const componentList = Array.from(components).slice(0, 10);
```

**Purpose**: Creates a deduplicated list of components to include in test context.

---

#### **Step 2.5: Create Route Analysis Result**

**File**: `src/index.ts:330-340`

```typescript
const routeAnalysisResult = {
  routes: affectedRoutes,
  components: componentList,
  riskLevel: impactTree.riskLevel,
  testSuggestions: impactTree.suggestions
};
```

**Purpose**: Packages analysis data for the test generator.

---

#### **Step 2.6: Run Visual Tests** ⭐⭐

**File**: `src/core/testing/TestGenerator.ts`
**Lines**: `src/index.ts:343-397`

This is where the actual visual testing happens. YoFix uses a hybrid approach:

```mermaid
graph TD
    A[TestGenerator.generate] --> B{Session Mode?}
    B -->|Shared Session| C[Authenticate Once]
    B -->|Independent| D[Authenticate Per Route]

    C --> E[Preserve Browser Context]
    E --> F[For Each Route]
    D --> F

    F --> G[DeterministicRunner.testRoute]
    G --> H[Navigate to Route]
    H --> I[Wait for Animations]
    I --> J[Take Screenshots at Each Viewport]
    J --> K[Compare with Baseline]
    K --> L{Diff > Threshold?}
    L -->|Yes| M[Mark as Changed]
    L -->|No| N[Mark as Unchanged]
    M --> O[Generate Diff Image]
    N --> O
    O --> P{More Routes?}
    P -->|Yes| F
    P -->|No| Q[Return Test Results]

    style C fill:#e1ffe1
    style D fill:#ffe1e1
    style J fill:#fff4e1
    style K fill:#e1f5ff
```

**Two Session Modes:**

##### **A. Shared Session Mode** (Default - More Efficient)

```typescript
// Authenticate once, reuse for all routes
const browser = await playwright.chromium.launch();
const context = await browser.newContext();

// LLM-based or smart_login authentication
await authenticateOnce(context);

// Test each route with same context (preserves cookies/session)
for (const route of routes) {
  await testRoute(context, route);
}
```

**Benefits:**
- Faster execution (no repeated auth)
- Realistic user experience (single session)
- Lower resource usage

##### **B. Independent Session Mode**

```typescript
// Create new browser for each route
for (const route of routes) {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  await authenticate(context);
  await testRoute(context, route);
  await browser.close();
}
```

**Benefits:**
- Isolated tests
- Catches session-dependent bugs
- More thorough but slower

---

##### **Deterministic Testing Process**

**File**: `src/core/deterministic/testing/DeterministicRunner.ts`

Each route undergoes a deterministic testing process:

```mermaid
sequenceDiagram
    participant DR as DeterministicRunner
    participant Browser as Playwright Browser
    participant BM as BaselineManager
    participant Storage as Storage Provider

    DR->>Browser: Initialize context (reuse if shared)
    loop For each route
        DR->>Browser: Navigate to URL
        Note over Browser: Try networkidle → domcontentloaded → commit
        DR->>Browser: Wait for animations (500ms)
        loop For each viewport
            DR->>Browser: Set viewport size
            DR->>Browser: Take screenshot
            DR->>BM: Get baseline screenshot
            BM-->>DR: Baseline image
            DR->>DR: Pixel-by-pixel comparison
            DR->>DR: Calculate diff percentage
            alt Diff > 0%
                DR->>DR: Generate diff image (highlights)
                DR->>Storage: Store diff image
            end
        end
    end
    DR-->>DR: Return test results with diffs
```

**Key Steps:**

1. **Build Full URL**
   ```typescript
   const url = `${baseUrl}${route}`;
   ```

2. **Resilient Navigation**
   ```typescript
   // Try multiple strategies in order
   try {
     await page.goto(url, { waitUntil: 'networkidle' });
   } catch {
     try {
       await page.goto(url, { waitUntil: 'domcontentloaded' });
     } catch {
       await page.goto(url, { waitUntil: 'commit' });
     }
   }
   ```

3. **Wait for Animations**
   ```typescript
   await page.waitForTimeout(500); // Let animations complete
   ```

4. **Take Screenshots at Each Viewport**
   ```typescript
   const viewports = [
     { width: 1920, height: 1080, name: 'desktop' },
     { width: 768, height: 1024, name: 'tablet' },
     { width: 375, height: 667, name: 'mobile' }
   ];

   for (const viewport of viewports) {
     await page.setViewportSize(viewport);
     const screenshot = await page.screenshot({ fullPage: true });
     screenshots.push({ viewport, buffer: screenshot });
   }
   ```

5. **Baseline Comparison** (`DynamicBaselineManager.ts`)
   ```typescript
   // Pixel-by-pixel comparison
   const baseline = await getBaseline(route, viewport);
   const diff = await pixelmatch(
     baseline,
     currentScreenshot,
     diffOutput,
     width,
     height,
     { threshold: 0.1 } // 10% tolerance
   );

   const diffPercentage = (diff / (width * height)) * 100;
   ```

6. **Generate Diff Image**
   - Creates image with changed pixels highlighted in red
   - Unchanged pixels shown in grayscale
   - Helps developers quickly spot visual regressions

**Example Test Result:**

```typescript
{
  route: '/dashboard',
  viewport: 'desktop',
  status: 'changed',
  diffPercentage: 2.34,
  screenshots: {
    baseline: 'https://storage.../baseline.png',
    current: 'https://storage.../current.png',
    diff: 'https://storage.../diff.png'
  }
}
```

---

#### **Step 2.7: Optional Visual Analysis**

**File**: `src/core/deterministic/visual/DeterministicVisualAnalyzer.ts`
**Lines**: `src/index.ts:369-397`

This step only runs if test results don't already contain screenshots (rare edge case).

```typescript
if (!testResults.some(r => r.screenshots)) {
  const analyzer = new DeterministicVisualAnalyzer(browser);
  const visualIssues = await analyzer.analyzeRoutes(routes);
  testResults.push(...visualIssues);
}
```

**Purpose**: Fallback to ensure we always have visual data.

---

#### **Step 2.8: Screenshot Storage** ⭐

**File**: `src/providers/storage/StorageFactory.ts`
**Lines**: `src/index.ts:406-587`

Uploads all screenshots and diff images to configured storage provider.

```mermaid
graph LR
    A[Save to Temp Dir] --> B[Detect Storage Provider]
    B --> C{Provider Type?}
    C -->|Firebase| D[FirebaseStorage]
    C -->|S3| E[S3Storage]
    D --> F[Batch Upload Screenshots]
    E --> F
    F --> G[Upload Diff Images]
    G --> H[Generate Signed URLs]
    H --> I[Update Metadata]
    I --> J[Log Console URLs]

    style A fill:#e1f5ff
    style D fill:#fff4e1
    style E fill:#ffe1e1
    style H fill:#e1ffe1
```

**Storage Process:**

1. **Save to Temporary Directory**
   ```typescript
   const tempDir = '/tmp/yofix-screenshots';
   await fs.writeFile(`${tempDir}/route-home-desktop.png`, screenshot);
   await fs.writeFile(`${tempDir}/route-home-desktop-diff.png`, diffImage);
   ```

2. **Detect Storage Provider**
   ```typescript
   const provider = StorageFactory.create(
     config.storageProvider, // 'firebase' or 's3'
     config.credentials
   );
   ```

3. **Initialize Provider**
   - **Firebase**: Uses service account credentials
     ```typescript
     admin.initializeApp({
       credential: admin.credential.cert({
         projectId: process.env.FIREBASE_PROJECT_ID,
         clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
         privateKey: process.env.FIREBASE_PRIVATE_KEY
       }),
       storageBucket: process.env.FIREBASE_STORAGE_BUCKET
     });
     ```

   - **S3**: Uses AWS SDK
     ```typescript
     const s3 = new AWS.S3({
       accessKeyId: process.env.AWS_ACCESS_KEY_ID,
       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
       region: process.env.AWS_REGION
     });
     ```

4. **Batch Upload**
   ```typescript
   const uploads = screenshots.map(async (screenshot) => {
     const path = `pr-${prNumber}/${route}/${viewport}.png`;
     return provider.upload(screenshot.buffer, path);
   });
   await Promise.all(uploads); // Parallel upload for speed
   ```

5. **Generate Signed URLs**
   - Firebase: `getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 })`
   - S3: `s3.getSignedUrl('getObject', { Bucket, Key, Expires: 604800 })`

6. **Update Metadata**
   ```typescript
   testResult.screenshots.baseline = 'https://storage.../baseline.png';
   testResult.screenshots.current = 'https://storage.../current.png';
   testResult.screenshots.diff = 'https://storage.../diff.png';
   ```

7. **Log Console URLs**
   ```typescript
   console.log(`View screenshots in Firebase Console:
     https://console.firebase.google.com/project/${projectId}/storage/${bucket}`);
   ```

---

#### **Step 2.9: Create Verification Result**

**File**: `src/index.ts:590-622`

Aggregates all test data into a final result object:

```typescript
const verificationResult = {
  status: testResults.every(r => r.status === 'passed') ? 'success' : 'failure',
  summary: {
    total: testResults.length,
    passed: testResults.filter(r => r.status === 'passed').length,
    failed: testResults.filter(r => r.status === 'failed').length,
    skipped: testResults.filter(r => r.status === 'skipped').length
  },
  routes: testResults.map(r => ({
    route: r.route,
    viewport: r.viewport,
    status: r.status,
    diffPercentage: r.diffPercentage,
    screenshots: r.screenshots,
    issues: r.issues
  })),
  components: componentList,
  baselineComparison: {
    hasBaseline: true,
    changedRoutes: testResults.filter(r => r.diffPercentage > 0).length,
    totalRoutes: testResults.length
  }
};
```

---

#### **Step 2.10: Post Results to PR** ⭐

**File**: `src/github/PRReporter.ts`
**Lines**: `src/index.ts:625-640`

Creates a rich, interactive PR comment with all test results.

```mermaid
graph TD
    A[PRReporter.postReport] --> B[Generate Report Header]
    B --> C[Create Test Summary]
    C --> D[Build Visual Comparison Table]
    D --> E[Embed Screenshots by Route]
    E --> F[Add Collapsible Details]
    F --> G[Include Component Info]
    G --> H[List Issues Detected]
    H --> I[Show Console Errors]
    I --> J[Add Firebase Config Links]
    J --> K[Post Comment to PR]

    style A fill:#e1f5ff
    style D fill:#fff4e1
    style E fill:#e1ffe1
    style K fill:#ffe1e1
```

**Report Structure:**

```markdown
# 🎨 YoFix Visual Testing Report

## Status: ✅ Passed | ⚠️ Changed | ❌ Failed

**Test Summary:**
- Total Routes Tested: 5
- Passed: 3 ✅
- Changed: 1 ⚠️
- Failed: 1 ❌

---

## 📸 Visual Comparison

| Route | Viewport | Status | Diff % | Baseline | Current | Diff |
|-------|----------|--------|--------|----------|---------|------|
| /dashboard | Desktop | ⚠️ Changed | 2.34% | [🖼️](baseline-url) | [🖼️](current-url) | [🔍](diff-url) |
| /profile | Desktop | ✅ Unchanged | 0.00% | [🖼️](baseline-url) | [🖼️](current-url) | - |

---

## 🖼️ Screenshots by Route

### /dashboard (Changed)

<details>
<summary>Desktop (1920x1080) - 2.34% different</summary>

**Baseline:**
![Baseline](baseline-url)

**Current:**
![Current](current-url)

**Diff:**
![Diff](diff-url)

</details>

---

## 📦 Components Verified
- src/components/Header.tsx
- src/components/DashboardWidget.tsx
- src/utils/dataFormatter.ts

---

## 🐛 Issues Detected

### /dashboard - Layout Shift
**Severity:** Warning
**Description:** Element shifted 10px down
**Location:** .dashboard-widget:hover

---

## 🖥️ Console Errors

### /checkout
```
Error: Failed to load payment processor
  at PaymentForm.tsx:45
```

---

## ⚙️ Configuration

**Storage:** Firebase Storage
**Console:** https://console.firebase.google.com/...
**Bucket:** yofix-screenshots

---

💬 Reply with `@yofix help` for available commands
```

**Key Features of PR Report:**

1. **Color-Coded Status**: Green ✅, Yellow ⚠️, Red ❌
2. **Diff Percentage**: Shows exact percentage of pixels changed
3. **Side-by-Side Comparison**: Baseline vs Current vs Diff
4. **Collapsible Details**: Keep PR clean, expand for details
5. **Issue Highlighting**: Automatic detection of UI issues
6. **Console Errors**: Shows JavaScript errors per route
7. **Component Tracking**: Lists which components were verified
8. **Storage Links**: Direct links to Firebase/S3 console

---

#### **Step 2.11: Cleanup Resources**

**File**: `src/index.ts:643-703`

```typescript
try {
  // Close browser contexts
  await browser.close();

  // Remove temporary directories
  await fs.rm(tempDir, { recursive: true, force: true });

  // Set GitHub Action outputs
  core.setOutput('status', verificationResult.status);
  core.setOutput('report-url', prCommentUrl);

} catch (error) {
  // Post error message to PR
  await github.postComment(pr, `❌ Error: ${error.message}`);
  core.setFailed(error.message);
}
```

**Cleanup Steps:**
1. Close all browser contexts (prevent memory leaks)
2. Remove temp directories
3. Set GitHub Action outputs for other workflow steps
4. Post error messages if failures occurred
5. Mark action as failed if critical errors

---

### **Phase 3: Test Summary Generation** (Step 10)

**File**: `action.yml:412-445`

GitHub automatically displays a workflow summary page. YoFix generates custom markdown:

```typescript
// This step runs even if previous steps failed
if: always()

// Generate summary
await core.summary
  .addHeading('YoFix Test Summary')
  .addTable([
    ['Status', verificationResult.status],
    ['Routes Tested', verificationResult.summary.total],
    ['Storage Provider', config.storageProvider],
    ['AI Features', config.smartAnalysis ? 'Enabled' : 'Disabled']
  ])
  .addLink('View Full Report', prCommentUrl)
  .write();
```

**Summary Example:**

```
YoFix Test Summary

Status:          ✅ Passed
Routes Tested:   5
Storage:         Firebase
AI Features:     Enabled

[View Full Report →]
```

---

## Architecture Diagrams

### System Architecture

```mermaid
graph TB
    subgraph "GitHub"
        A[Pull Request Event]
        B[Issue Comment Event]
    end

    subgraph "GitHub Actions Runner"
        C[YoFix Action]
        D[Playwright Browser]
    end

    subgraph "YoFix Core"
        E[Route Impact Analyzer]
        F[Test Generator]
        G[Deterministic Runner]
        H[Baseline Manager]
    end

    subgraph "External Services"
        I[Claude API]
        J[Firebase Storage]
        K[AWS S3]
        L[GitHub API]
    end

    A --> C
    B --> C
    C --> E
    E --> F
    F --> G
    G --> D
    G --> H
    H --> J
    H --> K
    C --> I
    C --> L

    style A fill:#e1f5ff
    style C fill:#fff4e1
    style G fill:#e1ffe1
    style I fill:#ffe1e1
```

---

### Data Flow Diagram

```mermaid
graph LR
    A[PR Files Changed] --> B[Route Impact Analyzer]
    B --> C[Affected Routes List]
    C --> D[Test Generator]
    D --> E[Browser Automation]
    E --> F[Screenshots]
    F --> G[Baseline Manager]
    G --> H{Baseline Exists?}
    H -->|Yes| I[Pixel Comparison]
    H -->|No| J[Create Baseline]
    I --> K[Diff Calculation]
    J --> K
    K --> L[Storage Upload]
    L --> M[PR Reporter]
    M --> N[GitHub PR Comment]

    style A fill:#e1f5ff
    style C fill:#ffe1e1
    style F fill:#fff4e1
    style I fill:#e1ffe1
    style N fill:#ffe1ff
```

---

### Component Interaction Diagram

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant Action as YoFix Action
    participant RIA as RouteImpactAnalyzer
    participant TG as TestGenerator
    participant DR as DeterministicRunner
    participant BM as BaselineManager
    participant Storage as Storage Provider
    participant PR as PRReporter

    GH->>Action: PR Event
    Action->>Action: Parse inputs
    Action->>RIA: Analyze changed files
    RIA->>RIA: Parse AST with Tree-sitter
    RIA->>RIA: Map components to routes
    RIA-->>Action: Affected routes

    Action->>TG: Generate tests for routes
    TG->>DR: Test each route

    loop For each route
        DR->>DR: Navigate to route
        DR->>DR: Take screenshots
        DR->>BM: Get baseline
        BM-->>DR: Baseline screenshot
        DR->>DR: Calculate pixel diff
        DR->>Storage: Upload screenshots
        Storage-->>DR: Screenshot URLs
    end

    DR-->>TG: Test results
    TG-->>Action: Complete results

    Action->>PR: Format report
    PR->>GH: Post PR comment
    GH-->>Action: Comment posted

    Action->>Action: Cleanup resources
```

---

### File Dependency Graph

```
src/index.ts (Entry Point)
├── src/core/analysis/RouteImpactAnalyzer.ts
│   ├── src/context/CodebaseAnalyzer.ts
│   ├── src/core/analysis/TreeSitterRouteAnalyzer.ts
│   └── src/github/GitHubServiceFactory.ts
│
├── src/core/testing/TestGenerator.ts
│   ├── src/core/deterministic/testing/DeterministicRunner.ts
│   │   ├── src/core/baseline/DynamicBaselineManager.ts
│   │   └── playwright (external)
│   │
│   └── src/core/deterministic/visual/DeterministicVisualAnalyzer.ts
│
├── src/providers/storage/StorageFactory.ts
│   ├── src/providers/storage/FirebaseStorage.ts
│   │   └── firebase-admin (external)
│   │
│   └── src/providers/storage/S3Storage.ts
│       └── aws-sdk (external)
│
├── src/github/PRReporter.ts
│   └── @actions/github (external)
│
└── src/github/GitHubCacheManager.ts
```

---

## Key Files and Responsibilities

### Core Entry Points

| File | Lines of Code | Primary Responsibility |
|------|--------------|------------------------|
| `src/index.ts` | ~700 | Main workflow orchestrator, coordinates all phases |
| `action.yml` | ~450 | GitHub Action definition, setup steps |

### Route Analysis Module

| File | Primary Responsibility |
|------|------------------------|
| `src/core/analysis/RouteImpactAnalyzer.ts` | Analyzes PR changes to find affected routes |
| `src/core/analysis/TreeSitterRouteAnalyzer.ts` | Parses AST to extract route definitions |
| `src/context/CodebaseAnalyzer.ts` | Scans entire codebase structure and dependencies |

**Key Algorithms:**

```typescript
// Backtracking algorithm to find routes affected by component
function analyzeWithBacktracking(changedFile: string): string[] {
  const affectedRoutes = [];
  const visited = new Set();

  function backtrack(file: string) {
    if (visited.has(file)) return;
    visited.add(file);

    // Check if this file is a route
    if (isRoute(file)) {
      affectedRoutes.push(extractRoutePath(file));
      return;
    }

    // Find files that import this file
    const importers = findFilesThatImport(file);
    for (const importer of importers) {
      backtrack(importer);
    }
  }

  backtrack(changedFile);
  return affectedRoutes;
}
```

---

### Testing Module

| File | Primary Responsibility |
|------|------------------------|
| `src/core/testing/TestGenerator.ts` | Orchestrates test execution, manages browser sessions |
| `src/core/deterministic/testing/DeterministicRunner.ts` | Executes deterministic visual tests for each route |
| `src/core/deterministic/visual/DeterministicVisualAnalyzer.ts` | Analyzes visual differences and detects UI issues |

**Test Flow:**

```typescript
// Shared session approach
class TestGenerator {
  async generate(routes: string[]) {
    // Authenticate once
    const context = await this.authenticate();

    // Test all routes with same session
    const results = [];
    for (const route of routes) {
      const result = await this.runner.testRoute(context, route);
      results.push(result);
    }

    return results;
  }
}

// Deterministic testing
class DeterministicRunner {
  async testRoute(context: BrowserContext, route: string) {
    const page = await context.newPage();

    // Navigate with retry logic
    await this.navigateResilient(page, route);

    // Test each viewport
    const results = [];
    for (const viewport of this.viewports) {
      await page.setViewportSize(viewport);
      const screenshot = await page.screenshot({ fullPage: true });

      // Compare with baseline
      const baseline = await this.baselineManager.get(route, viewport);
      const diff = this.comparePixels(baseline, screenshot);

      results.push({ viewport, diff, screenshot });
    }

    return results;
  }
}
```

---

### Baseline Management

| File | Primary Responsibility |
|------|------------------------|
| `src/core/baseline/DynamicBaselineManager.ts` | Manages baseline screenshots, handles comparison logic |

**Baseline Strategy:**

```typescript
class DynamicBaselineManager {
  async getOrCreateBaseline(route: string, viewport: string): Promise<Buffer> {
    // Check if baseline exists
    const baselinePath = `baselines/${route}/${viewport}.png`;
    const exists = await this.storage.exists(baselinePath);

    if (exists) {
      // Use existing baseline
      return await this.storage.download(baselinePath);
    } else {
      // Create new baseline from production
      console.log(`Creating baseline for ${route} at ${viewport}`);
      const screenshot = await this.captureProduction(route, viewport);
      await this.storage.upload(screenshot, baselinePath);
      return screenshot;
    }
  }

  async compareWithBaseline(current: Buffer, baseline: Buffer): Promise<DiffResult> {
    const { width, height } = PNG.sync.read(baseline);
    const diff = new PNG({ width, height });

    const numDiffPixels = pixelmatch(
      baseline.data,
      current.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 }
    );

    const diffPercentage = (numDiffPixels / (width * height)) * 100;

    return {
      diffPercentage,
      diffImage: PNG.sync.write(diff),
      severity: diffPercentage > 5 ? 'critical' :
                diffPercentage > 1 ? 'warning' : 'info'
    };
  }
}
```

---

### Storage Providers

| File | Primary Responsibility |
|------|------------------------|
| `src/providers/storage/StorageFactory.ts` | Creates storage provider instances |
| `src/providers/storage/FirebaseStorage.ts` | Firebase Storage implementation |
| `src/providers/storage/S3Storage.ts` | AWS S3 Storage implementation |

**Provider Interface:**

```typescript
interface StorageProvider {
  upload(buffer: Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
  getSignedUrl(path: string, expiresIn: number): Promise<string>;
  delete(path: string): Promise<void>;
}

class FirebaseStorage implements StorageProvider {
  async upload(buffer: Buffer, path: string): Promise<string> {
    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    await file.save(buffer, { contentType: 'image/png' });
    return `gs://${bucket.name}/${path}`;
  }

  async getSignedUrl(path: string, expiresIn: number): Promise<string> {
    const [url] = await bucket.file(path).getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresIn
    });
    return url;
  }
}
```

---

### GitHub Integration

| File | Primary Responsibility |
|------|------------------------|
| `src/github/PRReporter.ts` | Formats and posts PR comments |
| `src/github/GitHubCacheManager.ts` | Caches preview URLs for bot access |
| `src/core/github/GitHubServiceFactory.ts` | GitHub API wrapper |

**PR Comment Formatting:**

```typescript
class PRReporter {
  formatReport(results: TestResult[]): string {
    let markdown = '# 🎨 YoFix Visual Testing Report\n\n';

    // Status header
    const status = this.determineOverallStatus(results);
    markdown += `## Status: ${this.statusEmoji(status)}\n\n`;

    // Summary table
    markdown += this.createSummaryTable(results);

    // Visual comparison table
    markdown += '\n## 📸 Visual Comparison\n\n';
    markdown += this.createComparisonTable(results);

    // Collapsible screenshot sections
    for (const result of results) {
      markdown += this.createScreenshotSection(result);
    }

    // Issues detected
    const issues = results.flatMap(r => r.issues);
    if (issues.length > 0) {
      markdown += '\n## 🐛 Issues Detected\n\n';
      markdown += this.formatIssues(issues);
    }

    return markdown;
  }

  createComparisonTable(results: TestResult[]): string {
    let table = '| Route | Viewport | Status | Diff % | Baseline | Current | Diff |\n';
    table += '|-------|----------|--------|--------|----------|---------|------|\n';

    for (const result of results) {
      table += `| ${result.route} `;
      table += `| ${result.viewport} `;
      table += `| ${this.statusEmoji(result.status)} `;
      table += `| ${result.diffPercentage.toFixed(2)}% `;
      table += `| [🖼️](${result.screenshots.baseline}) `;
      table += `| [🖼️](${result.screenshots.current}) `;
      table += `| ${result.diffPercentage > 0 ? `[🔍](${result.screenshots.diff})` : '-'} |\n`;
    }

    return table;
  }
}
```

---

### Bot System

| File | Primary Responsibility |
|------|------------------------|
| `src/bot/YoFixBot.ts` | Main bot handler, processes commands |
| `src/bot/CommandParser.ts` | Parses natural language commands |
| `src/bot/CommandHandler.ts` | Executes bot commands |

---

## Bot Command Workflow

When a user mentions `@yofix` in a PR comment, an alternative workflow executes:

```mermaid
graph TD
    A[Issue Comment Event] --> B{Contains @yofix?}
    B -->|No| C[Ignore]
    B -->|Yes| D[YoFixBot.handleCommand]
    D --> E[React with Eyes Emoji]
    E --> F[CommandParser.parse]
    F --> G{Command Type?}

    G -->|run tests| H[Run Full Visual Tests]
    G -->|test /route| I[Test Specific Route]
    G -->|fix issue| J[Generate AI Fix]
    G -->|analyze| K[Run Route Analysis]
    G -->|generate test| L[Create Test File]

    H --> M[Execute via TestGenerator]
    I --> M
    J --> N[Execute via FixGenerator]
    K --> O[Execute via RouteImpactAnalyzer]
    L --> P[Execute via TestFileGenerator]

    M --> Q[Post Results to Thread]
    N --> Q
    O --> Q
    P --> Q

    style A fill:#e1f5ff
    style D fill:#fff4e1
    style G fill:#ffe1ff
    style Q fill:#e1ffe1
```

### Bot Command Examples

```bash
# Run full visual test suite
@yofix run tests

# Test specific route
@yofix test /dashboard

# Test with pattern
@yofix test /users/*

# Generate fix for issue
@yofix fix the header alignment issue on mobile

# Analyze route impact
@yofix analyze authentication flow

# Generate test file
@yofix generate test for checkout process

# Get help
@yofix help
```

### Command Parser Logic

```typescript
class CommandParser {
  parse(comment: string): Command {
    // Remove @yofix mention
    const text = comment.replace(/@yofix/gi, '').trim();

    // Parse command type
    if (/^run\s+tests?$/i.test(text)) {
      return { type: 'run_tests', routes: [] };
    }

    if (/^test\s+(.+)$/i.test(text)) {
      const route = RegExp.$1.trim();
      return { type: 'test_route', routes: [route] };
    }

    if (/^fix\s+(.+)$/i.test(text)) {
      const issue = RegExp.$1.trim();
      return { type: 'generate_fix', issue };
    }

    if (/^analyze\s+(.+)$/i.test(text)) {
      const target = RegExp.$1.trim();
      return { type: 'analyze', target };
    }

    if (/^generate\s+test\s+for\s+(.+)$/i.test(text)) {
      const feature = RegExp.$1.trim();
      return { type: 'generate_test', feature };
    }

    return { type: 'help' };
  }
}
```

### Command Handler

```typescript
class CommandHandler {
  async execute(command: Command, pr: PullRequest): Promise<string> {
    switch (command.type) {
      case 'run_tests':
        const routes = await this.routeAnalyzer.getAffectedRoutes(pr);
        const results = await this.testGenerator.generate(routes);
        return this.formatResults(results);

      case 'test_route':
        const results = await this.testGenerator.generate(command.routes);
        return this.formatResults(results);

      case 'generate_fix':
        const previewUrl = await this.cache.getPreviewUrl(pr);
        const fix = await this.fixGenerator.generateFix(command.issue, previewUrl);
        return this.formatFix(fix);

      case 'analyze':
        const analysis = await this.routeAnalyzer.analyze(command.target);
        return this.formatAnalysis(analysis);

      case 'generate_test':
        const testCode = await this.testGenerator.generateTestFile(command.feature);
        return this.formatTestCode(testCode);

      case 'help':
        return this.getHelpMessage();
    }
  }
}
```

---

## Testing Deep Dive

### Viewport Configuration

YoFix tests at multiple viewport sizes to catch responsive design issues:

```typescript
const DEFAULT_VIEWPORTS = [
  { width: 1920, height: 1080, name: 'desktop', label: 'Desktop (1920x1080)' },
  { width: 1366, height: 768, name: 'laptop', label: 'Laptop (1366x768)' },
  { width: 768, height: 1024, name: 'tablet', label: 'Tablet (768x1024)' },
  { width: 375, height: 667, name: 'mobile', label: 'Mobile (375x667)' }
];
```

**Custom Viewports** can be configured via action inputs:

```yaml
viewports: |
  1920x1080:desktop
  768x1024:tablet
  375x667:mobile
```

---

### Authentication Strategies

YoFix supports two authentication modes:

#### 1. Selector-Based (Deterministic)

```yaml
auth-mode: selectors
auth-selectors: |
  username: #username
  password: #password
  submit: button[type="submit"]
```

**Process:**
```typescript
await page.fill('#username', process.env.TEST_USERNAME);
await page.fill('#password', process.env.TEST_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForNavigation();
```

#### 2. AI-Based (Smart)

```yaml
auth-mode: ai
auth-instructions: |
  1. Enter username "testuser"
  2. Enter password from TEST_PASSWORD env var
  3. Click the login button
  4. Wait for dashboard to load
```

**Process:**
```typescript
const instructions = config.authInstructions;
const context = await this.enhancedContext.analyze(websiteUrl);
await this.claudeAnalyzer.authenticateWithAI(page, instructions, context);
```

**Benefits of AI Auth:**
- Handles complex multi-step auth flows
- Adapts to dynamic login pages
- Works with 2FA, CAPTCHA alternatives
- Understands natural language instructions

---

### Baseline Management Strategy

```mermaid
graph TD
    A[Test Route] --> B{Baseline Exists?}
    B -->|Yes| C[Download Baseline]
    B -->|No| D[Create New Baseline]

    C --> E[Take Current Screenshot]
    D --> F[Capture from Production URL]
    F --> G[Upload as Baseline]
    G --> E

    E --> H[Compare Pixels]
    H --> I{Diff > Threshold?}
    I -->|Yes| J[Mark as Changed]
    I -->|No| K[Mark as Unchanged]

    J --> L[Generate Diff Image]
    L --> M[Upload Current & Diff]
    K --> M

    style D fill:#ffe1e1
    style F fill:#fff4e1
    style L fill:#e1ffe1
```

**Baseline Creation Logic:**

```typescript
async function getOrCreateBaseline(route: string, viewport: Viewport): Promise<Buffer> {
  const baselinePath = `baselines/${sanitize(route)}/${viewport.name}.png`;

  // Check if baseline exists
  if (await storage.exists(baselinePath)) {
    console.log(`Using existing baseline for ${route} at ${viewport.name}`);
    return await storage.download(baselinePath);
  }

  // Create new baseline from production
  console.log(`Creating new baseline for ${route} at ${viewport.name}`);
  const productionUrl = process.env.PRODUCTION_URL || config.websiteUrl;

  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport });
  await page.goto(`${productionUrl}${route}`);
  await page.waitForLoadState('networkidle');

  const screenshot = await page.screenshot({ fullPage: true });
  await browser.close();

  // Upload as baseline
  await storage.upload(screenshot, baselinePath);

  return screenshot;
}
```

---

### Pixel Comparison Algorithm

YoFix uses the `pixelmatch` library for pixel-perfect comparison:

```typescript
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

function compareScreenshots(baseline: Buffer, current: Buffer): DiffResult {
  const baselinePng = PNG.sync.read(baseline);
  const currentPng = PNG.sync.read(current);

  // Ensure same dimensions
  if (baselinePng.width !== currentPng.width ||
      baselinePng.height !== currentPng.height) {
    throw new Error('Screenshot dimensions do not match');
  }

  const { width, height } = baselinePng;
  const diff = new PNG({ width, height });

  // Compare pixel-by-pixel
  const numDiffPixels = pixelmatch(
    baselinePng.data,  // baseline pixel data
    currentPng.data,   // current pixel data
    diff.data,         // output diff image data
    width,
    height,
    {
      threshold: 0.1,        // 10% color difference threshold
      includeAA: false,      // ignore anti-aliasing differences
      alpha: 0.1,            // transparency detection
      diffColor: [255, 0, 0] // red for differences
    }
  );

  const totalPixels = width * height;
  const diffPercentage = (numDiffPixels / totalPixels) * 100;

  return {
    diffPercentage,
    diffPixels: numDiffPixels,
    totalPixels,
    diffImage: PNG.sync.write(diff),
    severity: calculateSeverity(diffPercentage)
  };
}

function calculateSeverity(diffPercentage: number): Severity {
  if (diffPercentage > 5) return 'critical';
  if (diffPercentage > 1) return 'warning';
  if (diffPercentage > 0) return 'info';
  return 'none';
}
```

**Diff Image Output:**
- **Red pixels**: Changed between baseline and current
- **Gray pixels**: Unchanged
- **Transparency**: Indicates alpha channel differences

---

### Error Handling and Retries

YoFix implements robust error handling:

```typescript
async function navigateResilient(page: Page, url: string): Promise<void> {
  const strategies = [
    { waitUntil: 'networkidle', timeout: 30000 },
    { waitUntil: 'domcontentloaded', timeout: 20000 },
    { waitUntil: 'commit', timeout: 10000 }
  ];

  for (const strategy of strategies) {
    try {
      await page.goto(url, strategy);
      console.log(`Navigation successful with strategy: ${strategy.waitUntil}`);
      return;
    } catch (error) {
      console.warn(`Navigation failed with ${strategy.waitUntil}, trying next strategy`);
      if (strategy === strategies[strategies.length - 1]) {
        throw new Error(`Failed to navigate to ${url} after all strategies`);
      }
    }
  }
}
```

---

## Configuration Reference

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | ✅ | - | GitHub token for PR interactions |
| `website-url` | ✅ | - | Target website URL to test |
| `claude-api-key` | ✅ | - | Anthropic Claude API key |
| `storage-provider` | ❌ | `firebase` | Storage provider (`firebase` or `s3`) |
| `auth-mode` | ❌ | `selectors` | Auth mode (`selectors` or `ai`) |
| `auth-selectors` | ❌ | - | CSS selectors for auth fields |
| `auth-instructions` | ❌ | - | Natural language auth instructions (for AI mode) |
| `pages` | ❌ | `/` | Routes to test (newline-separated, supports globs) |
| `viewports` | ❌ | See above | Viewports to test (`WxH:name` format) |
| `smart-analysis` | ❌ | `false` | Enable AI-powered route analysis |
| `auto-fix` | ❌ | `false` | Enable automatic fix generation |
| `production-url` | ❌ | `website-url` | Production URL for baseline creation |

### Storage Configuration

#### Firebase

```bash
export FIREBASE_PROJECT_ID=your-project-id
export FIREBASE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
export FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
```

#### AWS S3

```bash
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
export AWS_REGION=us-east-1
export S3_BUCKET=yofix-screenshots
```

---

## Performance Optimizations

### 1. Browser Caching

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-1.54.1
```

**Impact**: Reduces browser installation time from ~60s to ~5s on cache hit.

---

### 2. Shared Browser Sessions

```typescript
// Instead of:
for (const route of routes) {
  const browser = await launch();
  await test(browser, route);
  await browser.close();
}

// Use:
const browser = await launch();
for (const route of routes) {
  await test(browser, route);
}
await browser.close();
```

**Impact**: 50% faster test execution (no repeated auth).

---

### 3. Parallel Screenshot Upload

```typescript
await Promise.all(
  screenshots.map(s => storage.upload(s.buffer, s.path))
);
```

**Impact**: 3x faster upload for 10+ screenshots.

---

### 4. Incremental Route Testing

Only tests routes affected by PR changes, not entire app.

**Impact**: 80% reduction in test time for most PRs.

---

## Troubleshooting Guide

### Common Issues

#### 1. "Failed to find baseline"

**Cause**: No production URL configured
**Solution**: Set `production-url` input or ensure baselines exist

#### 2. "Authentication failed"

**Cause**: Incorrect selectors or credentials
**Solution**: Verify `auth-selectors` match your login form

#### 3. "Screenshot upload failed"

**Cause**: Invalid storage credentials
**Solution**: Check Firebase/S3 credentials and permissions

#### 4. "Route analysis returned empty"

**Cause**: Tree-sitter couldn't parse routes
**Solution**: Check that routes are defined in supported format

#### 5. "Browser timeout"

**Cause**: Page takes too long to load
**Solution**: Increase `timeout` or check network issues

---

## Future Enhancements

### Planned Features

1. **Visual AI Analysis**: Use Claude Vision to describe visual changes
2. **Baseline Auto-Update**: Automatically update baselines when changes are approved
3. **Cross-Browser Testing**: Test on Firefox and WebKit in addition to Chromium
4. **Performance Metrics**: Track page load times, Core Web Vitals
5. **Video Recording**: Record full test sessions for debugging
6. **A/B Testing**: Compare multiple preview URLs
7. **Scheduled Scans**: Run tests on a schedule (nightly, weekly)

---

## Related Documentation

- [Guide: Getting Started with YoFix](./guide_getting-started.md)
- [Guide: Configuration](./guide_configuration.md)
- [Reference: Bot Commands](./reference_bot-commands.md)
- [Reference: Storage Providers](./reference_storage-providers.md)

---

## Changelog

### Version 1.0.11
- Added EnhancedContextProvider for better AI understanding
- Implemented smart authentication with AI navigation
- Added context-aware test generation

### Version 1.0.0
- Initial release
- Route impact analysis with Tree-sitter
- Deterministic visual testing
- Firebase and S3 storage support
- Bot command interface

---

**Maintained by**: YoFix Team
**License**: MIT
**Repository**: https://github.com/yourusername/yofix
