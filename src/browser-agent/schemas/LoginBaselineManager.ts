import { StorageProvider } from '../../providers/storage/types';
import { LoginBaseline } from './PlaywrightActionGenerator';
import * as crypto from 'crypto';
import * as core from '@actions/core';

/**
 * Manages login baselines with Firebase/S3 storage
 * Follows same pattern as BaselineManager for visual baselines
 *
 * STORAGE STRUCTURE:
 * login-baselines/
 *   ├── {domain}-{urlHash}.json
 *   └── ...
 */
export class LoginBaselineManager {
  private storage: StorageProvider;

  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  /**
   * Get or generate login baseline
   * First run: Generate + validate (30s+)
   * Subsequent runs: Load from cache (<1s)
   */
  async getOrGenerateBaseline(
    loginUrl: string,
    generateFn: () => Promise<LoginBaseline>
  ): Promise<LoginBaseline> {
    const baselineKey = this.generateBaselineKey(loginUrl);
    const storagePath = `login-baselines/${baselineKey}.json`;

    // Step 1: Try loading from cache
    try {
      core.info(`🔍 Checking for cached baseline: ${baselineKey}`);
      const cached = await this.storage.downloadFile(storagePath);

      if (cached) {
        const baseline: LoginBaseline = JSON.parse(cached.toString('utf-8'));
        core.info(`✅ Using cached baseline (instant!)`);
        core.info(`   Generated: ${baseline.generatedAt}`);
        core.info(`   Library: ${baseline.detectedLibrary}`);
        core.info(`   Actions: ${baseline.actions.length}`);
        core.info(`   Validated: ${baseline.validated ? 'Yes' : 'No'}`);
        return baseline;
      }

      core.info(`📝 No cached baseline found - generating new one`);
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      core.debug(`Cache miss: ${errorMsg}`);
      core.info(`📝 No cached baseline found - first time setup`);
    }

    // Step 2: Generate new baseline
    core.info(`🎯 Generating login baseline...`);
    core.info(`   This may take 30s+ but ensures reliability`);
    core.info(`   Subsequent runs will be instant (<1s)`);

    const baseline = await generateFn();

    // Step 3: Save to storage
    try {
      core.info(`💾 Caching baseline to remote storage...`);
      const baselineJson = JSON.stringify(baseline, null, 2);
      await this.storage.uploadFile(storagePath, Buffer.from(baselineJson, 'utf-8'), 'application/json');
      core.info(`✅ Baseline cached! All future runs will be instant.`);
      core.info(`   Path: ${storagePath}`);
    } catch (error) {
      core.warning(`Failed to cache baseline: ${error.message}`);
    }

    return baseline;
  }

  /**
   * Generate unique key for baseline based on URL
   */
  private generateBaselineKey(loginUrl: string): string {
    // Extract domain for readability
    const domain = new URL(loginUrl).hostname.replace(/\./g, '-');

    // Create hash from full URL
    const urlHash = crypto
      .createHash('md5')
      .update(loginUrl)
      .digest('hex')
      .substring(0, 8);

    return `${domain}-${urlHash}`;
  }

  /**
   * Delete baseline from storage
   */
  async deleteBaseline(loginUrl: string): Promise<void> {
    const baselineKey = this.generateBaselineKey(loginUrl);
    const storagePath = `login-baselines/${baselineKey}.json`;

    try {
      await this.storage.deleteFile(storagePath);
      core.info(`🗑️  Deleted baseline: ${storagePath}`);
    } catch (error) {
      core.warning(`Failed to delete baseline: ${error.message}`);
    }
  }

  /**
   * List all baselines in storage
   */
  async listBaselines(): Promise<string[]> {
    try {
      return await this.storage.listFiles('login-baselines/');
    } catch (error) {
      core.warning(`Failed to list baselines: ${error.message}`);
      return [];
    }
  }

  /**
   * Clear all baselines (for testing or forcing regeneration)
   */
  async clearAllBaselines(): Promise<void> {
    const baselines = await this.listBaselines();
    core.info(`🗑️  Clearing ${baselines.length} baselines...`);

    for (const baseline of baselines) {
      try {
        await this.storage.deleteFile(baseline);
      } catch (error) {
        core.warning(`Failed to delete ${baseline}: ${error.message}`);
      }
    }

    core.info(`✅ Cleared all baselines`);
  }

  /**
   * Get baseline metadata without downloading full baseline
   */
  async getBaselineMetadata(loginUrl: string): Promise<{
    exists: boolean;
    key: string;
    storagePath: string;
  }> {
    const baselineKey = this.generateBaselineKey(loginUrl);
    const storagePath = `login-baselines/${baselineKey}.json`;

    try {
      const exists = await this.storage.exists(storagePath);
      return { exists, key: baselineKey, storagePath };
    } catch {
      return { exists: false, key: baselineKey, storagePath };
    }
  }
}
