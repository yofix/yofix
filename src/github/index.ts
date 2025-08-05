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

// Authentication
export { SmartAuthHandler } from './SmartAuthHandler';

// Types
export * from './types';