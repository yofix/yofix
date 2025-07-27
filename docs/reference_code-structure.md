# YoFix Source Structure

## Directory Organization

```
src/
├── index.ts                    # Main entry point for GitHub Action
├── types.ts                    # Global shared types
│
├── automation/                 # Browser automation (MCP)
│   ├── mcp/                   # Model Context Protocol
│   └── security/              # Security sandboxing
│
├── bot/                       # GitHub bot functionality
│   ├── CommandHandler.ts      # Executes bot commands
│   ├── CommandParser.ts       # Parses @yofix commands
│   ├── ReportFormatter.ts     # Formats bot responses
│   └── YoFixBot.ts           # Main bot class
│
├── cli/                       # Command line interface
│   └── yofix-cli.ts          # CLI entry point
│
├── context/                   # Codebase understanding
│   └── CodebaseAnalyzer.ts   # AST analysis
│
├── core/                      # Core business logic
│   ├── analysis/             # Visual analysis
│   ├── baseline/             # Baseline management
│   ├── fixes/                # Fix generation
│   └── testing/              # Test generation & running
│
├── github/                    # GitHub integration
│   ├── AuthHandler.ts        # Authentication
│   └── PRReporter.ts         # PR commenting
│
├── optimization/              # Performance optimization
│   ├── CacheManager.ts       # Redis/memory caching
│   └── ImageOptimizer.ts     # Image compression
│
└── providers/                 # External service providers
    ├── ai/                   # AI providers (future)
    ├── firebase/             # Firebase utilities
    └── storage/              # Storage implementations
```

## Key Principles

1. **Separation of Concerns**: Each directory has a clear purpose
2. **Provider Pattern**: External services are abstracted
3. **Core Isolation**: Business logic separated from infrastructure
4. **Testability**: Clear boundaries for mocking and testing

## Import Guidelines

- Use relative imports within same module
- Use absolute imports from src/ for cross-module
- Export types from module's types.ts file
- Share global types via src/types.ts