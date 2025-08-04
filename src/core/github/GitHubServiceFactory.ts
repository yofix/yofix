/**
 * Unified GitHub Service Factory
 * 
 * Provides centralized, testable, and loosely coupled GitHub operations
 * All GitHub API operations should go through this factory
 * 
 * Features:
 * - Lazy initialization
 * - Caching layer for API responses
 * - Rate limiting with automatic retries
 * - Exponential backoff for failed requests
 * - Comprehensive testing support
 * - Environment-independent operation with smart defaults
 */

import { env } from '../hooks/EnvironmentHook';

/**
 * Configuration interface for GitHub services
 * Defines all configurable options for GitHub API operations
 */
export interface GitHubConfig {
  token?: string;
  owner?: string;
  repo?: string;
  baseUrl?: string; // For GitHub Enterprise
  
  // Performance settings
  cache?: {
    enabled?: boolean;
    ttlMs?: number; // Cache TTL in milliseconds
    maxSize?: number; // Maximum cache entries
  };
  rateLimit?: {
    enabled?: boolean;
    requestsPerHour?: number;
    burstLimit?: number;
  };
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
}

/**
 * Represents file content from GitHub API
 * Contains all necessary information about a file including its metadata
 */
export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  sha: string;
}

/**
 * Check run data for GitHub status checks
 * Defines the structure for creating and updating GitHub check runs
 */
export interface CheckRunData {
  id?: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
  output?: {
    title: string;
    summary: string;
    text?: string;
    annotations?: Array<{
      path: string;
      start_line: number;
      end_line: number;
      annotation_level: 'notice' | 'warning' | 'failure';
      message: string;
    }>;
  };
}

/**
 * Cache entry interface
 */
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Simple LRU (Least Recently Used) cache implementation
 * Provides automatic expiration and size-based eviction
 * 
 * @template T The type of data stored in the cache
 */
class LRUCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;

  constructor(private maxSize: number = 100) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.delete(key);
      return undefined;
    }

    // Update access order
    this.accessOrder.set(key, ++this.accessCounter);
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    // Remove oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
    this.accessOrder.set(key, ++this.accessCounter);
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  private evictOldest(): void {
    let oldestKey = '';
    let oldestAccess = Infinity;

    for (const [key, access] of this.accessOrder.entries()) {
      if (access < oldestAccess) {
        oldestAccess = access;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }
}

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRate: number // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Wait until we can get a token
    const waitTime = (1 - this.tokens) / this.refillRate * 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    this.tokens--;
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

/**
 * Retry utility with exponential backoff
 */
class RetryHelper {
  static async withExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on authentication errors or client errors (4xx)
        if (error.status && error.status >= 400 && error.status < 500) {
          throw error;
        }

        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with jitter
        const delay = Math.min(
          maxDelayMs,
          baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

/**
 * Main GitHub service interface
 * Defines all GitHub API operations used throughout the application
 * All implementations must provide consistent behavior for testing and production
 * All operations are async and don't require token at construction time
 */
export interface GitHubService {
  // Configuration
  configure(config: GitHubConfig): Promise<void>;
  isConfigured(): boolean;
  
  // Pull Request operations
  listPullRequestFiles(): Promise<Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>>;
  
  // Comment operations
  createComment(body: string): Promise<{ id: number; html_url: string }>;
  updateComment(commentId: number, body: string): Promise<void>;
  listComments(): Promise<Array<{
    id: number;
    body: string;
    user: { login: string };
    created_at: string;
  }>>;
  
  // Reaction operations
  addReaction(commentId: number, reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'): Promise<void>;
  
  // Repository operations
  getFileContent(path: string, ref?: string): Promise<FileContent | null>;
  
  // Alias for getFileContent
  getContent(path: string, ref?: string): Promise<FileContent | null>;
  
  // Check run operations
  listCheckRuns(ref?: string): Promise<Array<CheckRunData & { id: number }>>;
  createCheckRun(data: CheckRunData): Promise<{ id: number }>;
  updateCheckRun(checkRunId: number, data: Partial<CheckRunData>): Promise<void>;
  
  // Issue operations
  createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; html_url: string }>;
  
  // Context operations (for GitHub Actions)
  getContext(): {
    owner: string;
    repo: string;
    sha?: string;
    prNumber?: number;
    actor?: string;
    eventName?: string;
    payload?: {
      pull_request?: {
        number: number;
        head?: { sha: string };
      };
      issue?: {
        number: number;
        pull_request?: any;
      };
      comment?: {
        id: number;
        body: string;
        user: { login: string };
      };
    };
  };
  
  // Get PR number with guaranteed default (0 if not in PR context)
  getPRNumber(): number;
}

/**
 * Mock implementation for testing
 */
export class MockGitHubService implements GitHubService {
  private configured = false;
  private config: GitHubConfig = {};
  private mockData = {
    files: new Map<string, any[]>(),
    comments: new Map<string, any[]>(),
    fileContents: new Map<string, FileContent>(),
    checkRuns: new Map<string, any[]>(),
    context: {
      owner: 'test-owner',
      repo: 'test-repo',
      sha: 'test-sha',
      prNumber: 123,
      actor: 'test-actor',
      eventName: 'pull_request',
      payload: {
        pull_request: { number: 123, head: { sha: 'test-sha' } },
        issue: { number: 123, pull_request: {} },
        comment: { id: 1, body: 'test comment', user: { login: 'test-user' } }
      }
    }
  };
  
  async configure(config: GitHubConfig): Promise<void> {
    this.config = config;
    this.configured = true;
  }
  
  isConfigured(): boolean {
    return this.configured;
  }
  
  // Mock data setters for testing
  setMockFiles(prNumber: number, files: any[]): void {
    this.mockData.files.set(`${prNumber}`, files);
  }
  
  setMockComments(issueNumber: number, comments: any[]): void {
    this.mockData.comments.set(`${issueNumber}`, comments);
  }
  
  setMockFileContent(path: string, content: FileContent): void {
    this.mockData.fileContents.set(path, content);
  }
  
  setMockContext(context: any): void {
    this.mockData.context = { ...this.mockData.context, ...context };
  }
  
  // Implementation of interface methods
  async listPullRequestFiles(): Promise<any[]> {
    const context = this.getContext();
    return this.mockData.files.get(`${context.prNumber}`) || [];
  }
  
  async createComment(body: string): Promise<{ id: number; html_url: string }> {
    const context = this.getContext();
    const comment = { id: Date.now(), body, user: { login: 'test-bot' }, created_at: new Date().toISOString() };
    const comments = this.mockData.comments.get(`${context.prNumber}`) || [];
    comments.push(comment);
    this.mockData.comments.set(`${context.prNumber}`, comments);
    return { id: comment.id, html_url: `https://github.com/${context.owner}/${context.repo}/pull/${context.prNumber}#comment-${comment.id}` };
  }
  
  async updateComment(commentId: number, body: string): Promise<void> {
    // Find and update the comment in all stored comments
    for (const [issueNumber, comments] of this.mockData.comments.entries()) {
      const commentIndex = comments.findIndex(c => c.id === commentId);
      if (commentIndex !== -1) {
        comments[commentIndex].body = body;
        this.mockData.comments.set(issueNumber, comments);
        return;
      }
    }
    console.log(`Mock: Updated comment ${commentId} with body: ${body}`);
  }
  
  async listComments(): Promise<any[]> {
    const context = this.getContext();
    return this.mockData.comments.get(`${context.prNumber}`) || [];
  }
  
  async addReaction(commentId: number, reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'): Promise<void> {
    console.log(`Mock: Added ${reaction} reaction to comment ${commentId}`);
  }
  
  async getFileContent(path: string, ref?: string): Promise<FileContent | null> {
    return this.mockData.fileContents.get(path) || null;
  }
  
  async getContent(path: string, ref?: string): Promise<FileContent | null> {
    return this.getFileContent(path, ref);
  }
  
  async listCheckRuns(ref?: string): Promise<any[]> {
    const context = this.getContext();
    const finalRef = ref || context.sha || 'main';
    return this.mockData.checkRuns.get(finalRef) || [];
  }
  
  async createCheckRun(data: CheckRunData): Promise<{ id: number }> {
    const context = this.getContext();
    const checkRun = { ...data, id: Date.now() };
    const runs = this.mockData.checkRuns.get(context.sha || 'main') || [];
    runs.push(checkRun);
    this.mockData.checkRuns.set(context.sha || 'main', runs);
    return { id: checkRun.id };
  }
  
  async updateCheckRun(checkRunId: number, data: Partial<CheckRunData>): Promise<void> {
    // Find and update the check run in all stored check runs
    for (const [ref, checkRuns] of this.mockData.checkRuns.entries()) {
      const checkRunIndex = checkRuns.findIndex(c => c.id === checkRunId);
      if (checkRunIndex !== -1) {
        checkRuns[checkRunIndex] = { ...checkRuns[checkRunIndex], ...data };
        this.mockData.checkRuns.set(ref, checkRuns);
        return;
      }
    }
    console.log(`Mock: Updated check run ${checkRunId}`);
  }
  
  async createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; html_url: string }> {
    const context = this.getContext();
    const issueNumber = Date.now();
    return { 
      number: issueNumber, 
      html_url: `https://github.com/${context.owner}/${context.repo}/issues/${issueNumber}` 
    };
  }
  
  getContext() {
    return this.mockData.context;
  }
  
  getPRNumber(): number {
    return this.mockData.context.prNumber;
  }

  // Test helper methods
  setMockPRFiles(owner: string, repo: string, prNumber: number, files: any[]) {
    this.mockData.files.set(`${prNumber}`, files);
  }
}

/**
 * Enhanced GitHub service with caching, rate limiting, and retry logic
 */
export class EnhancedGitHubService implements GitHubService {
  private octokit?: any;
  private config: GitHubConfig = {};
  private cache?: LRUCache;
  private rateLimiter?: RateLimiter;
  
  async configure(config: GitHubConfig): Promise<void> {
    this.config = { ...config };
    
    // Set up caching
    if (config.cache?.enabled !== false) {
      this.cache = new LRUCache(config.cache?.maxSize || 100);
    }
    
    // Set up rate limiting
    if (config.rateLimit?.enabled !== false) {
      const requestsPerHour = config.rateLimit?.requestsPerHour || 5000;
      const requestsPerSecond = requestsPerHour / 3600;
      this.rateLimiter = new RateLimiter(
        config.rateLimit?.burstLimit || 10,
        requestsPerSecond
      );
    }
    
    if (config.token) {
      const github = await import('@actions/github');
      this.octokit = github.getOctokit(config.token);
    }
  }
  
  isConfigured(): boolean {
    return !!this.octokit;
  }
  
  private ensureConfigured(): void {
    if (!this.octokit) {
      throw new Error('GitHub service not configured. Call configure() first.');
    }
  }
  
  private getCacheKey(method: string, ...args: any[]): string {
    return `${method}:${JSON.stringify(args)}`;
  }
  
  private async withCacheAndRateLimit<T>(
    cacheKey: string,
    operation: () => Promise<T>,
    cacheable: boolean = true
  ): Promise<T> {
    // Check cache first
    if (cacheable && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }
    
    // Apply rate limiting
    if (this.rateLimiter) {
      await this.rateLimiter.waitForToken();
    }
    
    // Execute with retry logic
    const retryConfig = this.config.retry;
    const result = await RetryHelper.withExponentialBackoff(
      operation,
      retryConfig?.enabled !== false ? (retryConfig?.maxRetries || 3) : 0,
      retryConfig?.baseDelayMs || 1000,
      retryConfig?.maxDelayMs || 30000
    );
    
    // Cache result
    if (cacheable && this.cache) {
      const ttl = this.config.cache?.ttlMs || 300000; // 5 minutes default
      this.cache.set(cacheKey, result, ttl);
    }
    
    return result;
  }
  
  async listPullRequestFiles(): Promise<any[]> {
    this.ensureConfigured();
    const context = this.getContext();
    const cacheKey = this.getCacheKey('listPullRequestFiles', context.owner, context.repo, context.prNumber);
    
    return this.withCacheAndRateLimit(cacheKey, async () => {
      console.log(`[EnhancedGitHubService] Listing PR files for PR #${context.prNumber}`);
      if (!context.prNumber) {
        throw new Error('[EnhancedGitHubService] No PR number found in GitHub context. This action requires a pull_request event.');
      }
      
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.prNumber,
        per_page: 100
      });
      
      console.log(`[EnhancedGitHubService] Found ${data.length} files in PR #${context.prNumber}:`);
      data.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`);
      });
      
      return data;
    });
  }
  
  async createComment(body: string): Promise<{ id: number; html_url: string }> {
    this.ensureConfigured();
    const context = this.getContext();
    
    return this.withCacheAndRateLimit('', async () => {
      const { data } = await this.octokit.rest.issues.createComment({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.prNumber,
        body
      });
      
      // Invalidate related caches
      if (this.cache) {
        const listCommentsKey = this.getCacheKey('listComments', context.owner, context.repo, context.prNumber);
        this.cache.delete(listCommentsKey);
      }
      
      return { id: data.id, html_url: data.html_url };
    }, false); // Don't cache write operations
  }
  
  async updateComment(commentId: number, body: string): Promise<void> {
    this.ensureConfigured();
    const context = this.getContext();
    
    return this.withCacheAndRateLimit('', async () => {
      await this.octokit.rest.issues.updateComment({
        owner: context.owner,
        repo: context.repo,
        comment_id: commentId,
        body
      });
      
      // Invalidate related caches
      if (this.cache) {
        // We don't know which issue this comment belongs to, so we'd need to clear more broadly
        // or maintain a reverse index. For now, we'll rely on TTL expiration.
      }
    }, false);
  }
  
  async listComments(): Promise<any[]> {
    this.ensureConfigured();
    const context = this.getContext();
    const cacheKey = this.getCacheKey('listComments', context.owner, context.repo, context.prNumber);
    
    return this.withCacheAndRateLimit(cacheKey, async () => {
      const { data } = await this.octokit.rest.issues.listComments({
        owner: context.owner,
        repo: context.repo,
        issue_number: context.prNumber,
        per_page: 100
      });
      return data;
    });
  }
  
  async addReaction(commentId: number, reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'): Promise<void> {
    this.ensureConfigured();
    const context = this.getContext();
    
    return this.withCacheAndRateLimit('', async () => {
      await this.octokit.rest.reactions.createForIssueComment({
        owner: context.owner,
        repo: context.repo,
        comment_id: commentId,
        content: reaction
      });
    }, false);
  }
  
  async getFileContent(path: string, ref?: string): Promise<FileContent | null> {
    this.ensureConfigured();
    const context = this.getContext();
    const cacheKey = this.getCacheKey('getFileContent', context.owner, context.repo, path, ref);
    
    return this.withCacheAndRateLimit(cacheKey, async () => {
      try {
        const { data } = await this.octokit.rest.repos.getContent({
          owner: context.owner,
          repo: context.repo,
          path,
          ref
        });
        
        if ('content' in data && !Array.isArray(data)) {
          return {
            path: data.path,
            content: data.content,
            encoding: data.encoding,
            sha: data.sha
          };
        }
        return null;
      } catch (error: any) {
        if (error.status === 404) {
          return null;
        }
        throw error;
      }
    });
  }
  
  async getContent(path: string, ref?: string): Promise<FileContent | null> {
    return this.getFileContent(path, ref);
  }
  
  async listCheckRuns(ref?: string): Promise<any[]> {
    this.ensureConfigured();
    const context = this.getContext();
    const finalRef = ref || context.sha || 'main';
    const cacheKey = this.getCacheKey('listCheckRuns', context.owner, context.repo, finalRef);
    
    return this.withCacheAndRateLimit(cacheKey, async () => {
      const { data } = await this.octokit.rest.checks.listForRef({
        owner: context.owner,
        repo: context.repo,
        ref: finalRef
      });
      return data.check_runs;
    });
  }
  
  async createCheckRun(data: CheckRunData): Promise<{ id: number }> {
    this.ensureConfigured();
    const context = this.getContext();
    
    return this.withCacheAndRateLimit('', async () => {
      const { data: result } = await this.octokit.rest.checks.create({
        owner: context.owner,
        repo: context.repo,
        head_sha: context.sha || 'main',
        ...data
      });
      
      // Invalidate related caches
      if (this.cache) {
        const listCheckRunsKey = this.getCacheKey('listCheckRuns', context.owner, context.repo, context.sha);
        this.cache.delete(listCheckRunsKey);
      }
      
      return { id: result.id };
    }, false);
  }
  
  async updateCheckRun(checkRunId: number, data: Partial<CheckRunData>): Promise<void> {
    this.ensureConfigured();
    const context = this.getContext();
    
    return this.withCacheAndRateLimit('', async () => {
      await this.octokit.rest.checks.update({
        owner: context.owner,
        repo: context.repo,
        check_run_id: checkRunId,
        ...data
      });
    }, false);
  }
  
  async createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; html_url: string }> {
    this.ensureConfigured();
    const context = this.getContext();
    
    return this.withCacheAndRateLimit('', async () => {
      const { data } = await this.octokit.rest.issues.create({
        owner: context.owner,
        repo: context.repo,
        title,
        body,
        labels
      });
      return { number: data.number, html_url: data.html_url };
    }, false);
  }
  
  getContext() {
    // Context doesn't require API calls, so no caching/rate limiting needed
    if (env.getWithDefaults('GITHUB_ACTIONS') === 'true') {
      const repository = env.getWithDefaults('GITHUB_REPOSITORY') || 'test-owner/test-repo';
      const [owner, repo] = repository.split('/');
      let payload = {};
      const eventName = env.getWithDefaults('GITHUB_EVENT_NAME');
      
      try {
        const eventPath = env.getWithDefaults('GITHUB_EVENT_PATH');
        if (eventPath) {
          const fs = require('fs');
          payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
          console.log(`GitHub event payload loaded from ${eventPath}`);
          console.log(`Event name: ${eventName}`);
          console.log(`PR number in payload: ${(payload as any)?.pull_request?.number}`);
        }
      } catch (error) {
        console.error('Failed to parse GitHub event payload:', error);
      }
      
      // Get PR number from payload
      const prNumber = (payload as any)?.pull_request?.number || (payload as any)?.issue?.number;
      
      console.log(`Extracted PR number: ${prNumber}`);
      console.log(`Repository: ${owner}/${repo}`);
      console.log(`GitHub SHA: ${env.getWithDefaults('GITHUB_SHA')}`);
      console.log(`GitHub Actor: ${env.getWithDefaults('GITHUB_ACTOR')}`);
      console.log(`GitHub Event Name: ${eventName}`);
      
      return {
        owner,
        repo,
        sha: env.getWithDefaults('GITHUB_SHA'),
        prNumber,
        actor: env.getWithDefaults('GITHUB_ACTOR'),
        eventName,
        payload
      };
    }
    
    // Fallback to config
    return {
      owner: this.config.owner || '',
      repo: this.config.repo || '',
      sha: undefined,
      prNumber: undefined,
      actor: undefined,
      eventName: undefined,
      payload: {}
    };
  }
  
  getPRNumber(): number {
    return this.getContext().prNumber;
  }
  
  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }
  
  /**
   * Reset rate limiter (useful for testing)
   */
  resetRateLimit(): void {
    if (this.rateLimiter) {
      this.rateLimiter.reset();
    }
  }
}

/**
 * Real GitHub implementation using Octokit (legacy - use EnhancedGitHubService instead)
 */
export class OctokitGitHubService implements GitHubService {
  private octokit?: any;
  private config: GitHubConfig = {};
  
  async configure(config: GitHubConfig): Promise<void> {
    this.config = config;
    
    if (config.token) {
      // Use @actions/github for consistency with existing codebase
      const github = await import('@actions/github');
      this.octokit = github.getOctokit(config.token);
    }
  }
  
  isConfigured(): boolean {
    return !!this.octokit;
  }
  
  private ensureConfigured(): void {
    if (!this.octokit) {
      throw new Error('GitHub service not configured. Call configure() first.');
    }
  }
  
  async listPullRequestFiles(owner?: string, repo?: string, prNumber?: number): Promise<any[]> {
    this.ensureConfigured();
    let finalOwner: string;
    let finalRepo: string;
    let finalPrNumber: number;
    
    // Contextual overload
    if (arguments.length === 0) {
      const context = this.getContext();
      finalOwner = context.owner;
      finalRepo = context.repo;
      finalPrNumber = context.prNumber;
      
      console.log(`[OctokitGitHubService] Listing PR files for PR #${finalPrNumber}`);
      if (!context.prNumber) {
        throw new Error('[OctokitGitHubService] No PR number found in GitHub context. This action requires a pull_request event.');
      }
    } else {
      // Explicit parameters overload
      finalOwner = owner!;
      finalRepo = repo!;
      finalPrNumber = prNumber!;
    }
    
    const { data } = await this.octokit.rest.pulls.listFiles({
      owner: finalOwner,
      repo: finalRepo,
      pull_number: finalPrNumber,
      per_page: 100
    });
    
    console.log(`[OctokitGitHubService] Found ${data.length} files in PR #${finalPrNumber}:`);
    data.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`);
    });
    
    return data;
  }
  
  async createComment(body: string): Promise<{ id: number; html_url: string }> {
    this.ensureConfigured();
    const context = this.getContext();
    
    const { data } = await this.octokit.rest.issues.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.prNumber,
      body
    });
    return { id: data.id, html_url: data.html_url };
  }
  
  async updateComment(commentId: number, body: string): Promise<void> {
    this.ensureConfigured();
    const context = this.getContext();
    
    await this.octokit.rest.issues.updateComment({
      owner: context.owner,
      repo: context.repo,
      comment_id: commentId,
      body
    });
  }
  
  async listComments(): Promise<any[]> {
    this.ensureConfigured();
    const context = this.getContext();
    
    const { data } = await this.octokit.rest.issues.listComments({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.prNumber,
      per_page: 100
    });
    return data;
  }
  
  async addReaction(commentId: number, reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'): Promise<void> {
    this.ensureConfigured();
    const context = this.getContext();
    
    await this.octokit.rest.reactions.createForIssueComment({
      owner: context.owner,
      repo: context.repo,
      comment_id: commentId,
      content: reaction
    });
  }
  
  async getFileContent(path: string, ref?: string): Promise<FileContent | null> {
    this.ensureConfigured();
    const context = this.getContext();
    
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: context.owner,
        repo: context.repo,
        path,
        ref
      });
      
      if ('content' in data && !Array.isArray(data)) {
        return {
          path: data.path,
          content: data.content,
          encoding: data.encoding,
          sha: data.sha
        };
      }
      return null;
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }
  
  async getContent(path: string, ref?: string): Promise<FileContent | null> {
    return this.getFileContent(path, ref);
  }
  
  async listCheckRuns(ref?: string): Promise<any[]> {
    this.ensureConfigured();
    const context = this.getContext();
    const finalRef = ref || context.sha || 'main';
    
    const { data } = await this.octokit.rest.checks.listForRef({
      owner: context.owner,
      repo: context.repo,
      ref: finalRef
    });
    return data.check_runs;
  }
  
  async createCheckRun(data: CheckRunData): Promise<{ id: number }> {
    this.ensureConfigured();
    const context = this.getContext();
    
    const { data: result } = await this.octokit.rest.checks.create({
      owner: context.owner,
      repo: context.repo,
      head_sha: context.sha || 'main',
      ...data
    });
    return { id: result.id };
  }
  
  async updateCheckRun(checkRunId: number, data: Partial<CheckRunData>): Promise<void> {
    this.ensureConfigured();
    const context = this.getContext();
    
    await this.octokit.rest.checks.update({
      owner: context.owner,
      repo: context.repo,
      check_run_id: checkRunId,
      ...data
    });
  }
  
  async createIssue(title: string, body: string, labels?: string[]): Promise<{ number: number; html_url: string }> {
    this.ensureConfigured();
    const context = this.getContext();
    
    const { data } = await this.octokit.rest.issues.create({
      owner: context.owner,
      repo: context.repo,
      title,
      body,
      labels
    });
    return { number: data.number, html_url: data.html_url };
  }
  
  getContext() {
    // In GitHub Actions environment
    if (env.getWithDefaults('GITHUB_ACTIONS') === 'true') {
      const repository = env.getWithDefaults('GITHUB_REPOSITORY') || 'test-owner/test-repo';
      const [owner, repo] = repository.split('/');
      let payload = {};
      const eventName = env.getWithDefaults('GITHUB_EVENT_NAME');
      
      try {
        const eventPath = env.getWithDefaults('GITHUB_EVENT_PATH');
        if (eventPath) {
          const fs = require('fs');
          payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
          console.log(`[OctokitGitHubService] GitHub event payload loaded from ${eventPath}`);
          console.log(`[OctokitGitHubService] Event name: ${eventName}`);
          console.log(`[OctokitGitHubService] PR number in payload: ${(payload as any)?.pull_request?.number}`);
        }
      } catch (error) {
        console.error('[OctokitGitHubService] Failed to parse GitHub event payload:', error);
      }
      
      // Get PR number from payload
      const prNumber = (payload as any)?.pull_request?.number || (payload as any)?.issue?.number;
  
      console.log(`[OctokitGitHubService] Extracted PR number: ${prNumber}`);
      console.log(`[OctokitGitHubService] Repository: ${owner}/${repo}`);
      console.log(`[OctokitGitHubService] GitHub SHA: ${env.getWithDefaults('GITHUB_SHA')}`);
      console.log(`[OctokitGitHubService] GitHub Actor: ${env.getWithDefaults('GITHUB_ACTOR')}`);
      console.log(`[OctokitGitHubService] GitHub Event Name: ${eventName}`);
      
      return {
        owner,
        repo,
        sha: env.getWithDefaults('GITHUB_SHA'),
        prNumber,
        actor: env.getWithDefaults('GITHUB_ACTOR'),
        eventName,
        payload
      };
    }
    
    // Fallback to config
    return {
      owner: this.config.owner || '',
      repo: this.config.repo || '',
      sha: undefined,
      prNumber: undefined,
      actor: undefined,
      eventName: undefined,
      payload: {}
    };
  }
  
  getPRNumber(): number {
    return this.getContext().prNumber;
  }
}

/**
 * Lazy initialization wrapper that defers token requirement
 */
export class LazyGitHubService implements GitHubService {
  private service?: GitHubService;
  private pendingConfig?: GitHubConfig;
  
  async configure(config: GitHubConfig): Promise<void> {
    this.pendingConfig = { ...this.pendingConfig, ...config };
  }
  
  isConfigured(): boolean {
    return !!this.service || !!this.pendingConfig?.token || !!env.getWithDefaults('GITHUB_TOKEN') || !!env.getWithDefaults('INPUT_GITHUB_TOKEN');
  }
  
  private async ensureService(): Promise<GitHubService> {
    if (!this.service) {
      // Try to get token from various sources
      const token = this.pendingConfig?.token 
        || env.getWithDefaults('GITHUB_TOKEN') 
        || env.getWithDefaults('INPUT_GITHUB_TOKEN');
        
      if (!token && env.getWithDefaults('NODE_ENV') !== 'test') {
        throw new Error('GitHub token not available. Configure with token or set GITHUB_TOKEN environment variable.');
      }
      
      this.service = env.getWithDefaults('NODE_ENV') === 'test' 
        ? new MockGitHubService()
        : new EnhancedGitHubService();
        
      await this.service.configure({ ...this.pendingConfig, token });
    }
    return this.service;
  }
  
  // Delegate all methods to the underlying service
  async listPullRequestFiles() {
    const service = await this.ensureService();
    return service.listPullRequestFiles();
  }
  
  async createComment(body: string) {
    const service = await this.ensureService();
    return service.createComment(body);
  }
  
  async updateComment(commentId: number, body: string) {
    const service = await this.ensureService();
    return service.updateComment(commentId, body);
  }
  
  async listComments() {
    const service = await this.ensureService();
    return service.listComments();
  }
  
  async addReaction(commentId: number, reaction: '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes') {
    const service = await this.ensureService();
    return service.addReaction(commentId, reaction);
  }
  
  async getFileContent(path: string, ref?: string) {
    const service = await this.ensureService();
    return service.getFileContent(path, ref);
  }
  
  async getContent(path: string, ref?: string) {
    const service = await this.ensureService();
    return service.getContent(path, ref);
  }
  
  async listCheckRuns(ref?: string) {
    const service = await this.ensureService();
    return service.listCheckRuns(ref);
  }
  
  async createCheckRun(data: CheckRunData) {
    const service = await this.ensureService();
    return service.createCheckRun(data);
  }
  
  async updateCheckRun(checkRunId: number, data: Partial<CheckRunData>) {
    const service = await this.ensureService();
    return service.updateCheckRun(checkRunId, data);
  }
  
  async createIssue(title: string, body: string, labels?: string[]) {
    const service = await this.ensureService();
    return service.createIssue(title, body, labels);
  }
  
  getContext() {
    // Context doesn't require token
    if (this.service) {
      return this.service.getContext();
    }
    
    // Return context from environment even without service
    const repository = env.getWithDefaults('GITHUB_REPOSITORY') || 'test-owner/test-repo';
    const [owner, repo] = repository.split('/');
    return {
      owner: this.pendingConfig?.owner || owner || '',
      repo: this.pendingConfig?.repo || repo || '',
      sha: env.getWithDefaults('GITHUB_SHA'),
      prNumber: undefined,
      actor: env.getWithDefaults('GITHUB_ACTOR'),
      eventName: env.getWithDefaults('GITHUB_EVENT_NAME'),
      payload: {}
    };
  }
  
  getPRNumber(): number {
    const context = this.getContext();
    return context.prNumber;
  }
}

/**
 * Main factory for creating GitHub services
 * 
 * Provides a centralized way to create and manage GitHub service instances.
 * Supports multiple service types: Mock (for testing), Enhanced (with caching/rate limiting), 
 * and Legacy (basic Octokit wrapper).
 * 
 * Features:
 * - Singleton pattern for consistent service instances
 * - Automatic service selection based on environment
 * - Configuration management for all service types
 * - Performance enhancements (caching, rate limiting, retry logic)
 * 
 * @example
 * ```typescript
 * // Get singleton instance (recommended)
 * const service = GitHubServiceFactory.getInstance();
 * 
 * // Create specific service type
 * const enhanced = GitHubServiceFactory.createEnhancedService({
 *   token: 'ghp_xxx',
 *   cache: { enabled: true },
 *   rateLimit: { enabled: true }
 * });
 * ```
 */
export class GitHubServiceFactory {
  private static instance?: GitHubService;
  
  /**
   * Get or create a GitHub service instance
   * Uses lazy initialization - token not required until first API call
   */
  static getService(): GitHubService {
    if (!this.instance) {
      this.instance = new LazyGitHubService();
    }
    return this.instance;
  }
  
  /**
   * Set a custom service instance (useful for testing)
   */
  static setService(service: GitHubService): void {
    this.instance = service;
  }
  
  /**
   * Reset the factory (useful for testing)
   */
  static reset(): void {
    this.instance = undefined;
  }
  
  /**
   * Create a new instance without singleton pattern
   */
  static createService(options: {
    mock?: boolean;
    enhanced?: boolean;
    config?: GitHubConfig;
  } = {}): GitHubService {
    const { mock = false, enhanced = true, config } = options;
    
    // Only use mock if explicitly requested or in test environment without explicit override
    if (mock || (env.getWithDefaults('NODE_ENV') === 'test' && mock !== false)) {
      const service = new MockGitHubService();
      if (config) {
        service.configure(config);
      }
      return service;
    }
    
    if (enhanced) {
      const service = new EnhancedGitHubService();
      if (config) {
        service.configure(config);
      }
      return service;
    }
    
    // Legacy Octokit service
    const service = new OctokitGitHubService();
    if (config) {
      service.configure(config);
    }
    return service;
  }
  
  /**
   * Create enhanced service with custom configuration
   */
  static createEnhancedService(config: GitHubConfig): EnhancedGitHubService {
    const service = new EnhancedGitHubService();
    service.configure(config);
    return service;
  }
}