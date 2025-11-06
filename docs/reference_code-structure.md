# YoFix Source Structure

## Directory Organization

```
src/
├── index.ts                    # Main entry point for GitHub Action
├── types.ts                    # Global shared types
│
├── bot/                       # GitHub bot functionality (experimental)
│   ├── CommandHandler.ts      # Executes bot commands
│   ├── CommandParser.ts       # Parses @yofix commands
│   ├── ReportFormatter.ts     # Formats bot responses
│   ├── YoFixBot.ts           # Main bot class
│   └── commands/             # Bot command implementations
│
├── browser-agent/            # AI browser automation
│   ├── core/                 # Core agent functionality
│   │   ├── Agent.ts         # Main browser agent
│   │   ├── DOMIndexer.ts    # DOM indexing
│   │   └── ActionRegistry.ts # Action handlers
│   └── actions/             # Browser actions
│
├── cli/                      # Command line interface
│   └── yofix-cli.ts         # CLI entry point
│
├── core/                     # Core business logic
│   ├── analysis/            # Visual & route analysis
│   │   ├── VisualAnalyzer.ts
│   │   └── ThirdPartyRouteImpactAnalyzer.ts  # Uses route-impact-analyzer package
│   ├── baseline/            # Baseline management
│   │   ├── BaselineManager.ts (renamed from DynamicBaselineManager)
│   │   ├── BaselineStrategies.ts
│   │   ├── VisualDiffer.ts
│   │   └── types.ts
│   ├── config/              # Configuration management
│   │   └── ConfigurationManager.ts
│   ├── deterministic/       # Deterministic testing
│   │   └── DeterministicRunner.ts
│   ├── fixes/               # AI fix generation
│   │   ├── FixGenerator.ts (renamed from SmartFixGenerator)
│   │   ├── FixTemplates.ts
│   │   └── FixValidator.ts
│   ├── github/              # GitHub integration
│   │   ├── GitHubServiceFactory.ts
│   │   └── GitHubCommentEngine.ts
│   ├── hooks/               # Hook system
│   ├── setup/               # Repository setup & learning
│   │   ├── RepositoryLearner.ts
│   │   ├── PatternStore.ts
│   │   └── IncrementalLearner.ts
│   └── testing/             # Test generation & running
│       ├── TestGenerator.ts
│       └── VisualRunner.ts
│
├── github/                   # GitHub integration (legacy)
│   ├── AuthHandler.ts       # Authentication (renamed from SmartAuthHandler)
│   ├── PRReporter.ts        # PR commenting
│   └── GitHubCacheManager.ts
│
├── monitoring/              # Monitoring & metrics
│   ├── ErrorHandler.ts      # Centralized error handling
│   └── AuthMetrics.ts       # Authentication metrics
│
├── modules/                 # Legacy authentication
│   ├── auth-strategies.ts
│   └── llm-browser-agent.ts
│
├── optimization/            # Performance optimization
│   ├── CacheManager.ts     # Redis/memory caching
│   └── ImageOptimizer.ts   # Image compression
│
└── providers/              # External service providers
    ├── firebase/           # Firebase utilities
    └── storage/            # Storage implementations
        ├── FirebaseStorage.ts
        ├── S3Storage.ts
        └── StorageFactory.ts
```

## Key Principles

1. **Separation of Concerns**: Each directory has a clear purpose
2. **Provider Pattern**: External services are abstracted (Firebase, S3)
3. **Core Isolation**: Business logic separated from infrastructure
4. **Testability**: Clear boundaries for mocking and testing
5. **Clean Naming**: Generic names without confusing adjectives

## Recent Changes (Nov 2024)

### Renamed Files (Removed Confusing Adjectives)
- `SmartFixGenerator.ts` → `FixGenerator.ts`
- `DynamicBaselineManager.ts` → `BaselineManager.ts`
- `SmartAuthHandler.ts` → `AuthHandler.ts`

### Removed Files
- `src/context/` directory (CodebaseAnalyzer, EnhancedContextProvider)
- `src/core/baseline/BaselineStorage.ts` (superseded)
- `src/core/baseline/BaselineManager.ts` (old version, superseded)
- `src/core/fixes/PatternMatcher.ts` (unused)
- Old route analyzers (TreeSitterRouteAnalyzer, etc.)
- Browser-agent advanced features (OptimizedAgent, ParallelOrchestrator, etc.)

## Import Guidelines

- Use relative imports within same module
- Use absolute imports from src/ for cross-module
- Export types from module's types.ts file
- Share global types via src/types.ts

## External Dependencies

### Production Dependencies
- **route-impact-analyzer** - Route impact analysis using Claude AI
- **@anthropic-ai/sdk** - Claude AI integration
- **playwright** - Browser automation
- **firebase-admin** - Firebase storage
- **@aws-sdk/client-s3** - S3 storage

### Key Design Decision
Route detection is delegated to the external `route-impact-analyzer` package rather than maintaining internal analysis logic. This provides better route detection via Claude AI and reduced complexity.
