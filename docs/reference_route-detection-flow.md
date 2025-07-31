# @yofix Route Detection Flow with Tree-sitter

## Overview

YoFix uses Tree-sitter for high-performance, accurate route detection across multiple frameworks. Tree-sitter is a parser generator tool and incremental parsing library that builds concrete syntax trees for source files and updates them efficiently as the source file is edited.

### Key Features
- **Multi-Framework Support**: React Router, Vue Router, Next.js, Angular, SvelteKit
- **Parallel Processing**: Analyzes multiple files concurrently
- **Import Type Support**: Both lazy (`React.lazy()`) and regular imports
- **Multi-Route Detection**: Identifies when components are used in multiple routes
- **Case-Insensitive**: Handles file paths regardless of case
- **Persistent Caching**: Caches import graph for fast subsequent runs

## Why Tree-sitter?

1. **Performance**: 10-100x faster than traditional JavaScript parsers like Babel
2. **Error Recovery**: Continues parsing even with syntax errors
3. **Incremental**: Only re-parses changed portions of files
4. **Language Agnostic**: Supports multiple languages with consistent API
5. **Production Ready**: Used by GitHub, Neovim, Zed, and many other tools

## Supported Frameworks

### React Router (v5 & v6)
```tsx
// JSX Routes
<Route path="/dashboard" element={<Dashboard />} />

// Object Routes (useRoutes)
const routes = [
  { path: "/", element: <Home /> },
  { path: "/about", component: About }
];

// Lazy imports
const Dashboard = lazy(() => import('./Dashboard'));
```

### Vue Router
```javascript
const routes = [
  { path: '/foo', component: FooComponent },
  { path: '/bar', component: () => import('./Bar.vue') }
]
```

### Next.js (App Router & Pages Router)
```
// App Router (file-based)
app/dashboard/page.tsx → /dashboard
app/blog/[slug]/page.tsx → /blog/:slug

// Pages Router
pages/index.tsx → /
pages/users/[id].tsx → /users/:id
```

### Angular Router
```typescript
const routes: Routes = [
  { path: 'heroes', component: HeroesComponent }
];
```

### SvelteKit (file-based)
```
routes/about/+page.svelte → /about
routes/blog/[slug]/+page.svelte → /blog/:slug
```

## Complete Flow for Detecting Routes

### Example: PR changes multiple files

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GitHub Pull Request #456                            │
│  Changed Files:                                                             │
│  - src/components/Button.tsx (shared component)                            │
│  - src/pages/Dashboard.tsx (lazy imported)                                 │
│  - src/pages/public/terms/TermsOfService.tsx (regular import)             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GitHub Action Triggered                              │
│                          @yofix/yofix@v1                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Step 1: Repository Checkout                              │
│                                                                             │
│  actions/checkout@v4:                                                       │
│  - Clones entire loop-admin repository                                     │
│  - Has access to ALL files at PR's commit                                  │
│  - Working directory: /github/workspace                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Step 2: Get Changed Files from GitHub API                     │
│                                                                             │
│  octokit.pulls.listFiles(PR #456):                                        │
│  → ["src/components/Button.tsx",                                          │
│     "src/pages/Dashboard.tsx",                                            │
│     "src/pages/public/terms/TermsOfService.tsx"]                         │
│                                                                             │
│  Process files in parallel for better performance                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│          Step 3: Initialize Tree-sitter Route Analyzer                     │
│                                                                             │
│  1. Check for cached import graph in .yofix-cache/                        │
│  2. If cache exists and is valid:                                         │
│     - Load pre-built import graph (< 50ms)                               │
│  3. If no cache:                                                          │
│     - Parse all files with Tree-sitter                                   │
│     - Build import graph and route mappings                              │
│     - Persist to cache for next run                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│          Step 4: Parse Files with Tree-sitter                             │
│                                                                             │
│  Tree-sitter parsing (10-100x faster than Babel):                         │
│  - Creates concrete syntax tree (CST)                                     │
│  - Continues parsing even with errors                                     │
│  - Extracts:                                                              │
│    • Import statements                                                     │
│    • Export declarations                                                   │
│    • JSX elements with 'path' attributes                                  │
│    • Route configuration objects                                          │
│                                                                             │
│  Example AST node for route:                                              │
│  JSXElement {                                                              │
│    openingElement: {                                                       │
│      name: "Route",                                                        │
│      attributes: [                                                         │
│        { name: "path", value: "/" },                                     │
│        { name: "element", value: <Login /> }                             │
│      ]                                                                     │
│    }                                                                       │
│  }                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               Step 5: Build Import Graph                                   │
│                                                                             │
│  Create bidirectional import graph:                                       │
│                                                                             │
│  ImportGraphNode {                                                         │
│    file: "src/forms/LoginForm.tsx",                                       │
│    importedBy: Set(["src/pages/public/Login.tsx"]),                      │
│    imports: Set(["src/components/Button.tsx"]),                          │
│    isRouteFile: false,                                                    │
│    isEntryPoint: false                                                    │
│  }                                                                         │
│                                                                             │
│  Graph structure:                                                          │
│  LoginForm.tsx ← Login.tsx ← PublicRouter.tsx (defines routes)           │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│        Step 6: Trace Routes via Parallel BFS Processing                   │
│                                                                             │
│  Processing multiple files concurrently:                                   │
│                                                                             │
│  Button.tsx:                                                               │
│  - Imported by: Header.tsx, Footer.tsx, Dashboard.tsx                    │
│  - Routes affected: Multiple (shared component)                           │
│                                                                             │
│  Dashboard.tsx:                                                            │
│  - Lazy imported in: PrivateRouter.tsx                                   │
│  - Route: "/dashboard"                                                    │
│                                                                             │
│  TermsOfService.tsx:                                                       │
│  - Regular import in: generalRoutes.ts                                   │
│  - Route: "/terms-of-service"                                            │
│                                                                             │
│  Case-insensitive matching handles:                                      │
│  - DrillDown.tsx vs Drilldown.tsx → Same results                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Step 7: Generate Route Impact Analysis                        │
│                                                                             │
│  RouteInfo {                                                               │
│    "src/components/Button.tsx": {                                         │
│      routes: ["/dashboard", "/profile", "/settings", ...],               │
│      isRouteDefiner: false,                                               │
│      sharedComponent: true   // Used in multiple routes                  │
│    },                                                                      │
│    "src/pages/Dashboard.tsx": {                                           │
│      routes: ["/dashboard"],                                              │
│      isRouteDefiner: false,                                               │
│      importType: "lazy"      // Lazy loaded component                    │
│    },                                                                      │
│    "src/pages/public/terms/TermsOfService.tsx": {                        │
│      routes: ["/terms-of-service"],                                      │
│      isRouteDefiner: false,                                               │
│      importType: "regular"   // Regular import                           │
│    }                                                                       │
│  }                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Step 8: Visual Testing                                  │
│                                                                             │
│  Test only affected routes:                                                │
│  1. Navigate to https://admin.loopkitchen.xyz/                           │
│  2. Take screenshots                                                       │
│  3. Navigate to https://admin.loopkitchen.xyz/login                      │
│  4. Take screenshots                                                       │
│  5. Compare with baselines                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Step 9: Post Results to PR                             │
│                                                                             │
│  ## 🌳 Route Impact Tree                                                   │
│                                                                             │
│  📊 **3** files changed → **10+** routes affected                         │
│                                                                             │
│  Route Tree:                                                               │
│  ├── /dashboard                                                            │
│  │   ├── Dashboard.tsx (lazy component)                                   │
│  │   └── Button.tsx (shared component)                                    │
│  ├── /profile                                                              │
│  │   └── Button.tsx (shared component)                                    │
│  ├── /settings                                                             │
│  │   └── Button.tsx (shared component)                                    │
│  └── /terms-of-service                                                     │
│      └── TermsOfService.tsx (regular import)                             │
│                                                                             │
│  ⚠️ Shared component Button.tsx affects multiple routes                   │
│  ✅ Visual tests passed on all affected routes                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### TreeSitterRouteAnalyzer

The main analyzer that handles:
- Parsing files with Tree-sitter
- Building and maintaining import graph
- Detecting route definitions
- Caching for performance
- Incremental updates

### Multi-Level Caching

```typescript
class TreeSitterRouteAnalyzer {
  // Cache levels:
  private astCache: Map<string, { tree: Parser.Tree; hash: string }>;
  private fileCache: Map<string, FileNode>;
  private importGraph: Map<string, ImportGraphNode>;
  private routeCache: Map<string, string[]>;
  
  // Persistent cache
  private cacheDir = '.yofix-cache/';
}
```

### Route Detection Patterns

Tree-sitter looks for these patterns without keyword assumptions:

1. **JSX Route Elements**
   ```tsx
   <Route path="/dashboard" element={<Dashboard />} />
   ```

2. **Route Configuration Objects**
   ```typescript
   const routes = [
     { path: "/", component: Home },
     { path: "/about", element: <About /> }
   ];
   ```

3. **Custom Route Components**
   ```tsx
   <PrivateRoute path="/admin" component={AdminPanel} />
   ```

## Performance Characteristics

- **Initial Build**: O(n) - Parse each file once
- **Cached Load**: O(1) - Load pre-built graph
- **Route Detection**: O(d) - Where d is import depth
- **Incremental Update**: O(1) - Only affected files

### Typical Performance

For a React app with 500 files:
- Initial build: ~500ms (one-time cost)
- Cached initialization: ~20ms
- Per-file route detection: ~5-10ms
- Average speedup vs Babel: 10-50x

## New Features & Improvements

### 1. Multi-File Parallel Processing
```typescript
// Process multiple files concurrently
const promises = changedFiles.map(file => 
  this.detectRoutesForFile(file).then(routes => ({ file, routes }))
);
const fileRoutes = await Promise.all(promises);
```

### 2. Regular Import Support
```typescript
// Now supports all import types:
import Component from './Component';           // Default import
import { Component } from './Component';       // Named import
import { Component as Alias } from './Component'; // Aliased import
const Component = lazy(() => import('./Component')); // Lazy import
```

### 3. Multi-Route Component Detection
When a component like `Benchmarks.tsx` is used in multiple routes:
```
📄 src/pages/members/Benchmarks/Benchmarks.tsx:
  🎯 Precise route impact:
  📂 In basePrivateRouter.tsx:
    └─ base/benchmarks
    └─ benchmarks
  📂 In guardPrivateRouter.tsx:
    └─ guard/benchmarks
    └─ benchmarks
  📂 In reEngagePrivateRouter.tsx:
    └─ re-engage/benchmarks
    └─ benchmarks
```

### 4. Case-Insensitive Path Handling
```typescript
// Both work the same:
analyzeFile('src/pages/DrillDown/DrillDown.tsx')
analyzeFile('src/pages/Drilldown/Drilldown.tsx')
```

### 5. Framework-Specific Route Detection
- **React Router**: JSX and object-based routes
- **Vue Router**: Component objects with path property
- **Next.js**: File-based routing for both App Router and Pages Router
- **Angular**: RouterModule configuration
- **SvelteKit**: File-based routing in routes/ directory

## Advantages Over Path-Based Detection

### Old Approach (Wrong)
```
src/forms/LoginForm.tsx → /forms/LoginForm ❌
```

### Tree-sitter Approach (Correct)
```
LoginForm.tsx → imported by Login.tsx → routed at "/" and "/login" ✅
```

## Edge Cases Handled

1. **Circular Dependencies**: BFS with visited set prevents infinite loops
2. **Dynamic Imports**: Detects `React.lazy()` patterns
3. **Regular Imports**: Handles all ES6 import variations
4. **Re-exports**: Follows through index files
5. **Multiple Route Files**: Handles distributed route definitions
6. **Error Recovery**: Continues parsing malformed files
7. **Binary Files**: Skips files with null bytes
8. **Large Files**: Skips files over 1MB
9. **Case Sensitivity**: Normalizes paths for consistent results
10. **Component Functions**: Handles `element: Component()` pattern

## Cache Management

### Automatic Caching
YoFix automatically caches the import graph and route analysis:
- **Initial Build**: ~500ms for 500 files
- **Cached Load**: ~20ms
- **Storage**: Uses configured storage provider (Firebase, S3) or local cache

### Cache Invalidation

#### Via Bot Command
```bash
# In PR comments
@yofix cache clear    # Clear all caches
@yofix cache status   # Check cache status
```

#### Via Action Input
```yaml
- uses: LoopKitchen/yofix@v1
  with:
    clear-cache: 'true'  # Force rebuild on this run
```

#### When to Clear Cache
- After major refactoring or file moves
- When import relationships seem outdated
- If route detection is missing files
- After upgrading dependencies

### Cache Storage

#### With Cloud Storage (Firebase/S3)
```
yofix-cache/
└── {repository-name}/
    └── import-graph.json
```
- Persists across all workflow runs
- Shared between PRs and branches
- Automatically updated incrementally

#### With GitHub Storage (Default)
```
.yofix-cache/
└── import-graph.json
```
- Local to current workflow run
- Rebuilt for each workflow
- No persistence between runs

## Configuration

No configuration needed! Tree-sitter automatically:
- Detects framework from imports (React Router, Next.js, etc.)
- Finds route patterns through AST analysis
- Builds accurate import graphs
- Handles any project structure

## Performance Optimization Roadmap

### 🟡 Medium Priority Optimizations

#### 1. Cache Warming Workflow
Pre-build import graphs to eliminate cold starts:

```yaml
# .github/workflows/cache-warmer.yml
name: Warm YoFix Cache
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  push:
    branches: [main]

jobs:
  warm-cache:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v3
        with:
          path: |
            ~/.cache/yofix
            node_modules
            .yofix-cache
          key: yofix-cache-${{ hashFiles('**/package-lock.json') }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Pre-build import graph
        run: |
          npx ts-node scripts/route-impact-improved.ts . --warm-cache
```

#### 2. Fast-Path for Small Changesets
Skip full analysis for small PRs:

```typescript
// In RouteImpactAnalyzer
if (changedFiles.length < 10 && !forceFullAnalysis) {
  // Quick analysis - only parse changed files
  const quickRoutes = await this.quickRouteDetection(changedFiles);
  if (quickRoutes.length > 0) {
    return quickRoutes;
  }
}
```

#### 3. GitHub Workflow Caching
Cache dependencies between workflow runs:

```yaml
# In your GitHub Action
- uses: actions/cache@v3
  with:
    path: |
      node_modules
      ~/.npm
      ~/.cache/tree-sitter
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### 🟢 Advanced Optimizations

#### 4. Background Processing with workflow_dispatch
Split heavy operations:

```yaml
# .github/workflows/analyze-impact-background.yml
name: Background Impact Analysis
on:
  workflow_dispatch:
    inputs:
      pr_number:
        required: true
      comment_id:
        required: true

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - name: Analyze and update comment
        run: |
          # Heavy analysis here
          # Update original comment when done
```

#### 5. Commit Status Updates
Show analysis progress on PR:

```typescript
await octokit.rest.repos.createCommitStatus({
  owner,
  repo,
  sha: headSha,
  state: 'pending',
  description: 'YoFix: Analyzing route impact...',
  context: 'yofix/route-impact'
});
```

#### 6. Cache Analysis Results
Store results by PR + commit SHA:

```typescript
const cacheKey = `impact-${prNumber}-${commitSha}`;
const cached = await storage.downloadFile(`cache/${cacheKey}.json`);

if (cached) {
  return JSON.parse(cached.toString());
}

// ... perform analysis ...

await storage.uploadFile(
  `cache/${cacheKey}.json`,
  Buffer.from(JSON.stringify(result))
);
```

#### 7. GitHub App Architecture (Future)
For sub-second responses:
- Persistent server with warm cache
- WebSocket connections
- Incremental updates
- Shared cache across all repos

### Expected Performance Improvements

| Optimization | Current | Expected | Impact |
|--------------|---------|----------|--------|
| Cold start (first run) | 6 min | 2 min | -66% |
| Warm cache | 6 min | 30 sec | -91% |
| Small PR (<10 files) | 6 min | 15 sec | -96% |
| Cached results | 6 min | 5 sec | -98% |
| GitHub App | 6 min | <1 sec | -99% |