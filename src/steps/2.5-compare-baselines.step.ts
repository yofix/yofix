/**
 * Step 2.5: Compare Screenshots with Baselines
 *
 * Uses @yofix/comparator to perform pixel-level comparison between
 * captured screenshots and stored baselines. Generates diff images
 * and detects visual regression regions.
 *
 * Outputs:
 * - comparison: Comparison summary with diff counts and details
 * - diffFiles: Array of generated diff images
 */

import * as core from '@actions/core';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { compareBaselines } from '@yofix/comparator';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import { config } from '../core';
import { captureScreenshotsWithBrowser } from '../core/screenshot/BrowserScreenshotCapture';

interface DiffFileInfo {
  route: string;
  viewport: string;
  localPath: string;
  destination: string; // For upload step
  hasDifference: boolean;
  diffPercentage: number;
  status: 'new' | 'unchanged' | 'changed' | 'error';
  metrics?: any;
  baselineUrl?: string; // Public URL of baseline image from @yofix/storage
}

/**
 * Main step execution
 */
export async function compareWithBaselines(stepData: StepData): Promise<StepData> {
  return executeStep('Compare with Baselines', async () => {
    const { prNumber, screenshots } = stepData;
    const internal = (stepData as any)._internal;

    if (!screenshots || !internal?.screenshotResult) {
      throw new Error('No screenshots available for comparison. Run browse-routes step first.');
    }

    core.info(`🔍 Starting baseline comparison for PR #${prNumber}`);

    // Get storage configuration
    const firebaseCredentials = config.get('firebase-credentials');
    const storageBucket = config.get('storage-bucket');
    const storageProvider = config.get('storage-provider', { defaultValue: 'firebase' });
    const comparisonThreshold = parseFloat(config.get('comparison-threshold', { defaultValue: '0.01' }));
    const productionUrl = config.get('production-url');

    // Get authentication config for production screenshot capture
    const authEmail = config.get('auth-email');
    const authPassword = config.get('auth-password');
    const authLoginUrl = config.get('auth-login-url', { defaultValue: '/login' });

    const credentials = authEmail && authPassword
      ? { email: authEmail, password: authPassword }
      : undefined;

    // Skip comparison if storage not configured (no baselines available)
    if (!firebaseCredentials || !storageBucket) {
      core.warning('⚠️ Storage not configured - skipping baseline comparison');
      core.warning('   All screenshots will be marked as "new"');

      return {
        ...stepData,
        comparison: {
          hasChanges: false,
          diffCount: 0,
          diffFiles: [],
          summary: 'Baseline comparison skipped - no storage configured'
        },
        _internal: {
          ...internal,
          diffFiles: []
        }
      } as any;
    }

    // Create temporary directory for diff images
    const diffOutputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yofix-diffs-'));
    core.info(`📁 Diff output directory: ${diffOutputDir}`);

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

    // Parse viewport configurations for production capture if needed
    const viewportsConfig = config.get('viewports', { defaultValue: '1920x1080,768x1024,375x667' });
    const viewports = viewportsConfig.split(',').map(viewport => {
      const [width, height] = viewport.trim().split('x').map(Number);
      return { width, height, name: `${width}x${height}` };
    });

    // Prepare comparisons
    const comparisonsToRun = [];
    const diffFilesInfo: DiffFileInfo[] = [];
    const baselineUrlMap = new Map<string, string>(); // key: route_viewport, value: baseline URL
    let newScreenshots = 0;

    for (const routeScreenshot of internal.screenshotResult.screenshots) {
      const route = routeScreenshot.route;

      for (const screenshot of routeScreenshot.screenshots) {
        const viewport = `${screenshot.width}x${screenshot.height}`;
        const sanitizedRoute = route.replace(/\//g, '_');
        const baselineKey = `baselines/${sanitizedRoute}_${viewport}.png`;

        core.info(`  Checking baseline for ${route} (${viewport})`);

        try {
          // Try to download baseline from storage
          const baselineResult = await downloadFiles({
            storage: {
              provider: storageProvider as 'firebase' | 's3',
              config: {
                bucket: storageBucket,
                credentials: credentialsBase64
              }
            } as any,
            files: [baselineKey]
          });

          if (!baselineResult.success || baselineResult.files.length === 0) {
            // No baseline exists - check if production-url is available
            if (productionUrl) {
              core.info(`    📸 No baseline found - capturing from production: ${productionUrl}${route}`);

              try {
                // Capture production screenshot for this specific route
                const viewportConfig = viewports.find(v => v.name === viewport);
                if (!viewportConfig) {
                  throw new Error(`Viewport configuration not found for ${viewport}`);
                }

                const productionCapture = await captureScreenshotsWithBrowser({
                  routes: [route],
                  baseUrl: productionUrl,
                  viewports: [viewportConfig],
                  credentials,
                  loginUrl: authLoginUrl,
                  verbose: false
                });

                if (!productionCapture.success || productionCapture.screenshots.length === 0) {
                  throw new Error('Production screenshot capture failed');
                }

                const productionScreenshot = productionCapture.screenshots[0].screenshots[0];
                const productionBuffer = await fs.readFile(productionScreenshot.path);

                // Upload production screenshot as baseline
                core.info(`    ☁️  Uploading production screenshot as baseline...`);
                const uploadResult = await uploadFiles({
                  storage: {
                    provider: storageProvider as 'firebase' | 's3',
                    config: {
                      bucket: storageBucket,
                      credentials: credentialsBase64
                    }
                  } as any,
                  files: [{
                    path: productionScreenshot.path,
                    destination: baselineKey,
                    contentType: 'image/png',
                    metadata: {
                      type: 'baseline',
                      route,
                      viewport,
                      source: 'production',
                      createdAt: Date.now()
                    }
                  }],
                  verbose: false
                });

                if (!uploadResult.success) {
                  throw new Error('Failed to upload baseline');
                }

                core.info(`    ✅ Baseline created from production`);

                // Now add to comparisons with the production screenshot as baseline
                const currentBuffer = await fs.readFile(screenshot.path);
                comparisonsToRun.push({
                  route,
                  viewport,
                  current: currentBuffer,
                  baseline: productionBuffer
                });

              } catch (error) {
                core.warning(`    ❌ Failed to create baseline from production: ${error}`);
                core.warning(`    Marking as NEW instead`);
                newScreenshots++;
                diffFilesInfo.push({
                  route,
                  viewport,
                  localPath: screenshot.path,
                  destination: `pr-${prNumber}/diffs/${sanitizedRoute}_${viewport}_diff.png`,
                  hasDifference: false,
                  diffPercentage: 0,
                  status: 'new'
                });
              }
            } else {
              // No production URL configured - mark as new
              core.info(`    ⚠️  No baseline found - marking as NEW`);
              newScreenshots++;

              diffFilesInfo.push({
                route,
                viewport,
                localPath: screenshot.path,
                destination: `pr-${prNumber}/diffs/${sanitizedRoute}_${viewport}_diff.png`,
                hasDifference: false,
                diffPercentage: 0,
                status: 'new'
              });
            }
            continue;
          }

          // Baseline found - add to comparisons
          const baselineBuffer = baselineResult.files[0].buffer;
          const baselineUrl = baselineResult.files[0].url; // URL from @yofix/storage
          const currentBuffer = await fs.readFile(screenshot.path);

          // Store baseline URL for later retrieval
          const comparisonKey = `${route}_${viewport}`;
          if (baselineUrl) {
            baselineUrlMap.set(comparisonKey, baselineUrl);
          }

          comparisonsToRun.push({
            route,
            viewport,
            current: currentBuffer,
            baseline: baselineBuffer
          });

        } catch (error) {
          core.warning(`    ❌ Error fetching baseline: ${error}`);
          diffFilesInfo.push({
            route,
            viewport,
            localPath: screenshot.path,
            destination: `pr-${prNumber}/diffs/${sanitizedRoute}_${viewport}_diff.png`,
            hasDifference: false,
            diffPercentage: 0,
            status: 'error'
          });
        }
      }
    }

    if (newScreenshots > 0) {
      core.info(`\n📝 ${newScreenshots} screenshot(s) have no baseline (new routes/viewports)`);
    }

    if (comparisonsToRun.length === 0) {
      core.info('\n✅ No baseline comparisons needed (all screenshots are new)');

      return {
        ...stepData,
        comparison: {
          hasChanges: false,
          diffCount: 0,
          diffFiles: [],
          summary: `All ${newScreenshots} screenshot(s) are new (no existing baselines)`
        },
        _internal: {
          ...internal,
          diffFiles: diffFilesInfo
        }
      } as any;
    }

    // Run comparisons using @yofix/comparator
    core.info(`\n📊 Running ${comparisonsToRun.length} baseline comparison(s)...`);
    core.info(`   Threshold: ${(comparisonThreshold * 100).toFixed(1)}%`);
    core.info(`   Diff Format: side-by-side`);
    core.info(`   Parallel Processing: enabled (concurrency: 3)`);

    try {
      const result = await compareBaselines({
        comparisons: comparisonsToRun,
        options: {
          threshold: comparisonThreshold,
          diffFormat: 'side-by-side', // Baseline | Diff | Current
          parallel: {
            enabled: true,
            concurrency: 3
          },
          generateHash: true,
          detectRegions: true,
          verbose: true
        }
      });

      if (!result.success) {
        core.warning('Comparison failed:');
        result.errors?.forEach(error => {
          core.warning(`  - ${error.message}`);
        });

        return {
          ...stepData,
          comparison: {
            hasChanges: false,
            diffCount: 0,
            diffFiles: [],
            summary: 'Baseline comparison failed'
          },
          _internal: {
            ...internal,
            diffFiles: diffFilesInfo
          }
        } as any;
      }

      // Process results
      let changedCount = 0;
      let unchangedCount = 0;

      for (const comparison of result.comparisons) {
        const sanitizedRoute = comparison.route.replace(/\//g, '_');
        const diffFileName = `${sanitizedRoute}_${comparison.viewport}_diff.png`;
        const diffFilePath = path.join(diffOutputDir, diffFileName);

        // Save diff image if differences were found
        if (comparison.diff && comparison.diff.buffer) {
          await fs.writeFile(diffFilePath, comparison.diff.buffer);
          core.info(`  💾 Saved diff image: ${diffFileName}`);
        }

        const status: 'unchanged' | 'changed' = comparison.match ? 'unchanged' : 'changed';
        if (status === 'changed') changedCount++;
        else unchangedCount++;

        // Retrieve baseline URL from map
        const comparisonKey = `${comparison.route}_${comparison.viewport}`;
        const baselineUrl = baselineUrlMap.get(comparisonKey);

        diffFilesInfo.push({
          route: comparison.route,
          viewport: comparison.viewport,
          localPath: diffFilePath,
          destination: `pr-${prNumber}/diffs/${diffFileName}`,
          hasDifference: !comparison.match,
          diffPercentage: comparison.diffPercentage,
          status,
          baselineUrl,
          metrics: {
            similarity: comparison.similarity,
            pixelDifference: comparison.pixelDifference,
            perceptualHash: comparison.metrics.perceptualHash,
            mse: comparison.metrics.mse,
            psnr: comparison.metrics.psnr,
            regions: comparison.diff?.regions?.length || 0
          }
        });

        // Log metrics
        core.info(`\n  📈 ${comparison.route} (${comparison.viewport}):`);
        core.info(`     Status: ${status === 'changed' ? '❌ CHANGED' : '✅ UNCHANGED'}`);
        core.info(`     Similarity: ${(comparison.similarity * 100).toFixed(2)}%`);
        core.info(`     Pixels Different: ${comparison.pixelDifference}`);

        if (comparison.metrics.perceptualHash) {
          core.info(`     Hamming Distance: ${comparison.metrics.perceptualHash.hammingDistance}`);
        }

        if (comparison.metrics.psnr !== undefined) {
          const psnrValue = comparison.metrics.psnr === Infinity
            ? '∞ (identical)'
            : `${comparison.metrics.psnr.toFixed(2)} dB`;
          core.info(`     PSNR: ${psnrValue}`);
        }

        if (comparison.diff?.regions) {
          const critical = comparison.diff.regions.filter(r => r.severity === 'critical').length;
          const moderate = comparison.diff.regions.filter(r => r.severity === 'moderate').length;
          core.info(`     Diff Regions: ${comparison.diff.regions.length} (${critical} critical, ${moderate} moderate)`);
        }
      }

      // Generate summary
      const totalComparisons = result.comparisons.length;
      const overallSimilarity = (result.summary.overallSimilarity * 100).toFixed(2);

      core.info(`\n✅ Comparison complete:`);
      core.info(`   Total Comparisons: ${totalComparisons}`);
      core.info(`   New Screenshots: ${newScreenshots}`);
      core.info(`   Unchanged: ${unchangedCount}`);
      core.info(`   Changed: ${changedCount}`);
      core.info(`   Overall Similarity: ${overallSimilarity}%`);
      core.info(`   Duration: ${result.metadata.duration}ms`);

      const summary = `Compared ${totalComparisons} screenshot(s): ${unchangedCount} unchanged, ${changedCount} changed${newScreenshots > 0 ? `, ${newScreenshots} new` : ''}`;

      return {
        ...stepData,
        comparison: {
          hasChanges: changedCount > 0,
          diffCount: changedCount,
          diffFiles: diffFilesInfo.filter(d => d.hasDifference).map(d => d.localPath),
          summary
        },
        _internal: {
          ...internal,
          diffFiles: diffFilesInfo,
          diffOutputDir
        }
      } as any;

    } catch (error) {
      core.error(`Error during comparison: ${error}`);
      throw error;
    }
  });
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  try {
    const manager = getStepDataManager();
    const stepData = await manager.load();
    const updatedData = await compareWithBaselines(stepData);
    await manager.save(updatedData);

    core.info('✅ Step 2.5: Compare Baselines completed successfully');
  } catch (error) {
    core.setFailed(`Step 2.5 failed: ${error}`);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
