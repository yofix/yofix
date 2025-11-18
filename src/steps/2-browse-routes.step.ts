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
import { ErrorSeverity, ErrorCategory, errorHandler, config, parseTimeout } from '../core';

/**
 * Main step execution
 */
export async function browseRoutes(stepData: StepData): Promise<StepData> {
  return executeStep('Browse Routes & Capture Screenshots', async () => {
    const { previewUrl, routes } = stepData;

    if (!routes) {
      throw new Error('Missing routes data. Run analyze-routes step first.');
    }

    // Skip screenshot capture if no routes affected
    if (routes.affectedRoutes.length === 0) {
      core.info('ℹ️ No routes to capture - skipping screenshot step');

      // Return step data with empty screenshots
      return {
        ...stepData,
        screenshots: {
          files: [],
          viewports: [],
          timestamp: Date.now()
        },
        _internal: {
          ...stepData._internal,
          screenshotResult: {
            success: true,
            screenshots: [],
            totalDuration: 0,
            outputDirectory: '',
            errors: []
          }
        }
      };
    }

    core.info(`📸 Preparing to capture screenshots for ${routes.affectedRoutes.length} routes`);

    // Use custom viewports from comment command, or fall back to config
    let viewports;
    if (stepData.customViewports && stepData.customViewports.length > 0) {
      viewports = stepData.customViewports;
      core.info(`📱 Using custom viewports from comment command: ${viewports.map(v => v.name).join(', ')}`);
    } else {
      // Parse viewport configurations from action inputs
      const viewportsConfig = config.get('viewports', { defaultValue: '1920x1080,768x1024,375x667' });
      viewports = viewportsConfig.split(',').map(viewport => {
        const [width, height] = viewport.trim().split('x').map(Number);
        return { width, height, name: `${width}x${height}` };
      });
      core.info(`📱 Using default viewports: ${viewports.map(v => v.name).join(', ')}`);
    }

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

    // Get and parse test-timeout configuration (default from action.yml: '5m')
    const testTimeoutConfig = config.get('test-timeout');
    const testTimeout = parseTimeout(testTimeoutConfig);
    core.info(`⏱️ Per-screenshot timeout: ${testTimeoutConfig} (${testTimeout}ms)`);

    // Capture screenshots using @yofix/browser
    core.info('🚀 Starting screenshot capture...');
    const screenshotResult = await captureScreenshotsWithBrowser({
      routes: routes.affectedRoutes,
      baseUrl: previewUrl,
      viewports,
      credentials,
      loginUrl: authLoginUrl,
      fullPage,
      verbose: true,
      timeout: testTimeout
    });

    if (!screenshotResult.success) {
      const errorDetails = screenshotResult.errors?.map(e =>
        `${e.route ? `[${e.route}]` : '[unknown]'} ${e.message}`
      ).join('\n  ');
      throw new Error(`Screenshot capture failed:\n  ${errorDetails || 'Unknown error'}`);
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
    };
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
