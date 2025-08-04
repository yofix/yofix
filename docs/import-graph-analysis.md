# Import Graph Analysis - BFS Backtracking

## Import Chain Example

Starting from a changed file and backtracking to find routes:

```
LeaderboardTable/index.tsx (CHANGED FILE)
    ↑ imported by
LeaderboardWrapper/index.tsx
    ↑ imported by  
LeaderboardComp.tsx
    ↑ imported by
Leaderboard/index.tsx
    ↑ imported by (lazy)
basePrivateRouter.tsx (DEFINES ROUTES)
```

## How BFS Backtracking Works

1. **Build Import Graph** (Forward Direction):
   ```
   File A imports File B → importGraph[B] = A
   ```

2. **Build Reverse Import Graph** (Who imports me?):
   ```
   importedBy[FileB] = Set(FileA, FileC, ...)
   ```

3. **BFS from Changed File**:
   ```
   Queue: [LeaderboardTable]
   Visit LeaderboardTable → Find who imports it
   Add LeaderboardWrapper to queue
   Continue until we find files that define routes
   ```

## Key Differences Between Analyzers

### PureRouteAnalyzer (Working)
- Uses `importedBy` map correctly
- BFS traverses from changed file → files that import it → routes
- Handles lazy imports with proper AST parsing

### TreeSitterRouteAnalyzer (Broken)
- Has import graph but doesn't use BFS properly
- Tries to find routes directly in changed files
- Missing the backtracking logic

## The Fix Needed

TreeSitterRouteAnalyzer needs to:
1. Build `importedBy` map (reverse import graph)
2. Use BFS to traverse from changed files
3. Find all files that eventually import the changed file
4. Check those files for route definitions