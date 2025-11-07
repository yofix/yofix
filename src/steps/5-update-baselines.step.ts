/**
 * Step 5: Update Baselines (Post-Merge)
 *
 * After PR is merged to main, updates baselines with approved preview screenshots.
 * This ensures future PRs compare against the latest approved visual state.
 *
 * Triggered only when:
 * - PR is merged (not just closed)
 * - Target branch is main/master
 *
 * Outputs:
 * - baselinesUpdated: Number of baselines updated
 * - updateSummary: Summary of baseline updates
 */

import * as core from '@actions/core';
import { promises as fs } from 'fs';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import { extractRoutePath } from './shared/route.utils';
import { config } from '../core';

/**
 * Main step execution
 */
export async function updateBaselines(stepData: StepData): Promise<StepData> {
  return executeStep('Update Baselines (Post-Merge)', async () => {
    const { prNumber, screenshots } = stepData;
    const internal = (stepData as any)._internal;

    if (!screenshots || !internal?.screenshotResult) {
      throw new Error('No screenshots available for baseline update. Run browse-routes step first.');
    }

    // Parse update-baselines-on-merge tuple: ["branch", "enabled"]
    const updateConfig = config.get('update-baselines-on-merge', { defaultValue: '["", "false"]' });
    let targetBranch = '';
    let enabled = false;

    try {
      const parsed = JSON.parse(updateConfig);
      if (Array.isArray(parsed) && parsed.length === 2) {
        targetBranch = parsed[0];
        enabled = parsed[1] === 'true' || parsed[1] === true;
      }
    } catch (error) {
      core.warning(`Failed to parse update-baselines-on-merge config: ${error}`);
    }

    if (!enabled) {
      core.info('ℹ️ Baseline update disabled in configuration');
      return {
        ...stepData,
        baselinesUpdated: 0,
        updateSummary: 'Baseline update disabled'
      } as any;
    }

    // Get current branch from GitHub context
    const currentBranch = process.env.GITHUB_REF?.replace('refs/heads/', '') || '';

    if (targetBranch && currentBranch !== targetBranch) {
      core.info(`ℹ️ Skipping baseline update - current branch: ${currentBranch}, target branch: ${targetBranch}`);
      return {
        ...stepData,
        baselinesUpdated: 0,
        updateSummary: `Baseline update skipped - branch mismatch (current: ${currentBranch}, target: ${targetBranch})`
      } as any;
    }

    core.info(`🔄 Starting baseline update for merged PR #${prNumber}`);
    core.info(`   Branch: ${currentBranch}`);

    // Get storage configuration
    const firebaseCredentials = config.get('firebase-credentials');
    const storageBucket = config.get('storage-bucket');
    const storageProvider = config.get('storage-provider', { defaultValue: 'firebase' });

    // Skip update if storage not configured
    if (!firebaseCredentials || !storageBucket) {
      core.warning('⚠️ Storage not configured - skipping baseline update');
      return {
        ...stepData,
        baselinesUpdated: 0,
        updateSummary: 'Baseline update skipped - no storage configured'
      } as any;
    }

    // Dynamic import to avoid bundling issues
    const { downloadFiles, uploadFiles } = await import('@yofix/storage');

    // Check if firebaseCredentials is a file path (for testing)
    let credentialsBase64 = firebaseCredentials;
    if (firebaseCredentials.endsWith('.json')) {
      try {
        const credentialsContent = await fs.readFile(firebaseCredentials, 'utf-8');
        credentialsBase64 = Buffer.from(credentialsContent).toString('base64');
        core.info('  Using Firebase credentials from file');
      } catch (error) {
        core.debug(`Not a file path, treating as base64: ${error}`);
      }
    }

    // Prepare baseline updates from preview screenshots
    const baselinestoUpdate = [];
    let successCount = 0;
    let failureCount = 0;

    core.info(`📦 Preparing to update ${internal.screenshotResult.screenshots.length} route baselines...`);

    for (const routeScreenshot of internal.screenshotResult.screenshots) {
      const route = routeScreenshot.route;
      const { pathname: routePath, sanitized: sanitizedRoute } = extractRoutePath(route, '_');

      for (const screenshot of routeScreenshot.screenshots) {
        const viewport = `${screenshot.width}x${screenshot.height}`;
        const baselineKey = `baselines/${sanitizedRoute}_${viewport}.png`;

        try {
          baselinestoUpdate.push({
            path: screenshot.path,
            destination: baselineKey,
            contentType: 'image/png',
            metadata: {
              type: 'baseline',
              route: routePath,
              viewport,
              source: 'merged-pr',
              prNumber,
              updatedAt: Date.now()
            }
          });

          core.info(`  ✓ Queued: ${routePath} (${viewport})`);
        } catch (error) {
          core.warning(`  ✗ Failed to read screenshot for ${route} (${viewport}): ${error}`);
          failureCount++;
        }
      }
    }

    if (baselinestoUpdate.length === 0) {
      core.warning('⚠️ No baselines to update');
      return {
        ...stepData,
        baselinesUpdated: 0,
        updateSummary: 'No baselines to update'
      } as any;
    }

    // Upload updated baselines
    core.info(`\n☁️  Uploading ${baselinestoUpdate.length} baseline(s)...`);

    try {
      const uploadResult = await uploadFiles({
        storage: {
          provider: storageProvider as 'firebase' | 's3',
          config: {
            bucket: storageBucket,
            credentials: credentialsBase64
          }
        } as any,
        files: baselinestoUpdate,
        verbose: true,
        onProgress: (progress) => {
          const percentage = ((progress.filesUploaded / progress.totalFiles) * 100).toFixed(1);
          core.info(`  Progress: ${progress.filesUploaded}/${progress.totalFiles} (${percentage}%)`);
        }
      });

      if (!uploadResult.success) {
        const errorMessage = uploadResult.errors?.map(e => e.message).join(', ');
        throw new Error(`Baseline upload failed: ${errorMessage}`);
      }

      successCount = uploadResult.files.length;
      core.info(`\n✅ Successfully updated ${successCount} baseline(s)`);

    } catch (error) {
      core.error(`Failed to update baselines: ${error}`);
      failureCount += baselinestoUpdate.length;
    }

    const summary = `Updated ${successCount} baseline(s)${failureCount > 0 ? `, ${failureCount} failed` : ''}`;

    return {
      ...stepData,
      baselinesUpdated: successCount,
      updateSummary: summary
    } as any;
  });
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  try {
    const manager = getStepDataManager();
    const stepData = await manager.load();
    const updatedData = await updateBaselines(stepData);
    await manager.save(updatedData);

    core.info('✅ Step 5: Update Baselines completed successfully');
  } catch (error) {
    core.setFailed(`Step 5 failed: ${error}`);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
