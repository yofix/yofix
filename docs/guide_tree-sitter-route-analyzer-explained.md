# TreeSitterRouteAnalyzer: Complete Technical Explanation

## Overview

The `TreeSitterRouteAnalyzer` is a high-performance route impact analysis tool that uses Tree-sitter (a parser generator) to build an import dependency graph and detect which routes are affected by file changes. It's 10-100x faster than traditional Babel-based parsing.

## Core Concept

The analyzer solves this problem: **"When I change file X, which routes in my application are affected?"**

## Input and Output

### Input
```typescript
// Primary input: Array of changed file paths
const changedFiles = [
  'src/pages/members/Testing/Test.tsx',
  'src/components/Button.tsx'
];

// Configuration
const analyzer = new TreeSitterRouteAnalyzer(
  rootPath,           // Project root directory
  storageProvider     // Optional: For caching the import graph
);
```

### Output
```typescript
// Output: Map of file → affected routes
Map {
  'src/pages/members/Testing/Test.tsx' => ['debugger'],
  'src/components/Button.tsx' => ['dashboard', 'settings', 'profile']
}
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  TreeSitterRouteAnalyzer                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. AST Parser Layer (Tree-sitter)                         │
│     - TypeScript Parser                                      │
│     - TSX Parser                                            │
│     - JavaScript Parser                                      │
│                                                              │
│  2. Data Structures                                          │
│     - Import Graph (Directed Graph)                         │
│     - File Cache (AST + Metadata)                          │
│     - Route Cache (File → Routes mapping)                   │
│     - Component → Routes mapping                            │
│                                                              │
│  3. Analysis Algorithms                                      │
│     - BFS Traversal (Import backtracking)                   │
│     - Regex Pattern Matching (Route extraction)             │
│     - Component Resolution (Alias tracking)                 │
│                                                              │
│  4. Persistence Layer                                        │
│     - Local cache (.yofix-cache/)                          │
│     - Cloud storage (Firebase/S3)                          │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Logic

### 1. Building the Import Graph

The analyzer first builds a complete import dependency graph of the codebase:

```typescript
interface ImportGraphNode {
  file: string;
  importedBy: Set<string>;  // Who imports this file (reverse edges)
  imports: Set<string>;     // What this file imports (forward edges)
  isRouteFile: boolean;     // Does this file define routes?
  isEntryPoint: boolean;    // Is this a root file?
}
```

**Process:**
1. Scan all code files (`.ts`, `.tsx`, `.js`, `.jsx`, `.vue`, `.svelte`)
2. Parse each file with Tree-sitter to extract:
   - Import statements (`import X from 'Y'`)
   - Dynamic imports (`lazy(() => import('X'))`)
   - Export statements
   - Route definitions
3. Build bidirectional graph edges

### 2. Route Extraction

Routes are extracted using a hybrid approach:

#### A. Regex Pattern Matching
```typescript
// Handles { path: 'route', element: <Component /> }
const objectRouteRegex = /\{\s*path:\s*['"`]([^'"`]+)['"`]\s*,\s*(?:element|component):\s*<(\w+)[^>]*\/>/g;
```

#### B. AST Pattern Matching
```typescript
// Handles <Route path="/dashboard" element={<Dashboard />} />
const jsxElements = tree.rootNode.descendantsOfType('jsx_element');
```

#### C. Framework-Specific Detection
- **Next.js**: File-based routing in `/pages/` or `/app/`
- **SvelteKit**: File-based routing in `/routes/`
- **Vue Router**: Object-based route definitions
- **Angular**: RouterModule configurations

### 3. Impact Analysis Algorithm

The core algorithm uses **Breadth-First Search (BFS)** to traverse the import graph backwards:

```typescript
private async detectRoutesForFile(filePath: string): Promise<string[]> {
  const routes = new Set<string>();
  const visited = new Set<string>();
  
  // BFS queue: start from changed file
  const queue = [{ file: filePath, depth: 0, chain: [filePath] }];
  
  while (queue.length > 0) {
    const { file, depth, chain } = queue.shift()!;
    
    if (visited.has(file)) continue;
    visited.add(file);
    
    const node = this.importGraph.get(file);
    if (!node) continue;
    
    // Check if this file defines routes
    if (node.isRouteFile) {
      // Find routes that use components from our import chain
      const connectedRoutes = this.getConnectedRoutes(fileNode, filePath, chain);
      connectedRoutes.forEach(r => routes.add(r));
    }
    
    // Continue BFS - add all importers
    for (const importer of node.importedBy) {
      if (!visited.has(importer)) {
        queue.push({ 
          file: importer, 
          depth: depth + 1,
          chain: [...chain, importer]
        });
      }
    }
  }
  
  return Array.from(routes);
}
```

## Mathematical Model

### 1. Graph Theory Foundation

The import dependencies form a **Directed Acyclic Graph (DAG)**:

- **Vertices (V)**: All source files in the project
- **Edges (E)**: Import relationships (A imports B = edge from A to B)
- **Reverse Graph**: For efficiency, we maintain reverse edges (B is imported by A)

### 2. Route Impact Calculation

Given a changed file `f`, the set of impacted routes `R(f)` is calculated as:

```
R(f) = ⋃ Routes(r) where r ∈ ReachableRouteFiles(f)
```

Where:
- `ReachableRouteFiles(f)` = All route files reachable from `f` via reverse import edges
- `Routes(r)` = Set of routes defined in route file `r`

### 3. Component Mapping Function

For precise impact analysis, we use a component mapping function:

```
ComponentToRoutes: Component → Set<Route>
```

This handles cases where:
- Components are imported with aliases
- Lazy imports use different names
- Components are re-exported through index files

### 4. Time Complexity

- **Graph Building**: O(n × m) where n = number of files, m = average imports per file
- **Route Detection**: O(k + e) where k = nodes visited, e = edges traversed
- **Cache Hit**: O(1) for repeated queries

## Execution Flow Example

Let's trace through a concrete example:

### Input
```typescript
// Changed file: src/pages/members/Testing/Test.tsx
const changedFiles = ['src/pages/members/Testing/Test.tsx'];
```

### Step 1: Initialize
```typescript
await analyzer.initialize();
// Loads or builds import graph
// Detects framework type (react-router)
```

### Step 2: Process Changed File
```typescript
// Parse Test.tsx with Tree-sitter
const tree = parser.parse(fileContent);

// Extract imports
// Test.tsx has no imports in this case

// Extract exports
// Test.tsx exports: ['default']
```

### Step 3: Find Routes Using BFS
```
Starting from: src/pages/members/Testing/Test.tsx

BFS Queue:
1. Test.tsx (depth: 0)
   ↓ imported by
2. src/routes/MemberRouter.tsx (depth: 1)
   - Is route file? YES
   - Check routes...
   
Route found: { path: 'debugger', element: <Debugger /> }
- Debugger is alias for Test component
- Therefore, Test.tsx affects route: 'debugger'
```

### Step 4: Component Mapping Verification
```typescript
// The analyzer also checks component mapping
findRoutesServingComponent('Test.tsx')
// Finds: MemberRouter imports Test as Debugger
// Confirms: route 'debugger' uses this component
```

### Step 5: Return Results
```typescript
Map {
  'src/pages/members/Testing/Test.tsx' => ['debugger']
}
```

## Key Features

### 1. Hybrid Parsing Approach
- **AST Parsing**: For accurate import/export analysis
- **Regex Patterns**: For flexible route object detection
- **Result**: Handles both standard and non-standard route definitions

### 2. Lazy Import Resolution
```typescript
// Handles: const Debugger = lazy(() => import('./Test'))
const lazyImportRegex = /const\s+(\w+)\s*=\s*lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
```

### 3. Directory Import Resolution
```typescript
// Connects: import X from './components' → ./components/index.tsx
private connectDirectoryImports(): void {
  const indexVariants = ['/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
  // ... connects directory imports to their index files
}
```

### 4. Multi-Level Caching
```typescript
// 1. AST Cache: Parsed syntax trees
private astCache: Map<string, { tree: Parser.Tree; hash: string }>;

// 2. File Cache: Processed file metadata
private fileCache: Map<string, FileNode>;

// 3. Route Cache: File → Routes mapping
private routeCache: Map<string, string[]>;

// 4. Persistent Cache: Import graph saved to disk/cloud
```

## Performance Optimizations

1. **Incremental Updates**: Only reprocess changed files
2. **Batch Processing**: Process files in batches of 50
3. **Early Termination**: Skip large files (>1MB) and binary files
4. **Cache Everything**: AST, file metadata, route mappings
5. **Reverse Graph**: Use `importedBy` for efficient backtracking

## Route Detection Patterns

### 1. React Router v6
```typescript
// Object pattern
{ path: 'dashboard', element: <Dashboard /> }

// JSX pattern
<Route path="/dashboard" element={<Dashboard />} />

// Nested routes
{
  path: 'users',
  children: [
    { path: 'profile', element: <Profile /> }
  ]
}
```

### 2. File-Based Routing
```typescript
// Next.js
app/dashboard/page.tsx → /dashboard
pages/users/[id].tsx → /users/:id

// SvelteKit
routes/about/+page.svelte → /about
```

## Error Handling

The analyzer is resilient to:
- Parse errors (falls back to TSX parser)
- Missing files (returns empty node)
- Circular imports (uses visited set)
- Invalid imports (filters external packages)

## Summary

The TreeSitterRouteAnalyzer efficiently answers "what routes are affected by this change?" by:

1. **Building** a complete import dependency graph using Tree-sitter
2. **Extracting** routes using hybrid AST + regex parsing
3. **Traversing** the graph backwards from changed files
4. **Mapping** components to routes for precise impact analysis
5. **Caching** everything for sub-millisecond repeated queries

This approach scales to large codebases while maintaining accuracy for complex import patterns like lazy loading, aliases, and re-exports.