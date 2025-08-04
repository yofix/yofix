# Release Notes - v1.0.22

## 🚀 New Features

### GitHub Cache Manager
- **Unified Caching Infrastructure**: Introduced `GitHubCacheManager` - a comprehensive, GitHub-aware caching solution
- **Namespaced Caching**: Pre-defined namespaces for common use cases (PR URLs, route analysis, AI responses, etc.)
- **Context-Aware**: Automatically captures GitHub context (repo, owner, PR number, SHA, actor)
- **Flexible TTL Management**: Per-namespace TTL with override capability
- **Redis + In-Memory Fallback**: Robust caching with automatic fallback

### PR Preview URL Caching
- **Deterministic URL Resolution**: Bot can now reliably retrieve preview URLs from cache
- **2-Week TTL**: Preview URLs are cached for 14 days with automatic cleanup
- **Cross-Context Access**: URLs cached during GitHub Action runs are accessible to bot commands

## 🔧 Improvements

### Architecture Enhancements
- **Consolidated Caching**: Removed redundant `PRUrlCache` wrapper in favor of direct `GitHubCacheManager` usage
- **Better Organization**: Moved all GitHub-related caching to `src/github/` directory
- **Simplified API**: Added convenience methods `setPRPreviewUrl()` and `getPRPreviewUrl()`

### Code Quality
- **Reduced Duplication**: Eliminated separate cache implementations
- **Consistent Patterns**: All GitHub-related functionality now follows the same caching patterns
- **Better Type Safety**: Full TypeScript support with proper interfaces

## 🐛 Bug Fixes

- Fixed missing `preview-url` handling to fail silently instead of throwing errors
- Updated test mocks to match current `StorageProvider` interface

## 📦 Dependencies

No dependency changes in this release.

## 🔄 Migration Notes

### For Developers
If you were using `PRUrlCache` directly:
```typescript
// Old way
import { PRUrlCache } from './core/cache/PRUrlCache';
const cache = PRUrlCache.getInstance();
await cache.setPreviewUrl(owner, repo, prNumber, url);

// New way
import { GitHubCacheManager } from './github/GitHubCacheManager';
const cache = GitHubCacheManager.getInstance();
await cache.setPRPreviewUrl(owner, repo, prNumber, url);
```

### For Bot Users
No changes required - the bot will automatically use the new caching system.

## 📊 Cache Namespaces

The following cache namespaces are now available:
- `PR_URLS` (2 weeks) - Preview URLs for pull requests
- `ROUTE_ANALYSIS` (24 hours) - Analyzed routes and impact trees
- `AI_RESPONSES` (1 week) - Claude AI analysis responses
- `VISUAL_BASELINES` (30 days) - Visual regression baselines
- `AUTH_SESSIONS` (4 hours) - Authentication session data
- `TEST_RESULTS` (1 week) - Test execution results

Custom namespaces can be registered as needed.