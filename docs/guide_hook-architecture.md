# Hook-Based Architecture Guide

## Overview

The hook-based architecture decouples YoFix from GitHub Actions dependencies, making the code more modular, testable, and reusable in different environments.

## Implemented Hooks

### 1. LoggerHook (`src/core/hooks/LoggerHook.ts`)

Provides abstraction for logging operations:

```typescript
export interface LoggerHook {
  info(message: string): void;
  debug(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  setOutput(name: string, value: string): void;
}
```

**Implementations:**
- `ConsoleLogger`: Logs to console with emojis
- `GitHubActionsLogger`: Logs using @actions/core when available

**Usage:**
```typescript
const logger = LoggerFactory.getLogger();
logger.info('Starting analysis...');
```

### 2. GitHubHook (`src/core/hooks/GitHubHook.ts`)

Provides abstraction for GitHub operations:

```typescript
export interface GitHubHook {
  getContext(): GitHubContext;
  getPullRequestFiles(prNumber: number): Promise<PullRequestFile[]>;
  createComment(prNumber: number, body: string): Promise<void>;
  getInput(name: string): string;
}
```

**Implementations:**
- `MockGitHub`: For testing without GitHub Actions
- `GitHubActionsHook`: Uses @actions/github when available

**Usage:**
```typescript
const github = GitHubFactory.getGitHub();
const files = await github.getPullRequestFiles(123);
```

### 3. ErrorHook (`src/core/hooks/ErrorHook.ts`)

Provides error handling without GitHub Actions dependencies:

```typescript
export interface ErrorOptions {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  recoverable?: boolean;
  retryable?: boolean;
  userMessage?: string;
  userAction?: string;
  metadata?: any;
}
```

**Usage:**
```typescript
const errorHandler = ErrorHandlerFactory.getErrorHandler(logger);
errorHandler.handle(error, {
  severity: ErrorSeverity.HIGH,
  category: ErrorCategory.API
});
```

## Updated Components

### TreeSitterRouteAnalyzer
- Uses `LoggerHook` instead of `@actions/core`
- Uses `ErrorHook` instead of `CentralizedErrorHandler`
- Reads environment variables instead of GitHub Actions inputs

### RouteImpactAnalyzer  
- Uses `LoggerHook` for logging
- Uses `GitHubHook` for GitHub operations
- No longer requires `githubToken` in constructor

### ImpactCommandHandler
- Updated `DefaultRouteAnalyzerFactory` to not require `githubToken`
- Works with the new RouteImpactAnalyzer constructor

## Testing

### Mock Testing
```typescript
// Set up mocks
const mockGitHub = new MockGitHub({
  owner: 'LoopKitchen',
  repo: 'loop-frontend',
  prNumber: 123
});

mockGitHub.setMockFiles([
  { filename: 'src/file.ts', status: 'modified' }
]);

GitHubFactory.setGitHub(mockGitHub);

// Run tests
const analyzer = new RouteImpactAnalyzer();
const results = await analyzer.analyzePRImpact(123);
```

### Console Testing
```typescript
// Use console logger for local testing
LoggerFactory.setLogger(new ConsoleLogger());

const analyzer = new TreeSitterRouteAnalyzer('/path/to/repo');
await analyzer.initialize();
```

## Known Issues

### StorageFactory Dependency
The `StorageFactory` still has hard dependencies on GitHub Actions. When using components that depend on StorageFactory:

1. Set environment variables to avoid initialization:
   ```typescript
   process.env.INPUT_STORAGE_PROVIDER = 'github';
   ```

2. Or provide a mock storage provider:
   ```typescript
   const analyzer = new TreeSitterRouteAnalyzer(rootPath, mockStorageProvider);
   ```

### Global Initialization
Some modules (like `GitHubCommentEngine`) have global initialization that reads GitHub Actions inputs. Avoid importing from:
- `src/core/index.ts` 
- Any module that imports `GitHubCommentEngine`

Instead, import directly from specific module files.

## Migration Guide

### Before (GitHub Actions dependent)
```typescript
import * as core from '@actions/core';
import * as github from '@actions/github';

class MyAnalyzer {
  constructor(githubToken: string) {
    this.octokit = github.getOctokit(githubToken);
  }
  
  analyze() {
    core.info('Starting analysis...');
    const input = core.getInput('my-input');
  }
}
```

### After (Hook-based)
```typescript
import { LoggerHook, LoggerFactory } from './hooks/LoggerHook';
import { GitHubHook, GitHubFactory } from './hooks/GitHubHook';

class MyAnalyzer {
  private logger: LoggerHook;
  private github: GitHubHook;
  
  constructor() {
    this.logger = LoggerFactory.getLogger();
    this.github = GitHubFactory.getGitHub();
  }
  
  analyze() {
    this.logger.info('Starting analysis...');
    const input = this.github.getInput('my-input');
  }
}
```

## Benefits

1. **Testability**: Easy to test without GitHub Actions environment
2. **Modularity**: Components can be used in different contexts
3. **Flexibility**: Easy to add new implementations (e.g., CLI logger, REST API GitHub client)
4. **Debugging**: Better local development experience

## Future Improvements

1. **Complete StorageFactory decoupling**: Create StorageHook interface
2. **Configuration hook**: Abstract configuration reading
3. **Environment hook**: Abstract environment variable access
4. **Metrics hook**: Abstract performance monitoring
5. **Complete migration**: Update all modules to use hooks