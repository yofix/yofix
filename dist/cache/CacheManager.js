"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const core = __importStar(require("@actions/core"));
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = __importDefault(require("crypto"));
class CacheManager {
    constructor(options) {
        this.redis = null;
        this.memoryCache = new Map();
        this.currentMemorySize = 0;
        this.ttl = options?.ttl || 3600;
        this.maxMemorySize = options?.maxMemorySize || 100 * 1024 * 1024;
        if (options?.redisUrl) {
            try {
                this.redis = new ioredis_1.default(options.redisUrl, {
                    retryStrategy: (times) => {
                        if (times > 3)
                            return null;
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
                    this.redis = null;
                });
            }
            catch (error) {
                core.warning(`Failed to connect to Redis: ${error.message}`);
            }
        }
    }
    async get(key) {
        const cacheKey = this.generateKey(key);
        if (this.redis) {
            try {
                const value = await this.redis.get(cacheKey);
                if (value) {
                    core.debug(`Cache hit (Redis): ${key}`);
                    return JSON.parse(value);
                }
            }
            catch (error) {
                core.warning(`Redis get error: ${error.message}`);
            }
        }
        const entry = this.memoryCache.get(cacheKey);
        if (entry && entry.expiresAt > Date.now()) {
            core.debug(`Cache hit (Memory): ${key}`);
            return entry.value;
        }
        core.debug(`Cache miss: ${key}`);
        return null;
    }
    async set(key, value, ttl) {
        const cacheKey = this.generateKey(key);
        const cacheTTL = ttl || this.ttl;
        if (this.redis) {
            try {
                await this.redis.setex(cacheKey, cacheTTL, JSON.stringify(value));
                core.debug(`Cached to Redis: ${key}`);
            }
            catch (error) {
                core.warning(`Redis set error: ${error.message}`);
            }
        }
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
    async delete(key) {
        const cacheKey = this.generateKey(key);
        if (this.redis) {
            try {
                await this.redis.del(cacheKey);
            }
            catch (error) {
                core.warning(`Redis delete error: ${error.message}`);
            }
        }
        const entry = this.memoryCache.get(cacheKey);
        if (entry) {
            this.currentMemorySize -= entry.size;
            this.memoryCache.delete(cacheKey);
        }
    }
    async clear() {
        if (this.redis) {
            try {
                await this.redis.flushdb();
            }
            catch (error) {
                core.warning(`Redis clear error: ${error.message}`);
            }
        }
        this.memoryCache.clear();
        this.currentMemorySize = 0;
    }
    async wrap(key, fn, options) {
        if (!options?.force) {
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }
        }
        const result = await fn();
        await this.set(key, result, options?.ttl);
        return result;
    }
    createAIResponseKey(params) {
        return `ai:${params.model}:${crypto_1.default
            .createHash('sha256')
            .update(JSON.stringify({
            prompt: params.prompt,
            temperature: params.temperature || 0,
            maxTokens: params.maxTokens || 0
        }))
            .digest('hex')}`;
    }
    createVisualAnalysisKey(params) {
        return `visual:${params.analysisType}:${params.imageHash}:${crypto_1.default
            .createHash('md5')
            .update(JSON.stringify(params.options || {}))
            .digest('hex')}`;
    }
    createRouteAnalysisKey(params) {
        return `routes:${params.repository}:pr${params.prNumber}:${params.commit}`;
    }
    getStats() {
        const memoryEntries = Array.from(this.memoryCache.values());
        const now = Date.now();
        return {
            memorySize: this.currentMemorySize,
            memoryEntries: this.memoryCache.size,
            memoryHits: 0,
            memoryMisses: 0,
            expiredEntries: memoryEntries.filter(e => e.expiresAt < now).length,
            redisConnected: !!this.redis
        };
    }
    generateKey(key) {
        return `yofix:${key}`;
    }
    estimateSize(value) {
        const str = JSON.stringify(value);
        return str.length * 2;
    }
    ensureMemorySpace(requiredSize) {
        if (this.currentMemorySize + requiredSize <= this.maxMemorySize) {
            return;
        }
        const entries = Array.from(this.memoryCache.entries())
            .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
        while (this.currentMemorySize + requiredSize > this.maxMemorySize && entries.length > 0) {
            const [key, entry] = entries.shift();
            this.currentMemorySize -= entry.size;
            this.memoryCache.delete(key);
            core.debug(`Evicted from cache: ${key}`);
        }
    }
    async cleanup() {
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
    async close() {
        if (this.redis) {
            await this.redis.quit();
        }
    }
}
exports.CacheManager = CacheManager;
