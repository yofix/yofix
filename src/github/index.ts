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

// Authentication
export { AuthHandler } from './AuthHandler';

// Types
export * from './types';