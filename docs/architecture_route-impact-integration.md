# Route Impact Analysis - Integration Architecture

## Overview

This document validates the integration of route impact analysis in YoFix, ensuring all components work in sync after refactoring the core logic to `TreeSitterRouteAnalyzer`.

## Architecture Flow

```
GitHub PR Comment
    ↓
YoFixBot.handleIssueComment()
    ↓
CommandParser.parse() → "impact" command
    ↓
CommandHandler.execute() → handleImpact()
    ↓
ImpactCommandHandler.execute()
    ↓
RouteImpactAnalyzer.analyzePRImpact()
    ↓
TreeSitterRouteAnalyzer (Core Logic)
    ├── getRouteInfo() - Routes affected by changes
    └── findRoutesServingComponent() - NEW: Routes serving components
```

## Components Integration

### 1. **TreeSitterRouteAnalyzer** (Core Logic)
Located at: `src/core/analysis/TreeSitterRouteAnalyzer.ts`

**Core Methods:**
- `getRouteInfo(changedFiles)` - Finds routes affected by file changes
- `findRoutesServingComponent(componentFile)` - NEW: Reverse lookup to find routes serving a component
- `findComponentAlias()` - Handles lazy imports, aliases
- `findRouteObjects()` - Extracts route configs from AST
- `extractRoutePath()` - Gets path from route object
- `extractRouteComponent()` - Gets component from route object

### 2. **RouteImpactAnalyzer** (Business Logic)
Located at: `src/core/analysis/RouteImpactAnalyzer.ts`

**Enhanced to use new methods:**
```typescript
// Step 6: Enhanced - Find which routes serve changed components
const servingRoutes = await this.routeAnalyzer.findRoutesServingComponent(changedFile);
```

**Enhanced Output:**
- Now includes `componentRouteMapping` in RouteImpactTree
- `formatImpactTree()` displays which routes serve components

### 3. **Bot Integration**
- `YoFixBot` → Handles GitHub comments
- `CommandHandler` → Routes to appropriate handler
- `ImpactCommandHandler` → Uses RouteImpactAnalyzer via factory pattern

### 4. **Script** (UI Only)
Located at: `scripts/route-impact-improved.ts`
- Now only handles UI/formatting
- All core logic moved to TreeSitterRouteAnalyzer

## Example GitHub Comment Output

When someone comments `@yofix impact`, the bot will now show:

```markdown
## 🌳 Route Impact Tree

📊 **5** files changed → **3** routes affected

🎯 **Component Usage** (routes that serve these components):
- `Test.tsx` served by:
  - `debugger` in index.tsx
- `DrillDown.tsx` served by:
  - `drill-down/:name` in basePrivateRouter.tsx

⚠️ **Shared Components** (changes affect multiple routes):
- `Button.tsx` → affects `/dashboard`, `/settings`

```Route Tree:
├── /dashboard
│   ├── Button.tsx (shared component)
│   └── Dashboard.module.css (styles)
└── /settings
    └── Button.tsx (shared component)
```

## Validation Checklist

✅ **Core Logic Centralized**
- All route analysis logic is in TreeSitterRouteAnalyzer
- No duplication between script and core

✅ **GitHub Comments Integration**
- `@yofix impact` command uses RouteImpactAnalyzer
- RouteImpactAnalyzer uses TreeSitterRouteAnalyzer methods
- Enhanced output shows routes serving components

✅ **Backward Compatibility**
- Existing `getRouteInfo()` still works
- New `findRoutesServingComponent()` is additive

✅ **Performance**
- Tree-sitter parsing for speed
- Caching mechanisms in place
- Incremental updates supported

## Testing the Integration

1. **GitHub Comment Test:**
   ```bash
   # In a PR, comment:
   @yofix impact
   ```

2. **Script Test:**
   ```bash
   ts-node scripts/route-impact-improved.ts ../loop-frontend src/pages/members/Testing/Test.tsx
   ```

Both should show:
- Routes affected by the change (forward lookup)
- Routes serving the component (reverse lookup)

## Summary

The system is now properly integrated with:
1. Core logic centralized in TreeSitterRouteAnalyzer
2. Enhanced RouteImpactAnalyzer using new methods
3. GitHub comments showing comprehensive route impact
4. Clean separation between core logic and UI presentation