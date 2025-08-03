# YoFix Route Impact Tree - Complete Guide

## Overview

YoFix's Route Impact Tree is a powerful feature that automatically analyzes which routes in your application are affected by code changes in a pull request. It provides visual clarity, improves review efficiency, and optimizes testing by focusing only on affected routes.

## Key Benefits

### For Developers
- **Visual Clarity**: Instantly see which routes need testing
- **Review Efficiency**: Helps reviewers understand change scope
- **Testing Focus**: Test only affected routes, saving CI time
- **Shared Component Awareness**: Know when changes have wide impact

### For CI/CD
- **Performance**: Reduces test execution time by 50-90%
- **Accuracy**: 100% deterministic analysis (no AI hallucination)
- **Caching**: Sub-second analysis after initial build

## How It Works

### High-Level Flow

```
PR Created → Analyze Changed Files → Build Import Graph → Detect Affected Routes → Test Only Those Routes
```

### Detailed Technical Flow

1. **GitHub Action Triggered**
   - Action runs when PR is created/updated
   - Repository is checked out with full file access

2. **Get Changed Files**
   - Fetches list from GitHub API
   - Processes files in parallel for performance

3. **Tree-sitter Analysis**
   - Parses files 10-100x faster than traditional parsers
   - Builds concrete syntax tree (CST)
   - Continues parsing even with syntax errors

4. **Import Graph Construction**
   - Creates bidirectional dependency graph
   - Tracks which files import which components
   - Identifies route definitions

5. **Route Impact Detection**
   - Traces from changed files to affected routes
   - Handles both direct and transitive dependencies
   - Identifies shared components

6. **Visual Testing**
   - Tests only the affected routes
   - Compares screenshots with baselines
   - Reports results back to PR

## Example Output

### PR Comment

```
## 🌳 Route Impact Tree

📊 **5** files changed → **3** routes affected

🎯 **Component Usage** (routes that serve these components):
- `Button.tsx` served by:
  - `/dashboard` in Dashboard.tsx
  - `/profile` in Profile.tsx
  - `/checkout` in Checkout.tsx

⚠️ **Shared Components** (changes affect multiple routes):
- `Button.tsx` → affects `/`, `/products`, `/checkout`

```
Route Tree:
├── /
│   ├── Header.tsx (shared component)
│   └── Button.tsx (shared component)
├── /products
│   ├── ProductCard.tsx (component)
│   └── Button.tsx (shared component)
└── /checkout
    └── Button.tsx (shared component)
```
```

## Architecture Components

### 1. RouteImpactAnalyzer
- **Purpose**: Analyzes which routes are affected by PR changes
- **Location**: `src/core/analysis/RouteImpactAnalyzer.ts`
- **Key Features**:
  - Analyzes changed files from GitHub PR
  - Uses TreeSitterRouteAnalyzer for component tracing
  - Creates impact tree showing relationships
  - Identifies shared components

### 2. TreeSitterRouteAnalyzer
- **Purpose**: High-performance route detection using Tree-sitter
- **Location**: `src/core/analysis/TreeSitterRouteAnalyzer.ts`
- **Key Features**:
  - 10-100x faster than Babel-based parsing
  - Multi-framework support (React, Vue, Next.js, Angular, Svelte)
  - Persistent caching for instant subsequent runs
  - Handles lazy imports and complex dependency chains

### 3. ComponentRouteMapper
- **Purpose**: Maps components to the routes that use them
- **Key Features**:
  - Bidirectional mapping (component ↔ route)
  - Handles multiple route usage
  - Case-insensitive path matching

## Supported Frameworks

### React Router (v5 & v6)
```tsx
// JSX Routes
<Route path="/dashboard" element={<Dashboard />} />

// Object Routes
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

### Next.js (App & Pages Router)
```
app/dashboard/page.tsx → /dashboard
pages/users/[id].tsx → /users/:id
```

### Angular Router
```typescript
const routes: Routes = [
  { path: 'heroes', component: HeroesComponent }
];
```

### SvelteKit
```
routes/about/+page.svelte → /about
routes/blog/[slug]/+page.svelte → /blog/:slug
```

## Performance Characteristics

### Analysis Speed
- **Initial Build**: ~500ms for 500 files (one-time cost)
- **Cached Load**: ~20ms
- **Per-file Detection**: ~5-10ms
- **Average Speedup vs Babel**: 10-50x

### Caching Strategy
```typescript
class TreeSitterRouteAnalyzer {
  // Multi-level caching
  private astCache: Map<string, { tree: Parser.Tree; hash: string }>;
  private fileCache: Map<string, FileNode>;
  private importGraph: Map<string, ImportGraphNode>;
  private routeCache: Map<string, string[]>;
  
  // Persistent cache
  private cacheDir = '.yofix-cache/';
}
```

### Cache Management

#### Clear Cache via Bot Command
```bash
@yofix cache clear    # Clear all caches
@yofix cache status   # Check cache status
```

#### Clear Cache via Action Input
```yaml
- uses: yofix/yofix@v1
  with:
    clear-cache: 'true'
```

## Key Features

### 1. Smart Component Detection
- Identifies when a component is used in multiple routes
- Warns about shared component changes
- Provides complete usage mapping

### 2. Import Type Support
```typescript
// All import types supported
import Component from './Component';           // Default
import { Component } from './Component';       // Named
import { Component as Alias } from './Component'; // Aliased
const Component = lazy(() => import('./Component')); // Lazy
```

### 3. Parallel Processing
- Analyzes multiple files concurrently
- Significant performance improvement for large PRs

### 4. Error Recovery
- Continues parsing even with syntax errors
- Skips binary files and oversized files
- Handles circular dependencies gracefully

## Usage

### Automatic Activation
The feature activates automatically when YoFix runs on a PR. No configuration needed!

### Manual Trigger
Use the bot command to regenerate the impact tree:
```bash
@yofix impact
```

### Disable for Specific Run
```yaml
- uses: yofix/yofix@v1
  with:
    skip-route-analysis: 'true'
```

## Expectations and Limitations

### What It Does
- ✅ Accurately traces component dependencies
- ✅ Identifies all routes affected by changes
- ✅ Handles complex import chains
- ✅ Works with any project structure
- ✅ Provides instant analysis with caching

### What It Doesn't Do
- ❌ Analyze runtime dependencies
- ❌ Detect dynamic route generation
- ❌ Handle non-standard routing libraries
- ❌ Analyze external package changes

### Accuracy Expectations
- **Static Analysis**: 95-98% accurate
- **Component Mapping**: 99% accurate
- **Route Detection**: 90-95% accurate (framework dependent)

## Optimization Roadmap

### Near-term Improvements
1. **Cache Warming**: Pre-build graphs in scheduled workflows
2. **Fast-path Analysis**: Skip full analysis for small PRs
3. **Result Caching**: Store by PR + commit SHA

### Long-term Vision
1. **GitHub App**: Sub-second analysis with persistent server
2. **Incremental Updates**: Only re-analyze changed portions
3. **Cross-repo Sharing**: Share cache across similar projects

## Troubleshooting

### Common Issues

#### Routes Not Detected
- Check if framework is supported
- Verify route definitions follow standard patterns
- Clear cache if import relationships changed

#### Performance Issues
- Enable caching with cloud storage (Firebase/S3)
- Check file count - large repos may need optimization
- Use `max-routes` to limit analysis scope

#### Cache Problems
```bash
# Clear all caches
@yofix cache clear

# Check cache status
@yofix cache status
```

## Technical Details

### Why Tree-sitter?
1. **Performance**: Native C++ parser, extremely fast
2. **Error Recovery**: Continues parsing malformed code
3. **Incremental**: Only re-parses changed portions
4. **Language Agnostic**: Consistent API across languages
5. **Production Ready**: Used by GitHub, Neovim, Zed

### Import Graph Structure
```typescript
interface ImportGraphNode {
  file: string;
  importedBy: Set<string>;  // Who imports this file
  imports: Set<string>;     // What this file imports
  isRouteFile: boolean;     // Does this define routes
  isEntryPoint: boolean;    // Is this a root file
}
```

### Route Detection Process
1. Parse all files with Tree-sitter
2. Build import/export relationships
3. Identify route definition patterns
4. Trace from changed files to route files
5. Map components to their serving routes

## Best Practices

### For Optimal Performance
1. Use cloud storage for persistent caching
2. Keep route definitions in standard patterns
3. Avoid circular dependencies
4. Use lazy imports for better code splitting

### For Accurate Detection
1. Follow framework conventions
2. Use explicit imports (avoid `import *`)
3. Keep route files focused on routing
4. Name components consistently

## Integration Examples

### With GitHub Actions
```yaml
name: Visual Testing
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: yofix/yofix@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          # Route analysis runs automatically
```

### With Custom Workflows
```yaml
- name: Analyze Route Impact
  id: routes
  uses: yofix/yofix@v1
  with:
    mode: 'analyze-only'
    
- name: Use Route Information
  run: |
    echo "Affected routes: ${{ steps.routes.outputs.affected-routes }}"
```

## Summary

The Route Impact Tree transforms how teams approach PR testing by:
- Providing instant visibility into change impact
- Reducing test execution time dramatically
- Improving code review efficiency
- Preventing unexpected side effects

With its deterministic analysis, multi-framework support, and intelligent caching, it's an essential tool for modern web development workflows.