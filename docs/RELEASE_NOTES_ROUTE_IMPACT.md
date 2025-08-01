# Release Notes - Route Impact Tree Feature

## New Feature: Route Impact Tree 🌳

YoFix now automatically analyzes and displays which routes are affected by file changes in your PR.

### What's New

1. **Automatic Route Impact Analysis**
   - Automatically posts a route impact tree when YoFix runs on a PR
   - Shows only routes affected by changed files
   - No configuration needed - works out of the box

2. **Smart File Tracking**
   - Tracks direct route file changes
   - Identifies component changes and their impact
   - Detects style changes (CSS, SCSS, CSS Modules)
   - Highlights shared components that affect multiple routes

3. **Bot Command**
   - `@yofix impact` - Generate route impact tree on demand
   - Useful for re-analyzing after additional commits

### Example Output

```
## 🌳 Route Impact Tree

📊 **5** files changed → **3** routes affected

⚠️ **Shared Components** (changes affect multiple routes):
- `Button.tsx` → affects `/`, `/products`, `/checkout`

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

### Technical Details

- Uses AST parsing for accurate dependency analysis
- No AI hallucination - 100% deterministic
- Supports React, Next.js, Vue, and Angular projects
- Traces import statements to build component graph
- Efficient caching for large codebases

### Benefits

- **Visual Clarity**: Instantly see which routes need testing
- **Review Efficiency**: Helps reviewers understand change scope
- **Testing Focus**: Test only affected routes, saving CI time
- **Shared Component Awareness**: Know when changes have wide impact

### Migration

No migration needed! The feature activates automatically on your next PR.

### Dependencies Added

- `@babel/parser`: For AST parsing
- `@babel/traverse`: For walking the AST
- `@babel/types`: For AST type checking

These are now included as runtime dependencies to ensure proper functionality in GitHub Actions.