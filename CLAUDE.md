# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YoFix is an AI-powered visual testing tool for web applications. It integrates with GitHub Actions to automatically test websites, detect visual changes, and generate fixes using Claude AI.

**Core Capabilities:**
- Visual regression testing with smart baseline management
- Route impact analysis using external `route-impact-analyzer` package
- AI-powered auto-fix generation for visual issues (experimental)
- Natural language bot interface via PR comments (experimental)
- Smart authentication handling with browser automation

**Production-Ready Features:**
- ✅ Visual testing workflow (main use case)
- ✅ Route impact analysis
- ✅ Baseline management with Firebase/S3 storage
- ✅ Screenshot comparison and diff generation
- ✅ GitHub PR integration and reporting

**Experimental Features:**
- ⚠️ Bot commands (`@yofix scan`, `@yofix fix`)
- ⚠️ AI-powered fix generation
- ⚠️ Browser agent automation

## Essential Commands

### Development
```bash
# Install dependencies
yarn install

# Build the project (esbuild bundling)
yarn build
yarn build:cli

# Type checking
yarn typecheck

# Run tests
yarn test

# Linting
yarn lint
yarn lint:fix

# Local testing
yarn test:local
```

### Release Process
```bash
# Create a new release (prompts for version)
yarn release

# Specific version releases
yarn release:patch  # 1.0.0 -> 1.0.1
yarn release:minor  # 1.0.0 -> 1.1.0
yarn release:major  # 1.0.0 -> 2.0.0
```

## Architecture & Key Components

### Entry Points

1. **GitHub Action** - `src/index.ts` (Main workflow orchestrator)
   - Handles PR visual testing workflow
   - Integrates route analysis, screenshot capture, baseline comparison
   - Posts results to GitHub PR

2. **CLI Tool** - `src/cli/yofix-cli.ts`
   - Commands: `scan`, `fix`, `setup`, `test`
   - Note: Route analysis delegated to external `route-impact-analyzer` package

3. **Bot Handler** - `src/bot/handler.ts` (Experimental)
   - Processes `@yofix` mentions in PR comments
   - Natural language command parsing

### Core Modules

```
src/
├── index.ts                    # Main GitHub Action entry point
├── cli/                        # CLI interface
│   └── yofix-cli.ts
├── core/                       # Business logic hub
│   ├── analysis/              # Visual & route analysis
│   │   ├── VisualAnalyzer.ts
│   │   └── ThirdPartyRouteImpactAnalyzer.ts  # Uses route-impact-analyzer package
│   ├── baseline/              # Baseline management
│   │   ├── BaselineManager.ts
│   │   ├── DynamicBaselineManager.ts
│   │   └── VisualDiffer.ts
│   ├── testing/               # Test generation & execution
│   │   ├── TestGenerator.ts
│   │   └── VisualRunner.ts
│   ├── deterministic/         # Deterministic visual testing
│   │   └── DeterministicRunner.ts
│   ├── fixes/                 # AI fix generation (experimental)
│   │   ├── FixGenerator.ts
│   │   └── SmartFixGenerator.ts
│   ├── github/                # GitHub integration
│   │   ├── GitHubServiceFactory.ts
│   │   └── GitHubCommentEngine.ts
│   ├── config/                # Configuration management
│   │   └── ConfigurationManager.ts
│   └── hooks/                 # Hook system
├── bot/                       # PR bot (experimental)
│   ├── YoFixBot.ts
│   ├── CommandHandler.ts
│   └── CommandParser.ts
├── browser-agent/             # AI browser automation
│   ├── core/
│   │   ├── Agent.ts
│   │   ├── DOMIndexer.ts
│   │   └── ActionRegistry.ts
│   └── actions/               # Browser actions
├── providers/                 # External integrations
│   ├── storage/               # Firebase, S3
│   │   ├── FirebaseStorage.ts
│   │   ├── S3Storage.ts
│   │   └── StorageFactory.ts
│   └── firebase/              # Firebase utilities
├── github/                    # GitHub integration (legacy)
│   ├── PRReporter.ts         # Use GitHubCommentEngine in new code
│   └── GitHubCacheManager.ts
└── modules/                   # Legacy authentication
    ├── auth-strategies.ts
    └── llm-browser-agent.ts
```

### Key Design Patterns

1. **Provider Pattern**: Swappable storage (Firebase/S3) and LLM providers
2. **Factory Pattern**: GitHubServiceFactory, StorageFactory
3. **External Package Integration**: Route analysis via `route-impact-analyzer`
4. **Centralized Services**: ConfigurationManager, GitHubCommentEngine, ErrorHandler

## Configuration

### Action Configuration (`action.yml`)

Key inputs:
- `github-token`: Required for PR interactions
- `website-url`: Target website to test
- `claude-api-key`: Required for route-impact-analyzer
- `auth-mode`: 'selectors' or 'ai' (default: 'selectors')
- `storage-provider`: 'firebase' or 's3'
- `pages`: Routes to test (supports glob patterns)
- `route-impact-force-refresh`: Force cache refresh for route analysis

### YoFix Config (`.yofix.yml`)

```yaml
website-url: https://example.com
auth:
  mode: selectors  # or 'ai'
  selectors:
    username: '#username'
    password: '#password'
    submit: '#submit'
pages:
  - /dashboard
  - /settings/*
```

### Environment Variables

**Firebase:**
```bash
export FIREBASE_PROJECT_ID=your-project
export FIREBASE_CLIENT_EMAIL=service@account.email
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
export FIREBASE_STORAGE_BUCKET=your-bucket
```

**AWS S3:**
```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1
export S3_BUCKET=your-bucket
```

## Bot Commands (Experimental)

The bot responds to `@yofix` mentions in PR comments:

```
@yofix scan              # Run visual tests
@yofix scan /dashboard   # Test specific route
@yofix fix               # Generate AI fixes (experimental)
@yofix test              # Generate Playwright tests
@yofix baseline create   # Create baselines
@yofix help              # Show available commands
```

**Note:** Bot commands are experimental and may have limitations.

## Testing

### Unit Tests
- Framework: Jest with ts-jest
- Location: `__tests__` folders next to source files
- Run: `yarn test`

### Integration Testing
1. Set up test environment variables
2. Use `yarn test:local` for local runner
3. Test specific providers with environment flags

### Test Output Guidelines
- Screenshots and test results saved in `/test-results` directory
- Use descriptive filenames with timestamps if needed
- Example: `/test-results/route-home-2024-08-03.png`

## Key Workflows

### Main Visual Testing Flow

1. **GitHub Action Triggered** (PR event)
2. **Route Analysis** - Uses external `route-impact-analyzer` package
   - Analyzes changed files in PR
   - Determines affected routes
   - Smart filtering (layout impacts: test 1 route, direct impacts: test all)
3. **Test Generation** - Creates test scenarios for affected routes
4. **Screenshot Capture** - Browser automation captures screenshots
5. **Baseline Comparison** - Compares with stored baselines (Firebase/S3)
6. **Diff Generation** - Creates visual diffs for changes
7. **PR Reporting** - Posts results to GitHub PR via GitHubCommentEngine

### Bot Command Flow (Experimental)

1. PR comment mentions `@yofix <command>`
2. CommandParser extracts command intent
3. CommandHandler executes with browser-agent
4. Results posted via GitHubCommentEngine

## External Dependencies

### Production Dependencies
- **route-impact-analyzer** (^0.1.1) - Route impact analysis using Claude AI
- **@anthropic-ai/sdk** - Claude AI integration
- **playwright** - Browser automation
- **firebase-admin** - Firebase storage
- **@aws-sdk/client-s3** - S3 storage
- **sharp** - Image processing

### Key Design Decision
Route detection is delegated to the external `route-impact-analyzer` package rather than maintaining internal analysis logic. This provides:
- Better route detection via Claude AI
- Active maintenance as separate project
- Reduced complexity in YoFix codebase

## Development Notes

### TypeScript
- Target: ES2020
- Module: CommonJS
- Strict mode is DISABLED (tsconfig.json)
- Use type annotations where helpful

### Error Handling
- Use centralized error handling from `src/core`
- Log errors with context using the monitoring service
- Graceful degradation for non-critical features

### Logging
- Use appropriate log levels (info, warn, error)
- Include context in error logs
- Avoid logging sensitive information

### Code Organization
- Use two-dot file naming: `auth.store.ts`, `common.util.ts`
- Save markdown documentation in `/docs` folder
- Don't create documentation unless asked
- Prefer console output over markdown files

## Recent Changes (Post-Cleanup)

### Removed (2024-11)
- Old route analyzers (TreeSitterRouteAnalyzer, RouteImpactAnalyzer, ComponentRouteMapper)
- CodebaseAnalyzer and context directory (Babel-based codebase parsing)
- Unused browser-agent features (OptimizedAgent, ParallelOrchestrator, VisionMode, WorkflowExecutor)
- Legacy visual-tester modules
- Security sandbox (unused)
- RobustPRReporter (test-only code)
- Root-level test scripts
- Browser-agent examples and test directories

### Dependencies Removed
- tree-sitter packages (3 packages)
- @babel packages (4 packages)

### Bundle Size Improvements
- Main bundle: 5.8mb → 4.2mb (-27.6%)
- Removed ~3,000+ lines of unused code

## Common Development Tasks

### Adding a New Provider
1. Create interface in `src/providers/types.ts`
2. Implement provider in `src/providers/[type]/`
3. Update factory in `src/providers/factory.ts`
4. Add configuration handling

### Debugging
- Check GitHub Action logs for detailed output
- Use `DEBUG=yofix:*` environment variable (if implemented)
- Local testing with mock providers available

### Working with Route Analysis
- Route detection uses external `route-impact-analyzer` package
- Configuration in `ThirdPartyRouteImpactAnalyzer.ts`
- Supports caching and force refresh
- Returns filtered routes (smart filtering for layout changes)

## Current Limitations

1. **Bot Commands**: Experimental, may have reliability issues
2. **Fix Generation**: AI-powered but not production-tested
3. **Browser Agent**: Advanced features are built but not fully integrated
4. **Test Coverage**: Limited unit test coverage

## Contribution Guidelines

When adding new features:
1. Follow existing patterns (Factory, Provider, centralized services)
2. Add tests for new functionality
3. Update this documentation
4. Consider bundle size impact
5. Use external packages when appropriate (like route-impact-analyzer)

## Support

- **Issues**: https://github.com/yofix/yofix/issues
- **Documentation**: `/docs` folder
- **CLI Help**: `yofix --help`
