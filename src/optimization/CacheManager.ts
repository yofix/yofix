import * as core from '@actions/core';
import Redis from 'ioredis';
import * as crypto from 'crypto';

/**
 * Cache manager for AI responses and expensive operations
 */
export class CacheManager {
  private redis: Redis | null = null;
  private memoryCache: Map<string, CacheEntry> = new Map();
  private ttl: number;
  private maxMemorySize: number;
  private currentMemorySize: number = 0;

  constructor(options?: {
    redisUrl?: string;
    ttl?: number;
    maxMemorySize?: number;
  }) {
    this.ttl = options?.ttl || 3600; // 1 hour default
    this.maxMemorySize = options?.maxMemorySize || 100 * 1024 * 1024; // 100MB default
    
    // Try to connect to Redis if URL provided
    if (options?.redisUrl) {
      try {
        this.redis = new Redis(options.redisUrl, {
          retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 100, 3000);
          },
          maxRetriesPerRequest: 3,
          enableOfflineQueue: false
        });
        
        this.redis.on('connect', () => {
          core.info('✅ Redis cache connected');
        });
        
        this.redis.on('error', (err) => {
          core.warning(`Redis error: ${err.message}`);
          this.redis = null; // Fall back to memory cache
        });
      } catch (error) {
        core.warning(`Failed to connect to Redis: ${error.message}`);
      }
    }
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.generateKey(key);
    
    // Try Redis first
    if (this.redis) {
      try {
        const value = await this.redis.get(cacheKey);
        if (value) {
          core.debug(`Cache hit (Redis): ${key}`);
          return JSON.parse(value);
        }
      } catch (error) {
        core.warning(`Redis get error: ${error.message}`);
      }
    }
    
    // Fall back to memory cache
    const entry = this.memoryCache.get(cacheKey);
    if (entry && entry.expiresAt > Date.now()) {
      core.debug(`Cache hit (Memory): ${key}`);
      return entry.value;
    }
    
    core.debug(`Cache miss: ${key}`);
    return null;
  }

  /**
   * Set cached value
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const cacheKey = this.generateKey(key);
    const cacheTTL = ttl || this.ttl;
    
    // Store in Redis if available
    if (this.redis) {
      try {
        await this.redis.setex(
          cacheKey,
          cacheTTL,
          JSON.stringify(value)
        );
        core.debug(`Cached to Redis: ${key}`);
      } catch (error) {
        core.warning(`Redis set error: ${error.message}`);
      }
    }
    
    // Also store in memory cache
    const size = this.estimateSize(value);
    this.ensureMemorySpace(size);
    
    this.memoryCache.set(cacheKey, {
      value,
      size,
      expiresAt: Date.now() + (cacheTTL * 1000)
    });
    this.currentMemorySize += size;
    
    core.debug(`Cached to memory: ${key} (${size} bytes)`);
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    const cacheKey = this.generateKey(key);
    
    // Delete from Redis
    if (this.redis) {
      try {
        await this.redis.del(cacheKey);
      } catch (error) {
        core.warning(`Redis delete error: ${error.message}`);
      }
    }
    
    // Delete from memory cache
    const entry = this.memoryCache.get(cacheKey);
    if (entry) {
      this.currentMemorySize -= entry.size;
      this.memoryCache.delete(cacheKey);
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    // Clear Redis
    if (this.redis) {
      try {
        await this.redis.flushdb();
      } catch (error) {
        core.warning(`Redis clear error: ${error.message}`);
      }
    }
    
    // Clear memory cache
    this.memoryCache.clear();
    this.currentMemorySize = 0;
  }

  /**
   * Cache wrapper for async functions
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    options?: {
      ttl?: number;
      force?: boolean;
    }
  ): Promise<T> {
    // Check cache first (unless forced)
    if (!options?.force) {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    }
    
    // Execute function
    const result = await fn();
    
    // Cache result
    await this.set(key, result, options?.ttl);
    
    return result;
  }

  /**
   * Create cache key for AI responses
   */
  createAIResponseKey(params: {
    model: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }): string {
    return `ai:${params.model}:${crypto
      .createHash('sha256')
      .update(JSON.stringify({
        prompt: params.prompt,
        temperature: params.temperature || 0,
        maxTokens: params.maxTokens || 0
      }))
      .digest('hex')}`;
  }

  /**
   * Create cache key for visual analysis
   */
  createVisualAnalysisKey(params: {
    imageHash: string;
    analysisType: string;
    options?: any;
  }): string {
    return `visual:${params.analysisType}:${params.imageHash}:${crypto
      .createHash('md5')
      .update(JSON.stringify(params.options || {}))
      .digest('hex')}`;
  }

  /**
   * Create cache key for route analysis
   */
  createRouteAnalysisKey(params: {
    repository: string;
    prNumber: number;
    commit: string;
  }): string {
    return `routes:${params.repository}:pr${params.prNumber}:${params.commit}`;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const memoryEntries = Array.from(this.memoryCache.values());
    const now = Date.now();
    
    return {
      memorySize: this.currentMemorySize,
      memoryEntries: this.memoryCache.size,
      memoryHits: 0, // Would need to track this
      memoryMisses: 0, // Would need to track this
      expiredEntries: memoryEntries.filter(e => e.expiresAt < now).length,
      redisConnected: !!this.redis
    };
  }

  /**
   * Generate cache key
   */
  private generateKey(key: string): string {
    return `yofix:${key}`;
  }

  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: any): number {
    const str = JSON.stringify(value);
    return str.length * 2; // Rough estimate (2 bytes per character)
  }

  /**
   * Ensure space in memory cache
   */
  private ensureMemorySpace(requiredSize: number): void {
    if (this.currentMemorySize + requiredSize <= this.maxMemorySize) {
      return;
    }
    
    // LRU eviction
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    
    while (this.currentMemorySize + requiredSize > this.maxMemorySize && entries.length > 0) {
      const [key, entry] = entries.shift()!;
      this.currentMemorySize -= entry.size;
      this.memoryCache.delete(key);
      core.debug(`Evicted from cache: ${key}`);
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt < now) {
        this.currentMemorySize -= entry.size;
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      core.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

interface CacheEntry {
  value: any;
  size: number;
  expiresAt: number;
}

interface CacheStats {
  memorySize: number;
  memoryEntries: number;
  memoryHits: number;
  memoryMisses: number;
  expiredEntries: number;
  redisConnected: boolean;
}