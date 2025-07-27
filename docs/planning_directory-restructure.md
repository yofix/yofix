# YoFix Directory Restructuring Plan

## Current Issues
1. Firebase files scattered across root and subdirectories
2. Mixed concerns in root directory (storage, analysis, generation)
3. Unclear separation between providers and implementations
4. Core business logic spread across multiple locations

## Proposed Structure

```
src/
├── index.ts                    # Main entry point
├── types.ts                    # Global types
│
├── core/                       # Core domain logic
│   ├── analysis/              # Visual analysis
│   │   ├── VisualAnalyzer.ts
│   │   ├── RouteAnalyzer.ts  # (from claude-route-analyzer.ts)
│   │   └── types.ts
│   │
│   ├── baseline/              # Baseline management
│   │   ├── BaselineManager.ts # (from core/BaselineManager.ts)
│   │   ├── BaselineStorage.ts
│   │   ├── BaselineStrategies.ts
│   │   ├── VisualDiffer.ts
│   │   └── types.ts
│   │
│   ├── fixes/                 # Fix generation
│   │   ├── FixGenerator.ts
│   │   ├── SmartFixGenerator.ts
│   │   ├── FixTemplates.ts
│   │   ├── FixValidator.ts
│   │   ├── PatternMatcher.ts
│   │   └── types.ts
│   │
│   └── testing/               # Test generation & running
│       ├── TestGenerator.ts   # (from test-generator.ts)
│       ├── VisualRunner.ts    # (from visual-runner.ts)
│       ├── VisualIssueTestGenerator.ts
│       └── types.ts
│
├── providers/                  # External service providers
│   ├── storage/               # All storage implementations
│   │   ├── StorageFactory.ts
│   │   ├── FirebaseStorage.ts # (consolidated)
│   │   ├── S3Storage.ts
│   │   └── types.ts
│   │
│   ├── firebase/              # Firebase-specific utilities
│   │   ├── FirebaseUrlHandler.ts
│   │   ├── FirebaseConfigDetector.ts
│   │   ├── FirebaseErrorHandler.ts
│   │   └── types.ts
│   │
│   └── ai/                    # AI providers
│       ├── ClaudeClient.ts
│       └── types.ts
│
├── bot/                       # GitHub bot functionality
│   ├── YoFixBot.ts
│   ├── CommandHandler.ts
│   ├── CommandParser.ts
│   ├── ReportFormatter.ts
│   └── types.ts
│
├── automation/                # Browser automation (MCP)
│   ├── mcp/
│   │   ├── MCPManager.ts
│   │   ├── MCPCommandHandler.ts
│   │   ├── PlaywrightMCPAdapter.ts
│   │   ├── NaturalLanguageParser.ts
│   │   └── types.ts
│   │
│   └── security/
│       └── BrowserSecuritySandbox.ts
│
├── github/                    # GitHub integration
│   ├── PRReporter.ts         # (from pr-reporter.ts)
│   ├── AuthHandler.ts        # (from auth-handler.ts)
│   └── types.ts
│
├── optimization/              # Performance & optimization
│   ├── ImageOptimizer.ts
│   ├── CacheManager.ts       # (from cache/)
│   └── types.ts
│
├── context/                   # Codebase context (unchanged)
│   ├── CodebaseAnalyzer.ts
│   └── types.ts
│
├── cli/                       # CLI tool (unchanged)
│   └── yofix-cli.ts
│
├── integrations/              # Third-party integrations
│   └── .gitkeep
│
└── utils/                     # Shared utilities
    └── .gitkeep
```

## Migration Steps

### Phase 1: Create New Structure
```bash
# Create new directories
mkdir -p src/core/{analysis,testing}
mkdir -p src/providers/{storage,firebase,ai}
mkdir -p src/automation/security
mkdir -p src/github
mkdir -p src/optimization
```

### Phase 2: Move Files (Priority Order)

#### 1. Firebase Consolidation
```bash
# Move all Firebase files to providers/firebase/
mv src/firebase-url-handler.ts src/providers/firebase/FirebaseUrlHandler.ts
mv src/firebase-config-detector.ts src/providers/firebase/FirebaseConfigDetector.ts
mv src/firebase-error-handler.ts src/providers/firebase/FirebaseErrorHandler.ts

# Consolidate Firebase storage
# Merge firebase-storage.ts and core/FirebaseStorage.ts into providers/storage/FirebaseStorage.ts
```

#### 2. Storage Consolidation
```bash
# Move storage implementations
mv src/storage/* src/providers/storage/
mv src/baseline/BaselineStorage.ts src/providers/storage/
```

#### 3. Core Business Logic
```bash
# Analysis
mv src/analysis/VisualAnalyzer.ts src/core/analysis/
mv src/claude-route-analyzer.ts src/core/analysis/RouteAnalyzer.ts

# Testing
mv src/test-generator.ts src/core/testing/TestGenerator.ts
mv src/visual-runner.ts src/core/testing/VisualRunner.ts
mv src/test-generation/* src/core/testing/

# Baseline (keep structure, move manager)
mv src/core/BaselineManager.ts src/core/baseline/
```

#### 4. GitHub Integration
```bash
mv src/pr-reporter.ts src/github/PRReporter.ts
mv src/auth-handler.ts src/github/AuthHandler.ts
```

#### 5. Optimization
```bash
mv src/cache/CacheManager.ts src/optimization/
mv src/optimization/ImageOptimizer.ts src/optimization/
```

#### 6. Automation
```bash
mv src/mcp/BrowserSecuritySandbox.ts src/automation/security/
```

### Phase 3: Update Imports

#### Example Import Updates
```typescript
// Before
import { FirebaseStorage } from './core/FirebaseStorage';
import { FirebaseUrlHandler } from './firebase-url-handler';
import { VisualAnalyzer } from './analysis/VisualAnalyzer';

// After
import { FirebaseStorage } from './providers/storage/FirebaseStorage';
import { FirebaseUrlHandler } from './providers/firebase/FirebaseUrlHandler';
import { VisualAnalyzer } from './core/analysis/VisualAnalyzer';
```

## Benefits of New Structure

### 1. **Clear Separation of Concerns**
- Core business logic separated from providers
- External integrations isolated
- Clear boundaries between domains

### 2. **Better Cohesion**
- All Firebase code in one place
- Storage providers together
- Related functionality grouped

### 3. **Easier Testing**
- Mock providers easily
- Test core logic in isolation
- Clear dependency injection points

### 4. **Scalability**
- Easy to add new storage providers
- Simple to add new AI providers
- Clear location for new features

### 5. **Maintainability**
- Find related code quickly
- Understand dependencies
- Refactor with confidence

## Implementation Order

1. **Create directory structure** (low risk)
2. **Move Firebase files** (medium risk - many imports)
3. **Consolidate storage** (medium risk)
4. **Move core logic** (high risk - critical paths)
5. **Update all imports** (high risk - build breaking)
6. **Test build** (validation)
7. **Update documentation** (cleanup)

## Rollback Plan

If issues arise:
1. Git reset to previous commit
2. Identify problematic moves
3. Move files incrementally
4. Test after each move
5. Update imports gradually

## Success Criteria

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No circular dependencies
- [ ] Clear module boundaries
- [ ] Improved code discoverability