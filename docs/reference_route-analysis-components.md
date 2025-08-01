# YoFix Route Analysis Components

## Overview

YoFix has two distinct route analysis components that serve different purposes:

## 1. RouteImpactAnalyzer

**Location**: `src/core/analysis/RouteImpactAnalyzer.ts`

**Purpose**: Analyzes which routes are affected by code changes in a PR

**When it runs**: During PR analysis in the main YoFix action

**Key features**:
- Analyzes changed files from GitHub PR
- Uses TreeSitterRouteAnalyzer to trace component usage
- Identifies shared components that affect multiple routes
- Creates an impact tree showing relationships

**Example usage**:
```typescript
const analyzer = new RouteImpactAnalyzer(githubToken);
const impactTree = await analyzer.analyzePRImpact(prNumber);

// Result shows which routes need testing based on what changed
// If Header.tsx changed and is used in /dashboard and /profile,
// both routes will be marked as affected
```

**Output**:
```javascript
{
  affectedRoutes: [
    {
      route: '/dashboard',
      directChanges: [],
      componentChanges: ['src/components/Header.tsx'],
      sharedComponents: ['Header']
    },
    {
      route: '/profile',
      directChanges: [],
      componentChanges: ['src/components/Header.tsx'],
      sharedComponents: ['Header']
    }
  ],
  sharedComponents: Map { 'Header' => ['/dashboard', '/profile'] }
}
```

## 2. modules/route-extractor

**Location**: `src/modules/route-extractor.ts`

**Purpose**: Discovers all routes that exist in the codebase

**When it runs**: As a standalone module in the modular action

**Key features**:
- Scans common route definition files
- Uses tree-sitter for AST-based extraction
- Falls back to regex patterns if tree-sitter fails
- No dependency on PR or changed files

**Example usage**:
```bash
# Run as standalone module
INPUT_PREVIEW_URL=https://example.com INPUT_MAX_ROUTES=10 node dist/modules/route-extractor.js
```

**Output**:
```javascript
[
  { path: '/', title: 'Home', priority: 100 },
  { path: '/dashboard', title: 'Dashboard', priority: 80 },
  { path: '/settings', title: 'Settings', priority: 80 },
  { path: '/profile', title: 'Profile', priority: 80 }
]
```

## Key Differences

| Aspect | RouteImpactAnalyzer | route-extractor |
|--------|-------------------|-----------------|
| **Input** | PR number & changed files | Nothing (scans codebase) |
| **Output** | Routes affected by changes | All routes in codebase |
| **Use case** | "What routes should I test?" | "What routes exist?" |
| **Dependency** | Requires GitHub context | Standalone |
| **Analysis depth** | Deep (component relationships) | Surface (route paths) |
| **Performance** | Analyzes only changed files | Scans entire codebase |

## When to Use Which

### Use RouteImpactAnalyzer when:
- Running visual tests on a PR
- You want to test only affected routes
- You need to understand component relationships
- Performance is important (test less)

### Use route-extractor when:
- Running standalone/modular tests
- You need a list of all routes
- No PR context available
- Want to test specific routes by discovery

## Integration in YoFix

### Main Action Flow:
```
PR Created → RouteImpactAnalyzer → Test only affected routes
```

### Modular Action Flow:
```
Manual trigger → route-extractor → Test discovered routes
```

Both components use tree-sitter for accuracy but serve different workflow needs.