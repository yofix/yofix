import * as core from '@actions/core';
import { DeterministicRunner } from '../deterministic/testing/DeterministicRunner';
import { FirebaseConfig, TestResult, Viewport } from '../../types';
import { StorageProvider } from '../../providers/storage/types';
import { getGitHubCommentEngine } from '../github/GitHubCommentEngine';

export interface ParallelChunk {
  id: number;
  routes: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  results?: TestResult[];
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface ParallelExecutionOptions {
  chunks: string[][];
  firebaseConfig: FirebaseConfig;
  viewports: Viewport[];
  storageProvider?: StorageProvider;
  maxConcurrency?: number;
  progressCallback?: (progress: ParallelExecutionProgress) => void;
}

export interface ParallelExecutionProgress {
  totalChunks: number;
  completedChunks: number;
  runningChunks: number;
  failedChunks: number;
  totalRoutes: number;
  completedRoutes: number;
  percentage: number;
  estimatedTimeRemaining?: number;
}

export class ParallelTestExecutor {
  private chunks: ParallelChunk[] = [];
  private startTime: number = 0;
  private commentEngine = getGitHubCommentEngine();

  constructor(private options: ParallelExecutionOptions) {
    // Initialize chunks
    this.chunks = options.chunks.map((routes, index) => ({
      id: index,
      routes,
      status: 'pending'
    }));
  }

  /**
   * Execute visual tests in parallel
   */
  async execute(): Promise<TestResult[]> {
    this.startTime = Date.now();
    const maxConcurrency = this.options.maxConcurrency || 3;
    
    core.info(`🚀 Starting parallel execution with ${this.chunks.length} chunks (max concurrency: ${maxConcurrency})`);
    
    // Post initial progress
    await this.postProgressUpdate();

    // Create a queue of chunks to process
    const queue = [...this.chunks];
    const running = new Map<number, Promise<void>>();
    const results: TestResult[] = [];

    // Process chunks with concurrency limit
    while (queue.length > 0 || running.size > 0) {
      // Start new chunks if under concurrency limit
      while (running.size < maxConcurrency && queue.length > 0) {
        const chunk = queue.shift()!;
        const promise = this.processChunk(chunk);
        running.set(chunk.id, promise);
      }

      // Wait for at least one chunk to complete
      if (running.size > 0) {
        await Promise.race(running.values());
        
        // Remove completed chunks
        for (const [id] of running.entries()) {
          const chunk = this.chunks[id];
          if (chunk.status === 'completed' || chunk.status === 'failed') {
            running.delete(id);
            if (chunk.results) {
              results.push(...chunk.results);
            }
          }
        }

        // Update progress
        await this.postProgressUpdate();
      }
    }

    const duration = Date.now() - this.startTime;
    core.info(`✅ Parallel execution completed in ${this.formatDuration(duration)}`);
    
    return results;
  }

  /**
   * Process a single chunk of routes
   */
  private async processChunk(chunk: ParallelChunk): Promise<void> {
    try {
      chunk.status = 'running';
      chunk.startTime = Date.now();
      
      core.info(`🔄 Processing chunk ${chunk.id + 1} with ${chunk.routes.length} routes`);

      // Create a test runner for this chunk
      const runner = new DeterministicRunner(
        this.options.firebaseConfig,
        this.options.storageProvider
      );

      // Initialize the runner
      await runner.initializeStandalone();

      // Initialize baselines if storage is available
      if (this.options.storageProvider) {
        await runner.initializeBaselines(chunk.routes, this.options.viewports);
      }

      // Test each route in the chunk
      const results: TestResult[] = [];
      for (const route of chunk.routes) {
        try {
          core.info(`  📸 Testing route: ${route}`);
          const result = await runner.testRoute(route, this.options.viewports);
          
          results.push({
            testId: `chunk-${chunk.id}-${route}`,
            testName: `Visual test for ${route}`,
            status: result.success ? 'passed' : 'failed',
            duration: Date.now() - chunk.startTime!,
            screenshots: result.screenshots.map((screenshot, index) => ({
              name: `${route.replace(/\//g, '-')}-${this.options.viewports[index].name}`,
              path: `test-results/${route.replace(/\//g, '-')}-${this.options.viewports[index].name}.png`,
              viewport: this.options.viewports[index],
              timestamp: Date.now(),
              buffer: screenshot
            })),
            videos: [],
            errors: result.error ? [result.error] : [],
            consoleMessages: []
          });

          // Call progress callback if provided
          if (this.options.progressCallback) {
            this.options.progressCallback(this.getProgress());
          }
        } catch (error) {
          core.warning(`Failed to test route ${route}: ${error}`);
          results.push({
            testId: `chunk-${chunk.id}-${route}`,
            testName: `Visual test for ${route}`,
            status: 'failed',
            duration: Date.now() - chunk.startTime!,
            screenshots: [],
            videos: [],
            errors: [error instanceof Error ? error.message : String(error)],
            consoleMessages: []
          });
        }
      }

      // Clean up runner
      await runner.cleanup();

      chunk.results = results;
      chunk.status = 'completed';
      chunk.endTime = Date.now();
      
      core.info(`✅ Chunk ${chunk.id + 1} completed in ${this.formatDuration(chunk.endTime - chunk.startTime!)}`);
    } catch (error) {
      chunk.status = 'failed';
      chunk.error = error instanceof Error ? error.message : String(error);
      chunk.endTime = Date.now();
      
      core.error(`❌ Chunk ${chunk.id + 1} failed: ${chunk.error}`);
    }
  }

  /**
   * Get current execution progress
   */
  private getProgress(): ParallelExecutionProgress {
    const totalChunks = this.chunks.length;
    const completedChunks = this.chunks.filter(c => c.status === 'completed').length;
    const runningChunks = this.chunks.filter(c => c.status === 'running').length;
    const failedChunks = this.chunks.filter(c => c.status === 'failed').length;
    
    const totalRoutes = this.chunks.reduce((sum, c) => sum + c.routes.length, 0);
    const completedRoutes = this.chunks
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + c.routes.length, 0);
    
    const percentage = totalRoutes > 0 ? Math.round((completedRoutes / totalRoutes) * 100) : 0;
    
    // Estimate time remaining based on average chunk processing time
    let estimatedTimeRemaining: number | undefined;
    const completedChunkTimes = this.chunks
      .filter(c => c.status === 'completed' && c.startTime && c.endTime)
      .map(c => c.endTime! - c.startTime!);
    
    if (completedChunkTimes.length > 0) {
      const avgChunkTime = completedChunkTimes.reduce((a, b) => a + b, 0) / completedChunkTimes.length;
      const remainingChunks = totalChunks - completedChunks - failedChunks;
      estimatedTimeRemaining = Math.round(avgChunkTime * remainingChunks / 1000); // in seconds
    }
    
    return {
      totalChunks,
      completedChunks,
      runningChunks,
      failedChunks,
      totalRoutes,
      completedRoutes,
      percentage,
      estimatedTimeRemaining
    };
  }

  /**
   * Post progress update to PR
   */
  private async postProgressUpdate(): Promise<void> {
    const progress = this.getProgress();
    
    let message = `## 🚀 Visual Test Progress\n\n`;
    message += `**Status**: Running in parallel (${progress.runningChunks} active chunks)\n\n`;
    
    // Progress bar
    const progressBar = this.createProgressBar(progress.percentage);
    message += `${progressBar} ${progress.percentage}%\n\n`;
    
    // Chunk status
    message += `### 📊 Chunk Status\n\n`;
    message += `| Chunk | Routes | Status | Duration |\n`;
    message += `|-------|--------|--------|----------|\n`;
    
    for (const chunk of this.chunks) {
      const status = this.getStatusEmoji(chunk.status);
      const duration = chunk.endTime && chunk.startTime 
        ? this.formatDuration(chunk.endTime - chunk.startTime)
        : chunk.status === 'running' && chunk.startTime
        ? this.formatDuration(Date.now() - chunk.startTime) + ' ⏱️'
        : '-';
      
      message += `| ${chunk.id + 1} | ${chunk.routes.length} | ${status} | ${duration} |\n`;
    }
    
    message += `\n`;
    
    // Summary
    message += `### 📈 Summary\n\n`;
    message += `- **Total Routes**: ${progress.totalRoutes}\n`;
    message += `- **Completed**: ${progress.completedRoutes} (${progress.percentage}%)\n`;
    message += `- **Chunks**: ${progress.completedChunks}/${progress.totalChunks} completed\n`;
    
    if (progress.failedChunks > 0) {
      message += `- **Failed Chunks**: ${progress.failedChunks} ⚠️\n`;
    }
    
    if (progress.estimatedTimeRemaining) {
      message += `- **ETA**: ~${progress.estimatedTimeRemaining}s remaining\n`;
    }
    
    const elapsed = this.formatDuration(Date.now() - this.startTime);
    message += `- **Elapsed Time**: ${elapsed}\n`;

    // Post or update comment
    try {
      await this.commentEngine.postComment(message, {
        updateExisting: true,
        signature: 'yofix-parallel-progress'
      });
    } catch (error) {
      core.warning(`Failed to post progress update: ${error}`);
    }
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    return `[${'\u2588'.repeat(filled)}${'\u2591'.repeat(empty)}]`;
  }

  /**
   * Get status emoji
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'pending': return '⏳ Pending';
      case 'running': return '🔄 Running';
      case 'completed': return '✅ Completed';
      case 'failed': return '❌ Failed';
      default: return '❓ Unknown';
    }
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Get execution statistics
   */
  getStatistics(): {
    totalDuration: number;
    averageChunkDuration: number;
    successRate: number;
    chunksProcessed: number;
    routesProcessed: number;
  } {
    const totalDuration = Date.now() - this.startTime;
    
    const completedChunks = this.chunks.filter(c => 
      c.status === 'completed' && c.startTime && c.endTime
    );
    
    const averageChunkDuration = completedChunks.length > 0
      ? completedChunks.reduce((sum, c) => sum + (c.endTime! - c.startTime!), 0) / completedChunks.length
      : 0;
    
    const totalTests = this.chunks.reduce((sum, c) => 
      sum + (c.results?.length || 0), 0
    );
    
    const passedTests = this.chunks.reduce((sum, c) => 
      sum + (c.results?.filter(r => r.status === 'passed').length || 0), 0
    );
    
    const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
    
    return {
      totalDuration,
      averageChunkDuration,
      successRate,
      chunksProcessed: completedChunks.length,
      routesProcessed: this.chunks.reduce((sum, c) => 
        c.status === 'completed' ? sum + c.routes.length : sum, 0
      )
    };
  }
}