import { GitHubCacheManager, CacheNamespaces, Cacheable, getGitHubCache } from '../GitHubCacheManager';

/**
 * Example usage of GitHubCacheManager for various caching scenarios
 */

// 1. Basic usage - caching route analysis results
export async function cacheRouteAnalysis(routes: string[], analysis: any) {
  const cache = getGitHubCache();
  
  // Cache with PR context
  await cache.set(
    CacheNamespaces.ROUTE_ANALYSIS,
    'analyzed-routes',
    { routes, analysis },
    { ttl: 86400 } // Override TTL to 24 hours
  );
}

// 2. Using PR-specific keys
export async function cachePreviewScreenshot(prNumber: number, route: string, screenshot: Buffer) {
  const cache = getGitHubCache();
  
  // Build a PR-specific key
  const key = cache.buildPRKey(CacheNamespaces.VISUAL_BASELINES, prNumber, route);
  
  await cache.set(
    CacheNamespaces.VISUAL_BASELINES,
    key,
    screenshot.toString('base64')
  );
}

// 3. Using the @Cacheable decorator
export class AIAnalyzer {
  private cache = getGitHubCache();
  
  @Cacheable(CacheNamespaces.AI_RESPONSES, (prompt: string) => `ai:${prompt.substring(0, 50)}`)
  async analyzeWithAI(prompt: string): Promise<string> {
    // Expensive AI call - will be cached automatically
    return await this.callClaudeAPI(prompt);
  }
  
  private async callClaudeAPI(prompt: string): Promise<string> {
    // AI API call implementation
    return 'AI response';
  }
}

// 4. Using withCache wrapper
export async function getTestResults(testId: string) {
  const cache = getGitHubCache();
  
  return await cache.withCache(
    CacheNamespaces.TEST_RESULTS,
    testId,
    async () => {
      // Expensive operation to fetch test results
      console.log('Fetching test results from storage...');
      return { 
        testId, 
        passed: true, 
        timestamp: Date.now() 
      };
    },
    { ttl: 3600 } // Cache for 1 hour
  );
}

// 5. Custom namespace example
export async function setupCustomCache() {
  const cache = getGitHubCache();
  
  // Register a custom namespace
  cache.registerNamespace({
    name: 'deployment_status',
    ttl: 300, // 5 minutes
    description: 'Deployment status tracking'
  });
  
  // Use the custom namespace
  await cache.set(
    'deployment_status',
    'current',
    { status: 'in_progress', startTime: Date.now() }
  );
}

// 6. Getting cached data with metadata
export async function getCachedDataWithContext(key: string) {
  const cache = getGitHubCache();
  
  const entry = await cache.getWithMetadata(
    CacheNamespaces.ROUTE_ANALYSIS,
    key
  );
  
  if (entry) {
    console.log('Data:', entry.data);
    console.log('Created by:', entry.metadata.actor);
    console.log('For PR:', entry.metadata.prNumber);
    console.log('Expires at:', new Date(entry.metadata.expiresAt));
  }
}

// 7. Repository-wide caching
export async function cacheRepoConfig(config: any) {
  const cache = getGitHubCache();
  
  // Build a repo-specific key
  const key = cache.buildRepoKey(CacheNamespaces.ROUTE_ANALYSIS, 'config');
  
  await cache.set(
    CacheNamespaces.ROUTE_ANALYSIS,
    key,
    config
  );
}

// 8. SHA-specific caching (for commit-based data)
export async function cacheBuildArtifacts(sha: string, artifacts: any) {
  const cache = getGitHubCache();
  
  // Build a SHA-specific key
  const key = cache.buildSHAKey(CacheNamespaces.TEST_RESULTS, sha, 'artifacts');
  
  await cache.set(
    CacheNamespaces.TEST_RESULTS,
    key,
    artifacts
  );
}

// 9. Authentication session caching
export async function cacheAuthSession(sessionId: string, sessionData: any) {
  const cache = getGitHubCache();
  
  await cache.set(
    CacheNamespaces.AUTH_SESSIONS,
    sessionId,
    sessionData
    // Uses default TTL from namespace (4 hours)
  );
}

// 10. Cache statistics
export async function printCacheStats() {
  const cache = getGitHubCache();
  const stats = await cache.getStats();
  
  console.log('Cache Namespaces:');
  stats.namespaces.forEach(ns => {
    console.log(`  - ${ns.name}: ${ns.description} (TTL: ${ns.ttl}s)`);
  });
  
  console.log('\nCache Statistics:', stats.cacheStats);
}