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
export { RobustPRReporter } from './RobustPRReporter';

// Authentication
export { SmartAuthHandler } from './SmartAuthHandler';

// Types
export * from './types';