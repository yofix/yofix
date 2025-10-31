/**
 * PatternStore - Persist and retrieve learned patterns
 *
 * Manages storage of learned patterns both locally and remotely.
 * Priority: Local first (fast), Remote as backup (shared across team).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { LearnedPattern, LearningMetrics } from './types';
import { StorageProvider } from '../../providers/storage/StorageProvider';

export interface PatternStoreConfig {
  /**
   * Repository root directory
   */
  repoRoot: string;

  /**
   * Local storage path (relative to repo root)
   * Default: .yofix/patterns.json
   */
  localPath?: string;

  /**
   * Remote storage provider (optional)
   */
  storageProvider?: StorageProvider;

  /**
   * Remote storage path
   */
  remotePath?: string;

  /**
   * Staleness threshold in days
   * Patterns older than this are considered stale
   */
  stalenessDays?: number;
}

export class PatternStore {
  private repoRoot: string;
  private localPath: string;
  private storageProvider?: StorageProvider;
  private remotePath: string;
  private stalenessDays: number;

  constructor(config: PatternStoreConfig) {
    this.repoRoot = config.repoRoot;
    this.localPath = config.localPath || '.yofix/patterns.json';
    this.storageProvider = config.storageProvider;
    this.remotePath = config.remotePath || 'yofix/patterns.json';
    this.stalenessDays = config.stalenessDays || 30;
  }

  /**
   * Save learned patterns (both local and remote)
   */
  async save(pattern: LearnedPattern, metrics?: LearningMetrics): Promise<void> {
    const data = {
      pattern,
      metrics,
      savedAt: new Date().toISOString()
    };

    // In GitHub Actions, skip local save (ephemeral environment)
    // Always prioritize remote storage
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

    if (!isGitHubActions) {
      // Save locally only in local/CLI environment
      await this.saveLocal(data);
    }

    // Save remotely if provider is available (required for GitHub Actions)
    if (this.storageProvider) {
      try {
        await this.saveRemote(data);
      } catch (error) {
        console.warn('⚠️  Failed to save patterns remotely:', error);
        // In GitHub Actions, this is critical - warn user
        if (isGitHubActions) {
          console.error('❌ Remote storage failed in GitHub Actions - patterns will not persist!');
        }
        // Don't throw - continue (fall back to local in non-GH environment)
      }
    } else if (isGitHubActions) {
      console.warn('⚠️ No storage provider configured in GitHub Actions - patterns will not persist across runs');
    }
  }

  /**
   * Load learned patterns
   * Priority in GitHub Actions: Remote → Local (local won't exist)
   * Priority in local/CLI: Local → Remote
   */
  async load(): Promise<LearnedPattern | null> {
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

    // In GitHub Actions, prioritize remote storage
    if (isGitHubActions && this.storageProvider) {
      try {
        const remoteData = await this.loadRemote();
        if (remoteData && !this.isStale(remoteData.pattern)) {
          console.log(`☁️  Loaded patterns from remote storage (${this.remotePath})`);
          return remoteData.pattern;
        }
      } catch (error) {
        console.warn('⚠️  Failed to load patterns from remote storage:', error);
      }
    }

    // Try local first (faster) in local/CLI environment
    let data = await this.loadLocal();

    // If no local or stale, try remote
    if (!data || this.isStale(data.pattern)) {
      if (this.storageProvider) {
        try {
          const remoteData = await this.loadRemote();
          if (remoteData && !this.isStale(remoteData.pattern)) {
            // Save remote data locally for future use (only in non-GH environment)
            if (!isGitHubActions) {
              await this.saveLocal(remoteData);
            }
            data = remoteData;
          }
        } catch (error) {
          console.warn('⚠️  Failed to load patterns remotely:', error);
          // Fall back to local even if stale
        }
      }
    }

    return data?.pattern || null;
  }

  /**
   * Check if patterns exist locally
   */
  async exists(): Promise<boolean> {
    const fullPath = path.join(this.repoRoot, this.localPath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete patterns (both local and remote)
   */
  async delete(): Promise<void> {
    // Delete local
    const fullPath = path.join(this.repoRoot, this.localPath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }

    // Delete remote
    if (this.storageProvider) {
      try {
        await this.storageProvider.delete(this.remotePath);
      } catch (error) {
        console.warn('⚠️  Failed to delete patterns remotely:', error);
      }
    }
  }

  /**
   * Save patterns locally
   */
  private async saveLocal(data: {
    pattern: LearnedPattern;
    metrics?: LearningMetrics;
    savedAt: string;
  }): Promise<void> {
    const fullPath = path.join(this.repoRoot, this.localPath);
    const dirPath = path.dirname(fullPath);

    // Create .yofix directory if it doesn't exist
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
    }

    // Write patterns
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');

    // Update .gitignore to exclude .yofix/
    await this.updateGitignore();

    console.log(`💾 Patterns saved locally: ${this.localPath}`);
  }

  /**
   * Load patterns from local storage
   */
  private async loadLocal(): Promise<{
    pattern: LearnedPattern;
    metrics?: LearningMetrics;
    savedAt: string;
  } | null> {
    const fullPath = path.join(this.repoRoot, this.localPath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save patterns to remote storage
   */
  private async saveRemote(data: {
    pattern: LearnedPattern;
    metrics?: LearningMetrics;
    savedAt: string;
  }): Promise<void> {
    if (!this.storageProvider) {
      return;
    }

    const content = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(content, 'utf-8');

    await this.storageProvider.upload(this.remotePath, buffer, {
      contentType: 'application/json',
      metadata: {
        framework: data.pattern.framework,
        confidence: data.pattern.confidence.toString(),
        learnedAt: data.pattern.learnedAt
      }
    });

    console.log(`☁️  Patterns saved remotely: ${this.remotePath}`);
  }

  /**
   * Load patterns from remote storage
   */
  private async loadRemote(): Promise<{
    pattern: LearnedPattern;
    metrics?: LearningMetrics;
    savedAt: string;
  } | null> {
    if (!this.storageProvider) {
      return null;
    }

    try {
      const buffer = await this.storageProvider.download(this.remotePath);
      const content = buffer.toString('utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if patterns are stale
   */
  private isStale(pattern: LearnedPattern): boolean {
    const learnedAt = new Date(pattern.learnedAt);
    const now = new Date();
    const daysSinceLearn = (now.getTime() - learnedAt.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceLearn > this.stalenessDays;
  }

  /**
   * Update .gitignore to exclude .yofix/
   */
  private async updateGitignore(): Promise<void> {
    const gitignorePath = path.join(this.repoRoot, '.gitignore');
    const yofixEntry = '\n# YoFix learned patterns (generated)\n.yofix/\n';

    try {
      let content = '';
      try {
        content = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // .gitignore doesn't exist, create it
      }

      // Check if entry already exists
      if (content.includes('.yofix/')) {
        return;
      }

      // Append entry
      await fs.writeFile(gitignorePath, content + yofixEntry, 'utf-8');
      console.log('📝 Updated .gitignore to exclude .yofix/');
    } catch (error) {
      console.warn('⚠️  Could not update .gitignore:', error);
      // Don't fail if we can't update .gitignore
    }
  }

  /**
   * Get pattern metadata without loading full content
   */
  async getMetadata(): Promise<{
    exists: boolean;
    framework?: string;
    confidence?: number;
    learnedAt?: string;
    isStale?: boolean;
  }> {
    const data = await this.loadLocal();

    if (!data) {
      return { exists: false };
    }

    return {
      exists: true,
      framework: data.pattern.framework,
      confidence: data.pattern.confidence,
      learnedAt: data.pattern.learnedAt,
      isStale: this.isStale(data.pattern)
    };
  }
}
