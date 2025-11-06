/**
 * GitHub module exports
 * Provides GitHub-related functionality including caching, reporting, and authentication
 */

// Cache management
export { 
  GitHubCacheManager, 
  CacheNamespaces, 
  Cacheable, 
  getGitHubCache,
  type CacheNamespace,
  type GitHubCacheEntry 
} from './GitHubCacheManager';

// PR reporting
export { PRReporter } from './PRReporter';

// Authentication - AuthHandler removed (used browser-agent)

// Types
export * from './types';