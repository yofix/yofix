import * as core from '@actions/core';
import { BaselineStorage } from '../baseline/BaselineStorage';
import { BaselineStrategyFactory } from '../baseline/BaselineStrategies';
import { VisualDiffer } from '../baseline/VisualDiffer';
import { 
  Baseline, 
  BaselineUpdateRequest,
  BaselineComparison,
  BaselineQuery
} from '../baseline/types';
import * as github from '@actions/github';

/**
 * Manages visual baselines for comparison
 */
export class BaselineManager {
  private storage: BaselineStorage;
  private differ: VisualDiffer;
  private strategy: string;

  constructor(
    firebaseConfig?: any,
    options?: {
      strategy?: string;
      diffThreshold?: number;
    }
  ) {
    this.storage = new BaselineStorage(firebaseConfig);
    this.differ = new VisualDiffer({
      threshold: options?.diffThreshold || 0.1
    });
    this.strategy = options?.strategy || 'smart';
  }

  /**
   * Initialize baseline manager
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
  }

  /**
   * Update baseline for a PR
   */
  async updateBaseline(request: BaselineUpdateRequest): Promise<void> {
    core.info(`Updating baseline for PR #${request.prNumber}`);
    
    const repository = BaselineStorage.getCurrentRepository();
    const commit = github.context.sha;
    const author = github.context.actor;
    
    for (const screenshot of request.screenshots) {
      try {
        // Calculate fingerprint
        const fingerprint = this.calculateFingerprint(screenshot.buffer);
        
        // Save image to storage
        const imagePath = await this.storage.saveImage(
          screenshot.buffer,
          {
            route: screenshot.route,
            viewport: screenshot.viewport,
            prNumber: request.prNumber,
            ...screenshot.metadata
          }
        );
        
        // Create baseline record
        const baseline = await this.storage.save({
          repository,
          route: screenshot.route,
          viewport: screenshot.viewport,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            commit,
            author,
            prNumber: request.prNumber,
            tags: ['pr-update'],
            ...screenshot.metadata
          },
          fingerprint,
          dimensions: this.getImageDimensions(screenshot.buffer)
        });
        
        core.info(`✅ Updated baseline for ${screenshot.route} at ${screenshot.viewport}`);
      } catch (error) {
        core.error(`Failed to update baseline for ${screenshot.route}: ${error.message}`);
      }
    }
  }

  /**
   * Get baseline for comparison
   */
  async getBaseline(
    route: string, 
    viewport: string,
    options?: {
      strategy?: string;
      prNumber?: number;
      branch?: string;
    }
  ): Promise<Baseline | null> {
    // Build query
    const query: BaselineQuery = {
      repository: BaselineStorage.getCurrentRepository(),
      route,
      viewport,
      limit: 50 // Get more candidates for strategy to choose from
    };
    
    // Find candidates
    const candidates = await this.storage.find(query);
    
    if (candidates.length === 0) {
      core.warning(`No baseline found for ${route} at ${viewport}`);
      return null;
    }
    
    // Apply strategy
    const strategyName = options?.strategy || this.strategy;
    const strategy = BaselineStrategyFactory.create(strategyName, {
      prNumber: options?.prNumber,
      baseBranch: options?.branch || 'main',
      currentBranch: github.context.ref?.replace('refs/heads/', '')
    });
    
    const selected = strategy.selectBaseline(query, candidates);
    
    if (selected) {
      core.info(`Selected baseline: ${selected.id} (${strategy.name} strategy)`);
    }
    
    return selected;
  }

  /**
   * Compare screenshot with baseline
   */
  async compare(
    current: Buffer, 
    baseline: Baseline,
    metadata?: any
  ): Promise<BaselineComparison> {
    return await this.differ.compare(baseline, current, metadata);
  }

  /**
   * Tag a baseline
   */
  async tagBaseline(baselineId: string, tags: string[]): Promise<void> {
    const baseline = await this.storage.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline ${baselineId} not found`);
    }
    
    // Add tags
    baseline.metadata.tags = [...(baseline.metadata.tags || []), ...tags];
    baseline.updatedAt = Date.now();
    
    // Save updated baseline
    await this.storage.save(baseline);
    
    core.info(`Tagged baseline ${baselineId} with: ${tags.join(', ')}`);
  }

  /**
   * Promote baseline to stable
   */
  async promoteToStable(
    route: string,
    viewport: string,
    commit?: string
  ): Promise<void> {
    const query: BaselineQuery = {
      repository: BaselineStorage.getCurrentRepository(),
      route,
      viewport,
      commit
    };
    
    const candidates = await this.storage.find(query);
    
    if (candidates.length === 0) {
      throw new Error(`No baseline found for ${route} at ${viewport}`);
    }
    
    // Tag the most recent as stable
    const baseline = candidates[0];
    await this.tagBaseline(baseline.id, ['stable']);
    
    core.info(`Promoted baseline ${baseline.id} to stable`);
  }

  /**
   * Clean up old baselines
   */
  async cleanup(options?: {
    keepDays?: number;
    keepCount?: number;
    keepTags?: string[];
  }): Promise<number> {
    const keepDays = options?.keepDays || 30;
    const keepCount = options?.keepCount || 10;
    const keepTags = options?.keepTags || ['stable', 'release'];
    
    const cutoffTime = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
    
    // Get all baselines
    const all = await this.storage.find({
      repository: BaselineStorage.getCurrentRepository(),
      limit: 1000
    });
    
    // Group by route and viewport
    const grouped = new Map<string, Baseline[]>();
    for (const baseline of all) {
      const key = `${baseline.route}-${baseline.viewport}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(baseline);
    }
    
    let deleted = 0;
    
    // Clean up each group
    for (const [key, baselines] of grouped) {
      // Sort by date descending
      baselines.sort((a, b) => b.updatedAt - a.updatedAt);
      
      // Keep recent ones and tagged ones
      let kept = 0;
      for (let i = 0; i < baselines.length; i++) {
        const baseline = baselines[i];
        
        const hasKeepTag = baseline.metadata.tags?.some(tag => 
          keepTags.includes(tag)
        );
        
        if (
          kept < keepCount ||
          baseline.updatedAt > cutoffTime ||
          hasKeepTag
        ) {
          kept++;
        } else {
          // Delete old baseline
          await this.storage.delete(baseline.id);
          deleted++;
          core.info(`Deleted old baseline: ${baseline.id}`);
        }
      }
    }
    
    core.info(`Cleanup complete: deleted ${deleted} old baselines`);
    return deleted;
  }

  /**
   * Calculate fingerprint for image
   */
  private calculateFingerprint(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  /**
   * Get image dimensions from buffer
   */
  private getImageDimensions(buffer: Buffer): { width: number; height: number } {
    // This is a simplified version - in production, use a proper image library
    // For PNG images, dimensions are at bytes 16-24
    if (buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
    
    // Default fallback
    return { width: 1920, height: 1080 };
  }
}