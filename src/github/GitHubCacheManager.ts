import * as core from '@actions/core';
import { CacheManager } from '../optimization/CacheManager';
import { GitHubServiceFactory } from '../core/github/GitHubServiceFactory';

/**
 * Cache namespace configuration
 */
export interface CacheNamespace {
  name: string;
  ttl?: number; // TTL in seconds
  maxEntries?: number;
  description?: string;
}

/**
 * GitHub-aware cache entry with metadata
 */
export interface GitHubCacheEntry<T = any> {
  data: T;
  metadata: {
    repo: string;
    owner: string;
    createdAt: number;
    expiresAt: number;
    prNumber?: number;
    sha?: string;
    actor?: string;
  };
}

/**
 * Predefined cache namespaces for common use cases
 */
export const CacheNamespaces = {
  PR_URLS: {
    name: 'pr_urls',
    ttl: 14 * 24 * 60 * 60, // 2 weeks
    description: 'Preview URLs for pull requests'
  },
  ROUTE_ANALYSIS: {
    name: 'route_analysis',
    ttl: 24 * 60 * 60, // 24 hours
    description: 'Analyzed routes and impact trees'
  },
  AI_RESPONSES: {
    name: 'ai_responses',
    ttl: 7 * 24 * 60 * 60, // 1 week
    description: 'Claude AI analysis responses'
  },
  VISUAL_BASELINES: {
    name: 'visual_baselines',
    ttl: 30 * 24 * 60 * 60, // 30 days
    description: 'Visual regression baselines'
  },
  AUTH_SESSIONS: {
    name: 'auth_sessions',
    ttl: 4 * 60 * 60, // 4 hours
    description: 'Authentication session data'
  },
  TEST_RESULTS: {
    name: 'test_results',
    ttl: 7 * 24 * 60 * 60, // 1 week
    description: 'Test execution results'
  }
} as const;

/**
 * GitHub Actions integrated cache manager
 * Provides namespaced caching with GitHub context awareness
 */
export class GitHubCacheManager {
  private static instance: GitHubCacheManager;
  private cache: CacheManager;
  private namespaces: Map<string, CacheNamespace> = new Map();
  private github = GitHubServiceFactory.getService();
  
  private constructor() {
    const redisUrl = process.env.REDIS_URL || process.env.INPUT_REDIS_URL;
    const cacheTtl = parseInt(process.env.CACHE_TTL || process.env.INPUT_CACHE_TTL || '3600');
    
    this.cache = new CacheManager({
      redisUrl,
      ttl: cacheTtl,
      maxMemorySize: 100 * 1024 * 1024 // 100MB default
    });
    
    // Register default namespaces
    Object.values(CacheNamespaces).forEach(ns => {
      this.registerNamespace(ns);
    });
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): GitHubCacheManager {
    if (!GitHubCacheManager.instance) {
      GitHubCacheManager.instance = new GitHubCacheManager();
    }
    return GitHubCacheManager.instance;
  }
  
  /**
   * Register a new cache namespace
   */
  registerNamespace(namespace: CacheNamespace): void {
    this.namespaces.set(namespace.name, namespace);
    core.debug(`Registered cache namespace: ${namespace.name}`);
  }
  
  /**
   * Set a value in the cache with GitHub context
   */
  async set<T>(
    namespace: string | CacheNamespace,
    key: string,
    value: T,
    options?: {
      ttl?: number;
      prNumber?: number;
      sha?: string;
    }
  ): Promise<void> {
    const ns = typeof namespace === 'string' ? this.namespaces.get(namespace) : namespace;
    if (!ns) {
      throw new Error(`Unknown cache namespace: ${namespace}`);
    }
    
    const context = this.github.getContext();
    const ttl = options?.ttl || ns.ttl || 3600;
    
    const entry: GitHubCacheEntry<T> = {
      data: value,
      metadata: {
        repo: context.repo,
        owner: context.owner,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
        prNumber: options?.prNumber || context.prNumber,
        sha: options?.sha || context.sha,
        actor: context.actor
      }
    };
    
    const cacheKey = this.buildKey(ns.name, key);
    await this.cache.set(cacheKey, entry, ttl);
    
    core.debug(`Cached ${ns.name}:${key} with TTL ${ttl}s`);
  }
  
  /**
   * Get a value from the cache
   */
  async get<T>(
    namespace: string | CacheNamespace,
    key: string
  ): Promise<T | null> {
    const ns = typeof namespace === 'string' ? this.namespaces.get(namespace) : namespace;
    if (!ns) {
      throw new Error(`Unknown cache namespace: ${namespace}`);
    }
    
    const cacheKey = this.buildKey(ns.name, key);
    const entry = await this.cache.get<GitHubCacheEntry<T>>(cacheKey);
    
    if (entry) {
      core.debug(`Cache hit for ${ns.name}:${key}`);
      return entry.data;
    }
    
    core.debug(`Cache miss for ${ns.name}:${key}`);
    return null;
  }
  
  /**
   * Get a value with its metadata
   */
  async getWithMetadata<T>(
    namespace: string | CacheNamespace,
    key: string
  ): Promise<GitHubCacheEntry<T> | null> {
    const ns = typeof namespace === 'string' ? this.namespaces.get(namespace) : namespace;
    if (!ns) {
      throw new Error(`Unknown cache namespace: ${namespace}`);
    }
    
    const cacheKey = this.buildKey(ns.name, key);
    return await this.cache.get<GitHubCacheEntry<T>>(cacheKey);
  }
  
  /**
   * Delete a value from the cache
   */
  async delete(
    namespace: string | CacheNamespace,
    key: string
  ): Promise<void> {
    const ns = typeof namespace === 'string' ? this.namespaces.get(namespace) : namespace;
    if (!ns) {
      throw new Error(`Unknown cache namespace: ${namespace}`);
    }
    
    const cacheKey = this.buildKey(ns.name, key);
    await this.cache.delete(cacheKey);
    
    core.debug(`Deleted ${ns.name}:${key} from cache`);
  }
  
  /**
   * Clear an entire namespace
   */
  async clearNamespace(namespace: string | CacheNamespace): Promise<void> {
    const ns = typeof namespace === 'string' ? this.namespaces.get(namespace) : namespace;
    if (!ns) {
      throw new Error(`Unknown cache namespace: ${namespace}`);
    }
    
    // This would require scanning keys in Redis or maintaining an index
    // For now, log a warning
    core.warning(`Namespace clearing not implemented for ${ns.name}`);
  }
  
  /**
   * Wrap an async function with caching
   */
  async withCache<T>(
    namespace: string | CacheNamespace,
    key: string,
    fn: () => Promise<T>,
    options?: {
      ttl?: number;
      force?: boolean;
    }
  ): Promise<T> {
    if (!options?.force) {
      const cached = await this.get<T>(namespace, key);
      if (cached !== null) {
        return cached;
      }
    }
    
    const result = await fn();
    await this.set(namespace, key, result, options);
    return result;
  }
  
  /**
   * GitHub context-aware cache key builders
   */
  
  /**
   * Build a PR-specific cache key
   */
  buildPRKey(namespace: string | CacheNamespace, prNumber: number, ...parts: string[]): string {
    const ns = typeof namespace === 'string' ? namespace : namespace.name;
    const context = this.github.getContext();
    return this.buildKey(ns, `${context.owner}:${context.repo}:pr:${prNumber}`, ...parts);
  }
  
  /**
   * Build a repo-specific cache key
   */
  buildRepoKey(namespace: string | CacheNamespace, ...parts: string[]): string {
    const ns = typeof namespace === 'string' ? namespace : namespace.name;
    const context = this.github.getContext();
    return this.buildKey(ns, `${context.owner}:${context.repo}`, ...parts);
  }
  
  /**
   * Build a SHA-specific cache key
   */
  buildSHAKey(namespace: string | CacheNamespace, sha: string, ...parts: string[]): string {
    const ns = typeof namespace === 'string' ? namespace : namespace.name;
    const context = this.github.getContext();
    return this.buildKey(ns, `${context.owner}:${context.repo}:sha:${sha}`, ...parts);
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    namespaces: Array<{
      name: string;
      description?: string;
      ttl?: number;
    }>;
    cacheStats: any;
  }> {
    const namespaces = Array.from(this.namespaces.values()).map(ns => ({
      name: ns.name,
      description: ns.description,
      ttl: ns.ttl
    }));
    
    const cacheStats = await this.cache.getStats();
    
    return {
      namespaces,
      cacheStats
    };
  }
  
  /**
   * Build a cache key
   */
  private buildKey(...parts: string[]): string {
    return parts.filter(Boolean).join(':');
  }
  
  /**
   * Convenience methods for PR URL caching
   */
  
  /**
   * Cache a preview URL for a PR
   */
  async setPRPreviewUrl(owner: string, repo: string, prNumber: number, previewUrl: string): Promise<void> {
    const key = `${owner}:${repo}:${prNumber}`;
    await this.set(
      CacheNamespaces.PR_URLS,
      key,
      previewUrl,
      { prNumber }
    );
  }
  
  /**
   * Get a cached preview URL for a PR
   */
  async getPRPreviewUrl(owner: string, repo: string, prNumber: number): Promise<string | null> {
    const key = `${owner}:${repo}:${prNumber}`;
    return await this.get<string>(
      CacheNamespaces.PR_URLS,
      key
    );
  }
}

/**
 * Convenience function to get cache instance
 */
export function getGitHubCache(): GitHubCacheManager {
  return GitHubCacheManager.getInstance();
}

/**
 * Cache decorators for methods
 */
export function Cacheable(namespace: string | CacheNamespace, keyBuilder?: (...args: any[]) => string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cache = GitHubCacheManager.getInstance();
      const key = keyBuilder ? keyBuilder(...args) : `${propertyName}:${JSON.stringify(args)}`;
      
      return await cache.withCache(namespace, key, async () => {
        return await originalMethod.apply(this, args);
      });
    };
    
    return descriptor;
  };
}