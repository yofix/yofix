# GitHub Service Factory Architecture

## Overview

The GitHub Service Factory provides a unified, testable, and loosely coupled approach to all GitHub API operations in YoFix. It addresses the current issues of scattered implementation and tight coupling.

## Key Benefits

1. **Lazy Initialization**: Token not required until first API call
2. **Centralized API**: All GitHub operations through one interface
3. **Easy Testing**: Built-in mock implementation
4. **Type Safety**: Full TypeScript support
5. **Async Throughout**: All operations are async
6. **No Global State**: Each component can have its own instance

## Architecture

```
GitHubServiceFactory
    ├── LazyGitHubService (default)
    │   └── Defers token requirement
    ├── OctokitGitHubService
    │   └── Real GitHub API calls
    └── MockGitHubService
        └── Testing implementation
```

## Usage Examples

### Basic Usage

```typescript
import { GitHubServiceFactory } from '@/core/github/GitHubServiceFactory';

// Get service instance - no token required yet!
const github = GitHubServiceFactory.getService();

// Token is only required when making API calls
const files = await github.listPullRequestFiles('owner', 'repo', 123);
```

### Component Integration

```typescript
export class MyAnalyzer {
  private github = GitHubServiceFactory.getService();
  
  async analyze(prNumber: number) {
    // Token resolved automatically from environment
    const files = await this.github.listPullRequestFiles(
      'LoopKitchen', 
      'loop-frontend', 
      prNumber
    );
    
    // Create comment
    await this.github.createComment(
      'LoopKitchen',
      'loop-frontend', 
      prNumber,
      '## Analysis Results\n...'
    );
  }
}
```

### Testing

```typescript
import { MockGitHubService, GitHubServiceFactory } from '@/core/github/GitHubServiceFactory';

describe('MyAnalyzer', () => {
  let mockGitHub: MockGitHubService;
  
  beforeEach(() => {
    mockGitHub = new MockGitHubService();
    GitHubServiceFactory.setService(mockGitHub);
    
    // Set up mock data
    mockGitHub.setMockFiles(123, [
      { filename: 'src/index.ts', status: 'modified' }
    ]);
  });
  
  afterEach(() => {
    GitHubServiceFactory.reset();
  });
  
  it('should analyze PR files', async () => {
    const analyzer = new MyAnalyzer();
    await analyzer.analyze(123);
    
    // Verify comment was created
    const comments = await mockGitHub.listComments('owner', 'repo', 123);
    expect(comments).toHaveLength(1);
  });
});
```

### Configuration Options

```typescript
// Option 1: Auto-configuration from environment
const github = GitHubServiceFactory.getService();
// Reads from: GITHUB_TOKEN, INPUT_GITHUB_TOKEN

// Option 2: Manual configuration
const github = GitHubServiceFactory.getService();
await github.configure({
  token: 'ghp_xxxx',
  owner: 'LoopKitchen',
  repo: 'loop-frontend',
  baseUrl: 'https://github.enterprise.com/api/v3' // Optional
});

// Option 3: Create standalone instance
const github = GitHubServiceFactory.createService();
await github.configure({ token: 'ghp_xxxx' });
```

## API Reference

### Core Methods

```typescript
interface GitHubService {
  // Configuration
  configure(config: GitHubConfig): Promise<void>;
  isConfigured(): boolean;
  
  // Pull Request operations
  listPullRequestFiles(owner, repo, prNumber): Promise<File[]>;
  
  // Comment operations
  createComment(owner, repo, issueNumber, body): Promise<{id, html_url}>;
  updateComment(owner, repo, commentId, body): Promise<void>;
  listComments(owner, repo, issueNumber): Promise<Comment[]>;
  
  // Reaction operations
  addReaction(owner, repo, commentId, reaction): Promise<void>;
  
  // Repository operations
  getFileContent(owner, repo, path, ref?): Promise<FileContent>;
  
  // Check run operations
  listCheckRuns(owner, repo, ref): Promise<CheckRun[]>;
  createCheckRun(owner, repo, sha, data): Promise<{id}>;
  updateCheckRun(owner, repo, checkRunId, data): Promise<void>;
  
  // Issue operations
  createIssue(owner, repo, title, body, labels?): Promise<{number, html_url}>;
  
  // Context operations
  getContext(): Context;
}
```

## Migration Guide

### Before (Tight Coupling)

```typescript
import * as github from '@actions/github';
import * as core from '@actions/core';

export class MyComponent {
  private octokit: any;
  
  constructor(githubToken: string) {
    // Token required at construction!
    this.octokit = github.getOctokit(githubToken);
  }
  
  async doWork() {
    const { data } = await this.octokit.rest.pulls.listFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: 123
    });
  }
}
```

### After (Loose Coupling)

```typescript
import { GitHubServiceFactory } from '@/core/github/GitHubServiceFactory';

export class MyComponent {
  private github = GitHubServiceFactory.getService();
  
  constructor() {
    // No token required!
  }
  
  async doWork() {
    const context = this.github.getContext();
    const files = await this.github.listPullRequestFiles(
      context.owner,
      context.repo,
      123
    );
  }
}
```

## Implementation Strategy

### Phase 1: Core Components
1. GitHubCommentEngine → Use GitHubService
2. RouteImpactAnalyzer → Already partially migrated
3. RobustPRReporter → Use GitHubService

### Phase 2: Bot Components
1. YoFixBot → Use GitHubService
2. Bot command handlers → Use GitHubService
3. Remove direct Octokit usage

### Phase 3: Utilities
1. FirebaseConfigDetector → Use GitHubService
2. AuthMetrics → Use GitHubService
3. Main index.ts → Use GitHubService

### Phase 4: Cleanup
1. Remove all `github.getOctokit()` calls
2. Remove `github-token` from constructor parameters
3. Update all tests to use MockGitHubService

## Advanced Features

### Caching (Future Enhancement)

```typescript
class CachedGitHubService implements GitHubService {
  private cache = new Map<string, { data: any; expires: number }>();
  private service: GitHubService;
  
  async listComments(owner, repo, issueNumber) {
    const key = `comments:${owner}/${repo}/${issueNumber}`;
    const cached = this.cache.get(key);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    
    const data = await this.service.listComments(owner, repo, issueNumber);
    this.cache.set(key, { data, expires: Date.now() + 60000 }); // 1 min
    return data;
  }
}
```

### Rate Limiting (Future Enhancement)

```typescript
class RateLimitedGitHubService implements GitHubService {
  private queue = new PQueue({ concurrency: 10 });
  
  async createComment(...args) {
    return this.queue.add(() => this.service.createComment(...args));
  }
}
```

## Best Practices

1. **Use Factory Pattern**: Always use `GitHubServiceFactory.getService()`
2. **Don't Pass Tokens**: Let the service resolve tokens from environment
3. **Mock in Tests**: Use `MockGitHubService` for all tests
4. **Handle Errors**: All methods can throw - handle appropriately
5. **Batch Operations**: Consider batching multiple API calls when possible

## Summary

The GitHub Service Factory provides:
- ✅ **Centralized** GitHub operations
- ✅ **Lazy** token initialization
- ✅ **Testable** with built-in mocks
- ✅ **Type-safe** TypeScript interface
- ✅ **Flexible** configuration options
- ✅ **Future-proof** for enhancements

This architecture makes the codebase more maintainable, testable, and independent from GitHub Actions.