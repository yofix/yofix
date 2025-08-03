# Migration Guide: Hook-Based Architecture

This guide helps contributors understand and migrate to YoFix's new hook-based, environment-independent architecture.

## 🎯 Overview

YoFix has been completely decoupled from GitHub Actions dependencies, enabling:
- **Zero-setup development** - works without any environment configuration
- **Complete testability** - all components can be tested independently  
- **Environment independence** - runs in any Node.js environment
- **Smart defaults** - automatic fallbacks for all configuration

## 🏗️ Architecture Changes

### Before (Tightly Coupled)
```typescript
// ❌ Old way - direct dependencies
import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

const token = core.getInput('github-token'); // Required GitHub Actions
const octokit = getOctokit(token);           // Direct dependency
```

### After (Hook-Based)
```typescript
// ✅ New way - abstracted dependencies
import { GitHubServiceFactory } from './core/github/GitHubServiceFactory';
import { env } from './core/hooks/EnvironmentHook';

const service = GitHubServiceFactory.getInstance(); // Works anywhere
const token = env.getWithDefaults('GITHUB_TOKEN');  // Smart defaults
```

## 🔄 Migration Patterns

### 1. GitHub Operations

**Before:**
```typescript
import { getOctokit } from '@actions/github';

class MyComponent {
  constructor(private token: string) {}
  
  async createComment(body: string) {
    const octokit = getOctokit(this.token);
    return octokit.rest.issues.createComment({ /* ... */ });
  }
}
```

**After:**
```typescript
import { GitHubServiceFactory } from '../core/github/GitHubServiceFactory';

class MyComponent {
  private githubService = GitHubServiceFactory.getInstance();
  
  async createComment(body: string) {
    return this.githubService.createComment('owner', 'repo', 123, body);
  }
}
```

### 2. Environment Variables

**Before:**
```typescript
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('Token required');
```

**After:**
```typescript
import { env } from '../core/hooks/EnvironmentHook';

const token = env.getWithDefaults('GITHUB_TOKEN'); // Never undefined
```

### 3. Configuration Access

**Before:**
```typescript
import * as core from '@actions/core';

const storageProvider = core.getInput('storage-provider');
```

**After:**
```typescript
import { getConfiguration } from '../core/hooks/ConfigurationHook';

const config = getConfiguration();
const storageProvider = config.get('storage-provider');
```

### 4. Testing

**Before:**
```typescript
// ❌ Required complex mocking
jest.mock('@actions/github');
jest.mock('@actions/core');

// Setup environment variables
process.env.GITHUB_TOKEN = 'test-token';
```

**After:**
```typescript
// ✅ Simple mock service
import { MockGitHubService } from '../core/github/GitHubServiceFactory';

const mockService = new MockGitHubService();
mockService.setMockContext({ owner: 'test', repo: 'test' });
```

## 📦 New Components Reference

### GitHubServiceFactory

Central hub for all GitHub operations:

```typescript
import { GitHubServiceFactory } from './core/github/GitHubServiceFactory';

// Get singleton instance (recommended)
const service = GitHubServiceFactory.getInstance();

// Create specific service types
const mockService = GitHubServiceFactory.createService({ mock: true });
const enhancedService = GitHubServiceFactory.createEnhancedService({
  token: 'ghp_xxx',
  cache: { enabled: true },
  rateLimit: { enabled: true }
});
```

**Available Services:**
- **MockGitHubService**: For testing (no external calls)
- **EnhancedGitHubService**: With caching, rate limiting, retry logic
- **LazyGitHubService**: Deferred initialization
- **OctokitGitHubService**: Basic wrapper

### EnvironmentHook

Environment variable access with smart defaults:

```typescript
import { env } from './core/hooks/EnvironmentHook';

// Smart defaults - never undefined
env.getWithDefaults('GITHUB_TOKEN')           // 'mock-github-token' or real
env.getWithDefaults('FIREBASE_PROJECT_ID')    // 'yofix-test-project' or real

// Traditional access
env.get('MY_VAR')                            // undefined if not set
env.getRequired('REQUIRED_VAR')              // throws if not set
env.has('MY_VAR')                            // boolean

// Environment checks
env.isDevelopment()                          // boolean
env.isProduction()                          // boolean  
env.isTest()                                // boolean
```

### ConfigurationHook

GitHub Actions input abstraction:

```typescript
import { getConfiguration } from './core/hooks/ConfigurationHook';

const config = getConfiguration();

// Get inputs with fallbacks
config.get('storage-provider', 'firebase');
config.getRequired('website-url');
config.has('auth-email');
```

### StorageHook

Provider-agnostic storage operations:

```typescript
import { getStorage } from './core/hooks/StorageHook';

const storage = getStorage();

await storage.upload('screenshots/test.png', buffer);
const url = await storage.getSignedUrl('screenshots/test.png');
await storage.delete('screenshots/test.png');
```

## 🧪 Testing Guidelines

### Unit Testing
```typescript
import { MockGitHubService } from '../core/github/GitHubServiceFactory';
import { MockEnvironmentHook } from '../core/hooks/EnvironmentHook';

describe('MyComponent', () => {
  let mockGitHub: MockGitHubService;
  
  beforeEach(() => {
    mockGitHub = new MockGitHubService();
    mockGitHub.setMockContext({
      owner: 'test-owner',
      repo: 'test-repo'
    });
  });

  it('should work independently', async () => {
    const component = new MyComponent();
    const result = await component.doSomething();
    expect(result).toBeDefined();
  });
});
```

### Integration Testing
```typescript
describe('GitHub Integration', () => {
  it('should work with complete mock setup', async () => {
    const service = GitHubServiceFactory.createService({ mock: true });
    
    // Set up mock data
    service.setMockPullRequestFiles(123, [
      { filename: 'src/test.ts', status: 'modified' }
    ]);
    
    // Test integration
    const files = await service.listPullRequestFiles('owner', 'repo', 123);
    expect(files).toHaveLength(1);
  });
});
```

## ⚠️ Breaking Changes

### Removed Dependencies
- ❌ Direct `@actions/github` imports
- ❌ Direct `@actions/core` imports  
- ❌ Manual `getOctokit()` calls
- ❌ Constructor token parameters

### Constructor Changes
```typescript
// ❌ Before
class GitHubCommentEngine {
  constructor(private token: string) {}
}

// ✅ After  
class GitHubCommentEngine {
  private githubService = GitHubServiceFactory.getInstance();
}
```

### Environment Requirements
```typescript
// ❌ Before - required setup
export GITHUB_TOKEN=ghp_xxx
export FIREBASE_PROJECT_ID=my-project
npm test  // Would fail without env vars

// ✅ After - works immediately
npm test  // ✅ Uses smart defaults
```

## 🚀 Benefits for Contributors

### Immediate Development
```bash
# No setup required!
git clone https://github.com/yofix/yofix.git
cd yofix
npm install
npm test        # ✅ All tests pass
npm run build   # ✅ Builds successfully
```

### Independent Testing
```typescript
// Test any component in isolation
import { RouteImpactAnalyzer } from './core/analysis/RouteImpactAnalyzer';

const analyzer = new RouteImpactAnalyzer(); // No dependencies needed!
const impact = await analyzer.analyze(['src/components/Button.tsx']);
```

### Flexible Environments
```typescript
// Works in any environment
- GitHub Actions (production)
- Local development (with defaults)
- CI/CD systems (any provider)
- Docker containers
- Testing frameworks
```

## 📋 Migration Checklist

### For New Components
- [ ] Use `GitHubServiceFactory.getInstance()` for GitHub operations
- [ ] Use `env.getWithDefaults()` for environment variables
- [ ] Use `getConfiguration()` for GitHub Actions inputs
- [ ] Write tests using mock services
- [ ] No constructor dependencies on tokens

### For Existing Components
- [ ] Remove `@actions/github` and `@actions/core` imports
- [ ] Replace direct `getOctokit()` calls with `GitHubServiceFactory`
- [ ] Replace `process.env` access with `EnvironmentHook`
- [ ] Replace `core.getInput()` with `ConfigurationHook`
- [ ] Update tests to use mock services
- [ ] Remove token constructor parameters

### For Tests
- [ ] Use `MockGitHubService` instead of mocking `@actions/github`
- [ ] Use `MockEnvironmentHook` for environment variable tests
- [ ] Remove complex environment variable setup
- [ ] Test components independently
- [ ] Verify smart defaults work correctly

## 🔍 Code Examples

### Complete Component Migration

**Before:**
```typescript
import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

export class PRReporter {
  private octokit: ReturnType<typeof getOctokit>;
  
  constructor(token: string) {
    this.octokit = getOctokit(token);
  }
  
  async report(results: TestResults) {
    const prNumber = parseInt(core.getInput('pr-number'));
    await this.octokit.rest.issues.createComment({
      owner: core.getInput('owner'),
      repo: core.getInput('repo'),
      issue_number: prNumber,
      body: this.formatResults(results)
    });
  }
}
```

**After:**
```typescript
import { GitHubServiceFactory } from '../core/github/GitHubServiceFactory';
import { getConfiguration } from '../core/hooks/ConfigurationHook';

export class PRReporter {
  private githubService = GitHubServiceFactory.getInstance();
  private config = getConfiguration();
  
  async report(results: TestResults) {
    const prNumber = parseInt(this.config.get('pr-number', '1'));
    const context = this.githubService.getContext();
    
    await this.githubService.createComment(
      context.owner,
      context.repo,
      prNumber,
      this.formatResults(results)
    );
  }
}
```

## 📚 Additional Resources

- **Architecture Overview**: `src/core/github/GitHubServiceFactory.ts`
- **Smart Defaults**: `src/config/default.config.ts`
- **Test Examples**: `src/core/github/__tests__/`
- **Hook Implementations**: `src/core/hooks/`

## ❓ FAQ

**Q: Do I need to set up environment variables for development?**
A: No! YoFix includes smart defaults for all required variables.

**Q: Will my existing GitHub Actions workflows break?**
A: No! The new architecture is fully backwards compatible.

**Q: How do I test components that use GitHub API?**
A: Use `MockGitHubService` - no external API calls or complex mocking needed.

**Q: Can I override the smart defaults?**
A: Yes! Set environment variables and they'll take precedence over defaults.

**Q: Is this change performance-optimized?**
A: Yes! The new architecture includes caching, rate limiting, and retry logic.

---

**Need help with migration?** Check the test files for examples or create an issue for assistance!