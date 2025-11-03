# Deprecation Guide

This document lists deprecated and removed features, with migration paths where applicable.

## Removed Features (November 2024)

### Route Analysis Modules (REMOVED)

**What was removed:**
- `src/core/analysis/TreeSitterRouteAnalyzer.ts`
- `src/core/analysis/RouteImpactAnalyzer.ts`
- `src/core/analysis/ComponentRouteMapper.ts`
- `src/core/analysis/AIRouteDiscovery.ts`
- `src/core/analysis/ConfidenceScorer.ts`

**Reason:** Route analysis is now handled by the external `route-impact-analyzer` package, which provides better accuracy through Claude AI integration.

**Migration Path:**
Use `ThirdPartyRouteImpactAnalyzer` which wraps the `route-impact-analyzer` package:

```typescript
// Old (REMOVED)
import { TreeSitterRouteAnalyzer } from '../core/analysis/TreeSitterRouteAnalyzer';
const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
await analyzer.initialize();
const routes = await analyzer.detectRoutes(files);

// New
import { analyzeRoutesWithExternalTool } from '../core/analysis/ThirdPartyRouteImpactAnalyzer';
const result = await analyzeRoutesWithExternalTool(prFiles, previewUrl);
const routes = result.routes;
```

---

### CodebaseAnalyzer & Context System (REMOVED)

**What was removed:**
- `src/context/CodebaseAnalyzer.ts`
- `src/context/EnhancedContextProvider.ts`
- `src/context/types.ts`
- All Babel dependencies (`@babel/parser`, `@babel/traverse`, `@babel/types`)

**Reason:** The CodebaseAnalyzer used Babel to parse the entire codebase for routes, components, and patterns. This added complexity and bundle size (~1.6MB) but provided minimal value since:
1. Route detection is now external (`route-impact-analyzer`)
2. Fix generation works without codebase context
3. The AST parsing was slow and resource-intensive

**Migration Path:**
No migration needed. Features that used CodebaseContext (FixGenerator, CommandHandler) now work without it.

```typescript
// Old (REMOVED)
const analyzer = new CodebaseAnalyzer();
const context = await analyzer.analyzeRepository();
const fixGenerator = new FixGenerator(claudeApiKey, context);

// New
const fixGenerator = new FixGenerator(claudeApiKey);
// Fix generation uses AI prompts without codebase context
```

---

### Redundant "Smart/Dynamic" Wrappers (REMOVED & RENAMED)

**What was removed:**
- `src/core/fixes/FixGenerator.ts` (old wrapper) - Delegated to SmartFixGenerator (~65 lines)
- `src/core/fixes/PatternMatcher.ts` - Unused pattern matching utility
- `src/core/baseline/BaselineManager.ts` (old version) - Superseded by DynamicBaselineManager (~286 lines)
- `src/core/baseline/BaselineStorage.ts` - Superseded by DynamicBaselineManager's storage (~268 lines)

**What was renamed:**
- `SmartFixGenerator.ts` → `FixGenerator.ts` (now the only fix generator)
- `DynamicBaselineManager.ts` → `BaselineManager.ts` (now the only baseline manager)
- `SmartAuthHandler.ts` → `AuthHandler.ts` (now the only auth handler)

**Reason:** Files had confusing "Smart/Dynamic" adjectives from when multiple versions existed. After removing inferior versions, we renamed to clean, generic names.

**Migration Path:**
```typescript
// Old (REMOVED/RENAMED)
import { FixGenerator } from '../core/fixes/FixGenerator'; // This was the wrapper
import { SmartFixGenerator } from '../core/fixes/SmartFixGenerator';
import { DynamicBaselineManager } from '../core/baseline/DynamicBaselineManager';
import { SmartAuthHandler } from '../github/SmartAuthHandler';

// New (CURRENT)
import { FixGenerator } from '../core/fixes/FixGenerator'; // This is now SmartFixGenerator renamed
import { BaselineManager } from '../core/baseline/BaselineManager'; // This is now DynamicBaselineManager renamed
import { AuthHandler } from '../github/AuthHandler'; // This is now SmartAuthHandler renamed
```

**Total Lines Removed:** ~619 lines of redundant code

---

### Legacy Visual Tester Modules (REMOVED)

**What was removed:**
- `src/modules/visual-tester.ts`
- `src/modules/visual-tester-v2.ts`
- `src/modules/visual-tester-llm.ts`

**Reason:** Dead code. Superseded by `DeterministicRunner` and browser-agent system.

**Migration Path:**
Use the deterministic testing system:

```typescript
// Old (REMOVED)
import { VisualTester } from './modules/visual-tester';

// New
import { DeterministicRunner } from './core/deterministic/DeterministicRunner';
import { DeterministicVisualAnalyzer } from './core/deterministic/visual/DeterministicVisualAnalyzer';
```

---

### Browser-Agent Advanced Features (REMOVED)

**What was removed:**
- `src/browser-agent/core/OptimizedAgent.ts`
- `src/browser-agent/core/ParallelOrchestrator.ts`
- `src/browser-agent/core/VisionMode.ts`
- `src/browser-agent/workflow/WorkflowExecutor.ts`
- `src/browser-agent/workflow/WorkflowRecorder.ts`
- `src/browser-agent/examples/`
- `src/browser-agent/test/`

**Reason:** Over-engineered features that were fully implemented but never used in production. The basic `Agent` class provides sufficient functionality for current needs.

**Kept:**
- `src/browser-agent/core/Agent.ts` - Basic browser automation
- `src/browser-agent/core/TaskPlanner.ts` - Used by Agent
- `src/browser-agent/core/ReliabilityScorer.ts` - Used by Agent
- `src/browser-agent/core/VerificationFeedbackHandler.ts` - Used by Agent
- `src/browser-agent/core/ContextAwareElementFinder.ts` - Used by actions

**Migration Path:**
Use the basic `Agent` class for browser automation:

```typescript
import { Agent } from './browser-agent/core/Agent';

const agent = new Agent(command, {
  headless: true,
  apiKey: claudeApiKey,
  viewport: { width: 1920, height: 1080 }
});

await agent.initialize();
const result = await agent.run();
```

---

### Security Sandbox (REMOVED)

**What was removed:**
- `src/automation/security/BrowserSecuritySandbox.ts`

**Reason:** Never integrated or used. Browser security is handled by Playwright's built-in sandbox.

**Migration Path:**
No migration needed. Playwright provides sufficient security isolation.

---

### PR Reporting (DEPRECATED)

**Status:** Still present but deprecated

**Deprecated:**
- `src/github/PRReporter.ts` - Marked with `@deprecated` but still in use
- `src/github/RobustPRReporter.ts` - REMOVED (was test-only)

**Recommended:**
- `src/core/github/GitHubCommentEngine.ts` - New centralized PR comment system

**Migration Path:**
```typescript
// Old (DEPRECATED but still works)
import { PRReporter } from './github/PRReporter';
const reporter = new PRReporter();
await reporter.postComment(prNumber, body);

// New (RECOMMENDED)
import { getGitHubCommentEngine } from './core';
const commentEngine = getGitHubCommentEngine();
await commentEngine.postComment({
  prNumber,
  body,
  commentId: 'yofix-results'
});
```

**Note:** PRReporter will be fully removed in a future release. Update code to use GitHubCommentEngine.

---

### Bot Commands (REMOVED)

**What was removed:**
- `@yofix impact` - Show route impact tree
- `@yofix cache clear` - Clear route analysis cache
- `@yofix cache status` - Check cache status

**Reason:** These commands depended on the removed TreeSitterRouteAnalyzer. Route impact is now displayed automatically in PR comments via `route-impact-analyzer` integration.

**Migration Path:**
Route impact is automatically shown in PR comments when the action runs. No manual command needed.

---

### CLI Commands (REMOVED)

**What was removed:**
- `yofix analyze <file>` - Analyze which routes are impacted by a file

**Reason:** Depended on TreeSitterRouteAnalyzer. Route analysis now happens via GitHub Action integration with `route-impact-analyzer`.

**Migration Path:**
Run the GitHub Action on a PR to see route impact analysis automatically.

---

### Test Files & Scripts (REMOVED)

**What was removed:**
- `/test-firebase-upload.js` - Root-level test script
- `/test-import-graph.js` - Root-level test script (wrong project path)
- Various manual test scripts in `/tests/` directory

**Reason:** These were manual testing scripts not integrated into the Jest test suite.

**Migration Path:**
Use the official test suite:
```bash
yarn test  # Run Jest tests
yarn test:local  # Run local integration tests
```

---

## Still Active But May Change

---

### Config System

**Current State:**
Two config systems coexist:
- `src/config/` - Old static config
- `src/core/config/ConfigurationManager.ts` - New centralized config

**Future Plan:**
Full migration to ConfigurationManager planned.

**Recommendation:**
Use ConfigurationManager for new code:

```typescript
import { getConfiguration } from './core/hooks/ConfigurationHook';
const config = getConfiguration();
const value = config.getInput('key');
```

---

## Breaking Changes Summary

### Removed Exports

These imports will fail or have changed:
```typescript
// FAILS - Removed
import { TreeSitterRouteAnalyzer } from './core/analysis/TreeSitterRouteAnalyzer';
import { RouteImpactAnalyzer } from './core/analysis/RouteImpactAnalyzer';
import { CodebaseAnalyzer } from './context/CodebaseAnalyzer';
import { CodebaseContext } from './context/types';
import { PatternMatcher } from './core/fixes/PatternMatcher';
import { OptimizedAgent } from './browser-agent/core/OptimizedAgent';
import { WorkflowExecutor } from './browser-agent/workflow/WorkflowExecutor';
import { RobustPRReporter } from './github/RobustPRReporter';
import { BaselineStorage } from './core/baseline/BaselineStorage';

// CHANGED - Renamed (update import paths)
import { SmartFixGenerator } from './core/fixes/SmartFixGenerator'; // Now: FixGenerator
import { DynamicBaselineManager } from './core/baseline/DynamicBaselineManager'; // Now: BaselineManager
import { SmartAuthHandler } from './github/SmartAuthHandler'; // Now: AuthHandler
```

### Removed CLI Commands

These commands will fail:
```bash
yofix analyze <file>  # REMOVED
```

### Removed Bot Commands

These commands will no longer work:
```
@yofix impact         # REMOVED
@yofix cache clear    # REMOVED
@yofix cache status   # REMOVED
```

### Removed Dependencies

These packages are no longer installed:
- `tree-sitter`
- `tree-sitter-javascript`
- `tree-sitter-typescript`
- `@babel/parser`
- `@babel/traverse`
- `@babel/types`
- `@types/babel__traverse`

---

## Support

If you were using any of the removed features and need help migrating:

1. Check this guide for migration paths
2. Open an issue: https://github.com/yofix/yofix/issues
3. Refer to the updated CLAUDE.md for current architecture

---

## Version History

- **v1.0.22** (Nov 2024): File naming cleanup - Removed confusing "Smart/Dynamic" prefixes, removed 619 lines of redundant code
  - Removed: Old FixGenerator wrapper, BaselineManager, BaselineStorage, PatternMatcher, RobustPRReporter
  - Renamed: SmartFixGenerator → FixGenerator, DynamicBaselineManager → BaselineManager, SmartAuthHandler → AuthHandler
- **v1.0.21** (Nov 2024): Major cleanup - Removed 3,000+ lines of dead code, external route analysis
- **v1.0.11** (Oct 2024): Added EnhancedContextProvider (later removed)
- Earlier versions: See CHANGELOG for details
