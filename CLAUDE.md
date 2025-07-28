# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YoFix is an AI-powered visual testing and auto-fix tool for web applications. It integrates with GitHub Actions to automatically test websites, detect visual changes, and generate fixes using Claude AI.

Key capabilities:
- Visual regression testing with smart baseline management
- AI-powered auto-fix generation for visual issues
- Natural language bot interface via PR comments
- Smart authentication handling (selector-based and AI-based)
- Enhanced context understanding for better code generation

## Essential Commands

### Development
```bash
# Install dependencies
yarn install

# Build the project (TypeScript + ncc bundling)
yarn build

# Type checking
yarn typecheck

# Run tests
yarn test

# Run specific test file
yarn test src/core/analysis/__tests__/claude-analyzer.test.ts

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
- **GitHub Action**: `src/index.ts` - Main workflow orchestrator
- **CLI Tool**: `src/cli/yofix-cli.ts` - Command-line interface
- **Bot Handler**: `src/bot/handler.ts` - Processes PR comments

### Core Modules
- `src/core/` - Business logic (analysis, fixes, testing, baseline management)
- `src/automation/` - Browser automation and MCP adapters
- `src/providers/` - Storage (Firebase/S3) and AI (Claude) providers
- `src/context/` - Enhanced context provider for codebase understanding
- `src/github/` - GitHub integration and authentication

### Key Patterns
1. **Provider Pattern**: Swappable storage and AI providers
2. **Context-Aware AI**: All AI features share codebase understanding via EnhancedContextProvider
3. **Modular Design**: Clear separation between core logic, providers, and integrations

## Configuration

### Action Configuration (`action.yml`)
Key inputs:
- `github-token`: Required for PR interactions
- `website-url`: Target website to test
- `auth-mode`: 'selectors' or 'ai' (default: 'selectors')
- `storage-provider`: 'firebase' or 's3'
- `smart-analysis`: Enable AI analysis
- `auto-fix`: Enable fix generation
- `pages`: Routes to test (supports glob patterns)

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

## Bot Commands

The bot responds to `@yofix` mentions in PR comments:

```
@yofix run tests
@yofix test /dashboard
@yofix fix the homepage layout issue
@yofix analyze authentication flow
@yofix generate test for checkout process
```

## Testing

### Unit Tests
- Framework: Jest with ts-jest
- Location: `__tests__` folders next to source files
- Run: `yarn test`

### Integration Testing
1. Set up test environment variables
2. Use `yarn test:local` for local runner
3. Test specific providers with environment flags

## AI Integration

### Claude API Usage
- Main analyzer: `src/core/analysis/claude-analyzer.ts`
- Fix generator: `src/core/fixes/fix-generator.ts`
- Context provider: `src/context/enhanced-context-provider.ts`

### AI Features
1. **Route Analysis**: Discovers application routes
2. **Visual Analysis**: Detects UI issues
3. **Fix Generation**: Creates code patches
4. **Smart Authentication**: AI-based auth flow navigation
5. **Test Generation**: Context-aware test creation

## Storage Configuration

### Firebase
```bash
export FIREBASE_PROJECT_ID=your-project
export FIREBASE_CLIENT_EMAIL=service@account.email
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
export FIREBASE_STORAGE_BUCKET=your-bucket
```

### AWS S3
```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1
export S3_BUCKET=your-bucket
```

## Development Notes

### TypeScript
- Target: ES2020
- Module: CommonJS
- Strict mode is DISABLED (tsconfig.json)
- Use type annotations where helpful

### Error Handling
- Always use proper error types from `src/utils/error-handler.ts`
- Log errors with context using the monitoring service
- Graceful degradation for non-critical features

### Logging
- Use appropriate log levels (info, warn, error)
- Include context in error logs
- Avoid logging sensitive information

## Documentation

Follow the naming convention in `/docs`:
- `guide_*` - How-to guides
- `reference_*` - Technical specs
- `config_*` - Configuration docs
- `planning_*` - Architecture docs
- `changelog_*` - Release notes

## Recent Features (v1.0.11)

1. **EnhancedContextProvider**: Provides Claude Code-like understanding of codebases
2. **Smart Authentication**: AI can now navigate complex auth flows
3. **Context-Aware Test Generation**: Tests match existing patterns
4. **Improved Natural Language Processing**: Better understanding of user commands
5. **AI Navigation**: Discovers routes and interactions automatically

## Common Development Tasks

### Adding a New Provider
1. Create interface in `src/providers/types.ts`
2. Implement provider in `src/providers/[type]/`
3. Update factory in `src/providers/factory.ts`
4. Add configuration handling

### Adding Bot Commands
1. Update command parser in `src/bot/command-parser.ts`
2. Add handler in `src/bot/handlers/`
3. Update bot documentation

### Debugging
- Use `DEBUG=yofix:*` environment variable
- Check GitHub Action logs for detailed output
- Local testing with mock providers available