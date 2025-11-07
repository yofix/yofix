/**
 * StepDataManager - Centralized data passing between GitHub Action steps
 *
 * Provides type-safe, file-based data sharing with:
 * - Automatic serialization/deserialization
 * - Error handling
 * - Path management
 * - Cleanup utilities
 */

import { promises as fs } from 'fs';
import path from 'path';
import * as core from '@actions/core';
import { ExternalRouteImpactTree } from '../../core/analysis/ThirdPartyRouteImpactAnalyzer';

/**
 * Internal step data not exposed in public outputs
 */
export interface InternalStepData {
  screenshotResult?: {
    success: boolean;
    totalDuration?: number;
    baseUrl?: string;
    outputDirectory: string;
    metadata?: {
      timestamp: number;
      totalRoutes: number;
      totalScreenshots: number;
      successfulRoutes: number;
      failedRoutes: number;
      outputDirectory: string;
      authUsed: boolean;
      loginFlowDetected: boolean;
      totalDuration: number;
      baseUrl: string;
    };
    screenshots: Array<{
      route: string;
      fullUrl: string;
      screenshots: Array<{
        viewport: string;
        path: string;
        destination: string;
        width: number;
        height: number;
        size: number;
        duration: number;
        contentType: string;
        metadata: {
          route: string;
          fullUrl: string;
          viewport: string;
          width: string;
          height: string;
        };
      }>;
      timing: {
        navigationTime: number;
        screenshotTime: number;
        totalTime: number;
      };
      success: boolean;
      error?: string;
    }>;
    errors?: Array<{
      code: string;
      message: string;
      route?: string;
      phase?: 'login' | 'navigation' | 'screenshot' | 'storage';
      details?: unknown;
    }>;
  };
  diffFiles?: Array<{
    route: string;
    viewport: string;
    localPath?: string;
    destination: string;
    hasDifference: boolean;
    diffPercentage: number;
    status: 'new' | 'unchanged' | 'changed' | 'error';
    metrics?: any;
    baselineUrl?: string;
    baselineMetadata?: {
      timeCreated?: string;
      customMetadata?: Record<string, string>;
    };
    error?: string;
  }>;
  uploadedFiles?: any[];
  storageUrl?: string;
  screenshotMetadataMap?: Record<string, { route: string; viewport: any; metadata: any; duration?: number }>;
}

/**
 * Shared data structure passed between steps
 */
export interface StepData {
  // Configuration
  previewUrl: string;
  productionUrl?: string;
  prNumber: number;
  outputDir: string;

  // GitHub context
  githubContext: {
    owner: string;
    repo: string;
    sha: string;
    eventName: string;
    actor: string;
  };

  // Firebase config
  firebaseConfig: {
    projectId: string;
    target: string;
    buildSystem: string;
    region: string;
  };

  // Route analysis results
  routes?: {
    affectedRoutes: string[];
    impactTree: ExternalRouteImpactTree | null;
    routesToTest: ExternalRouteImpactTree | null;
    components: string[];
    impactCommentBody?: string | null;
  };

  // Screenshot results
  screenshots?: {
    files: string[];
    viewports: Array<{ width: number; height: number; name: string }>;
    timestamp: number;
  };

  // Baseline comparison results
  comparison?: {
    hasChanges: boolean;
    diffCount: number;
    diffFiles: string[];
    summary: string;
  };

  // Execution metadata
  metadata: {
    startTime: number;
    stepTimings: Record<string, { start: number; end: number; duration: number }>;
  };

  // Internal step data not exposed in public outputs
  _internal?: InternalStepData;
}

/**
 * StepDataManager - Handles data persistence between action steps
 */
export class StepDataManager {
  private static readonly DATA_DIR = '.yofix-step-data';
  private static readonly DATA_FILE = 'step-data.json';

  private workspacePath: string;
  private dataDir: string;

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath || process.env.GITHUB_WORKSPACE || process.cwd();
    this.dataDir = path.join(this.workspacePath, StepDataManager.DATA_DIR);
  }

  /**
   * Initialize the data directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      core.info(`📁 Initialized step data directory: ${this.dataDir}`);
    } catch (error) {
      core.error(`Failed to initialize step data directory: ${error}`);
      throw error;
    }
  }

  /**
   * Save step data to disk
   */
  async save(data: StepData): Promise<void> {
    try {
      const dataPath = path.join(this.dataDir, StepDataManager.DATA_FILE);
      await fs.writeFile(dataPath, JSON.stringify(data, null, 2), 'utf-8');
      core.info(`💾 Saved step data to ${dataPath}`);

      // Also set GitHub outputs for easy access
      this.setOutputs(data);
    } catch (error) {
      core.error(`Failed to save step data: ${error}`);
      throw error;
    }
  }

  /**
   * Load step data from disk
   */
  async load(): Promise<StepData> {
    try {
      const dataPath = path.join(this.dataDir, StepDataManager.DATA_FILE);
      const content = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(content) as StepData;
      core.info(`📥 Loaded step data from ${dataPath}`);
      return data;
    } catch (error) {
      core.error(`Failed to load step data: ${error}`);
      throw new Error(`Step data not found. Make sure previous steps completed successfully. Error: ${error}`);
    }
  }


  /**
   * Check if step data exists
   */
  async exists(): Promise<boolean> {
    try {
      const dataPath = path.join(this.dataDir, StepDataManager.DATA_FILE);
      await fs.access(dataPath);
      return true;
    } catch {
      return false;
    }
  }


  /**
   * Record step timing
   */
  async recordStepTiming(stepName: string, start: number, end: number): Promise<void> {
    try {
      const data = await this.load();
      data.metadata.stepTimings[stepName] = {
        start,
        end,
        duration: end - start
      };
      await this.save(data);
      core.info(`⏱️ Recorded timing for ${stepName}: ${end - start}ms`);
    } catch (error) {
      core.warning(`Failed to record step timing: ${error}`);
    }
  }


  /**
   * Get step timing summary
   */
  async getTimingSummary(): Promise<string> {
    try {
      const data = await this.load();
      const timings = data.metadata.stepTimings;
      const totalDuration = Date.now() - data.metadata.startTime;

      let summary = `## ⏱️ Step Timings\n\n`;
      summary += `**Total Duration:** ${(totalDuration / 1000).toFixed(2)}s\n\n`;

      for (const [step, timing] of Object.entries(timings)) {
        const durationSeconds = (timing.duration / 1000).toFixed(2);
        const percentage = ((timing.duration / totalDuration) * 100).toFixed(1);
        summary += `- **${step}:** ${durationSeconds}s (${percentage}%)\n`;
      }

      return summary;
    } catch (error) {
      core.warning(`Failed to generate timing summary: ${error}`);
      return '';
    }
  }

  /**
   * Set GitHub Action outputs for easy access in workflow
   */
  private setOutputs(data: StepData): void {
    try {
      // Basic outputs
      core.setOutput('pr-number', data.prNumber.toString());
      core.setOutput('preview-url', data.previewUrl);
      core.setOutput('data-dir', StepDataManager.DATA_DIR);

      // Route analysis outputs
      if (data.routes) {
        core.setOutput('routes-count', data.routes.affectedRoutes.length.toString());
        core.setOutput('has-routes', data.routes.affectedRoutes.length > 0 ? 'true' : 'false');
      }

      // Comparison outputs
      if (data.comparison) {
        core.setOutput('has-changes', data.comparison.hasChanges ? 'true' : 'false');
        core.setOutput('diff-count', data.comparison.diffCount.toString());
      }
    } catch (error) {
      core.warning(`Failed to set GitHub outputs: ${error}`);
    }
  }

}

/**
 * Singleton instance for easy access
 */
let instance: StepDataManager | null = null;

export function getStepDataManager(workspacePath?: string): StepDataManager {
  if (!instance) {
    instance = new StepDataManager(workspacePath);
  }
  return instance;
}

/**
 * Helper to execute a step with automatic timing and error handling
 */
export async function executeStep<T>(
  stepName: string,
  stepFunction: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  core.startGroup(`🚀 ${stepName}`);

  try {
    const result = await stepFunction();
    const end = Date.now();

    core.info(`✅ ${stepName} completed in ${end - start}ms`);
    core.endGroup();

    // Record timing
    const manager = getStepDataManager();
    if (await manager.exists()) {
      await manager.recordStepTiming(stepName, start, end);
    }

    return result;
  } catch (error) {
    const end = Date.now();
    core.error(`❌ ${stepName} failed after ${end - start}ms: ${error}`);
    core.endGroup();
    throw error;
  }
}
