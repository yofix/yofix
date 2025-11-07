/**
 * Step 2: Browse Routes
 *
 * Captures screenshots of affected routes using @yofix/browser.
 * Handles authentication if configured.
 *
 * Outputs:
 * - screenshots: Array of captured screenshot files
 * - viewports: Viewport configurations used
 * - timestamp: When screenshots were captured
 */

import * as core from '@actions/core';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { captureScreenshotsWithBrowser } from '../core/screenshot/BrowserScreenshotCapture';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import { ErrorSeverity, ErrorCategory, errorHandler, config } from '../core';

/**
 * Main step execution
 */
export async function browseRoutes(stepData: StepData): Promise<StepData> {
  return executeStep('Browse Routes & Capture Screenshots', async () => {
    const { previewUrl, routes } = stepData;

    if (!routes || routes.affectedRoutes.length === 0) {
      throw new Error('No routes available for screenshot capture. Run analyze-routes step first.');
    }

    core.info(`📸 Preparing to capture screenshots for ${routes.affectedRoutes.length} routes`);

    // Parse viewport configurations
    const viewportsConfig = config.get('viewports', { defaultValue: '1920x1080,768x1024,375x667' });
    const viewports = viewportsConfig.split(',').map(viewport => {
      const [width, height] = viewport.trim().split('x').map(Number);
      return { width, height, name: `${width}x${height}` };
    });

    core.info(`📱 Using ${viewports.length} viewports: ${viewports.map(v => v.name).join(', ')}`);

    // Get fullPage configuration
    const fullPage = config.getBoolean('full-page', true);
    core.info(`📏 Full-page capture: ${fullPage ? 'Enabled (viewport width + full height)' : 'Disabled (fixed viewport dimensions)'}`);

    // Get authentication config if provided
    const authEmail = config.get('auth-email');
    const authPassword = config.get('auth-password');
    const authLoginUrl = config.get('auth-login-url', { defaultValue: '/login' });

    const credentials = authEmail && authPassword
      ? { email: authEmail, password: authPassword }
      : undefined;

    if (credentials) {
      core.info(`🔐 Authentication configured for: ${credentials.email}`);
    } else {
      core.info('ℹ️ No authentication configured');
    }

    // Create temporary output directory
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yofix-screenshots-'));
    core.info(`📁 Output directory: ${outputDir}`);

    // Capture screenshots using @yofix/browser
    core.info('🚀 Starting screenshot capture...');
    const screenshotResult = await captureScreenshotsWithBrowser({
      routes: routes.affectedRoutes,
      baseUrl: previewUrl,
      viewports,
      credentials,
      loginUrl: authLoginUrl,
      fullPage,
      verbose: true
    });

    if (!screenshotResult.success) {
      const errorMessage = screenshotResult.errors?.map(e => e.message).join(', ');
      throw new Error(`Screenshot capture failed: ${errorMessage}`);
    }

    core.info(`✅ Successfully captured ${screenshotResult.screenshots.length} route screenshots`);
    core.info(`📊 Total screenshots: ${screenshotResult.screenshots.reduce((sum, r) => sum + r.screenshots.length, 0)}`);
    core.info(`⏱️ Capture duration: ${screenshotResult.totalDuration}ms`);

    // Extract all screenshot file paths
    const screenshotFiles = screenshotResult.screenshots.flatMap(routeScreenshot =>
      routeScreenshot.screenshots.map(screenshot => screenshot.path)
    );

    // Save output directory to step data for cleanup later
    stepData.outputDir = screenshotResult.outputDirectory;

    // Update step data with screenshot results
    return {
      ...stepData,
      screenshots: {
        files: screenshotFiles,
        viewports,
        timestamp: Date.now()
      },
      // Store raw screenshot result for next step
      _internal: {
        screenshotResult,
        outputDirectory: screenshotResult.outputDirectory
      }
    } as any; // Type assertion needed for _internal field
  });
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  try {
    const manager = getStepDataManager();
    const stepData = await manager.load();
    const updatedData = await browseRoutes(stepData);
    await manager.save(updatedData);

    core.info('✅ Step 2: Browse Routes completed successfully');
  } catch (error) {
    core.setFailed(`Step 2 failed: ${error}`);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
