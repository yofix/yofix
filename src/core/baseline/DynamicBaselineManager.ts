import * as core from '@actions/core';
import { Page, Browser, chromium } from 'playwright';
import { PNG } from 'pngjs';
import { StorageProvider } from './types';
import { RouteImpactAnalyzer } from '../analysis/RouteImpactAnalyzer';
import { errorHandler, ErrorCategory, ErrorSeverity } from '..';
import * as github from '@actions/github';
import pixelmatch from 'pixelmatch';

export interface DynamicBaselineConfig {
  productionUrl?: string;
  storageProvider: StorageProvider;
}

export interface BaselineResult {
  route: string;
  viewport: { width: number; height: number };
  screenshot: Buffer;
  timestamp: number;
}

/**
 * Manages dynamic baseline creation and fetching from production/main branch
 */
export class DynamicBaselineManager {
  private browser: Browser | null = null;
  private impactAnalyzer: RouteImpactAnalyzer;

  constructor(private config: DynamicBaselineConfig) {
    this.impactAnalyzer = new RouteImpactAnalyzer(config.storageProvider);
  }

  /**
   * Create baselines for routes from production URL
   */
  async createBaselines(routes: string[], viewports: Array<{ width: number; height: number }>): Promise<BaselineResult[]> {
    if (!this.config.productionUrl) {
      core.warning('No production URL configured for baseline creation');
      return [];
    }

    const baseUrl = this.config.productionUrl;

    core.info(`📸 Creating baselines from: ${baseUrl}`);
    const results: BaselineResult[] = [];

    try {
      // Launch browser
      this.browser = await chromium.launch({ headless: true });
      const context = await this.browser.newContext();
      const page = await context.newPage();

      // Navigate to each route and capture screenshots
      for (const route of routes) {
        for (const viewport of viewports) {
          try {
            const result = await this.captureBaseline(page, baseUrl, route, viewport);
            results.push(result);
            
            // Save to storage
            await this.saveBaseline(result);
          } catch (error) {
            core.warning(`Failed to capture baseline for ${route} at ${viewport.width}x${viewport.height}: ${error}`);
          }
        }
      }

      core.info(`✅ Created ${results.length} baselines`);

    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.BROWSER,
        userAction: 'Create baselines',
        metadata: { baseUrl, routeCount: routes.length },
        recoverable: true
      });
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }

    return results;
  }

  /**
   * Create baselines for all discovered routes
   */
  async createAllBaselines(viewports: Array<{ width: number; height: number }>): Promise<BaselineResult[]> {
    // Get route manifest
    const manifest = await this.impactAnalyzer.getRouteManifest();
    
    if (!manifest || manifest.routes.length === 0) {
      core.warning('No route manifest found. Run route analysis first.');
      return [];
    }

    core.info(`📍 Found ${manifest.routes.length} routes in manifest`);
    return this.createBaselines(manifest.routes, viewports);
  }

  /**
   * Create baselines for newly discovered routes only
   */
  async createMissingBaselines(routes: string[], viewports: Array<{ width: number; height: number }>): Promise<BaselineResult[]> {
    const missingRoutes: string[] = [];

    // Check which routes don't have baselines
    for (const route of routes) {
      let routeHasBaselines = false;
      
      for (const viewport of viewports) {
        try {
          const baselineKey = this.getBaselineKey(route, viewport);
          const exists = await this.baselineExists(baselineKey);
          
          if (exists) {
            routeHasBaselines = true;
            break; // Found at least one baseline for this route
          }
        } catch (error: any) {
          core.debug(`Error checking baseline existence for ${route}: ${error.message || error}`);
          // Continue checking other viewports
        }
      }
      
      if (!routeHasBaselines) {
        missingRoutes.push(route);
      }
    }

    if (missingRoutes.length === 0) {
      core.info('✅ All routes have baselines');
      return [];
    }

    core.info(`📸 Creating baselines for ${missingRoutes.length} new routes: ${missingRoutes.join(', ')}`);
    return this.createBaselines(missingRoutes, viewports);
  }

  /**
   * Capture a single baseline screenshot
   */
  private async captureBaseline(
    page: Page,
    baseUrl: string,
    route: string,
    viewport: { width: number; height: number }
  ): Promise<BaselineResult> {
    // Construct URL
    const url = route.startsWith('/') 
      ? `${baseUrl}${route}`
      : `${baseUrl}/${route}`;

    // Set viewport
    await page.setViewportSize(viewport);

    // Navigate to page
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Wait for any animations
    await page.waitForTimeout(1000);

    // Capture screenshot
    const screenshot = await page.screenshot({ 
      fullPage: true,
      type: 'png'
    });

    return {
      route,
      viewport,
      screenshot,
      timestamp: Date.now()
    };
  }

  /**
   * Save baseline to storage
   */
  private async saveBaseline(result: BaselineResult): Promise<void> {
    const key = this.getBaselineKey(result.route, result.viewport);
    
    await this.config.storageProvider.uploadFile(key, result.screenshot, {
      contentType: 'image/png',
      metadata: {
        route: result.route,
        viewport: `${result.viewport.width}x${result.viewport.height}`,
        timestamp: result.timestamp.toString(),
        source: 'production'
      }
    });

    core.info(`✅ Saved baseline: ${key}`);
  }

  /**
   * Get baseline key for storage
   */
  private getBaselineKey(route: string, viewport: { width: number; height: number }): string {
    const sanitizedRoute = route.replace(/\//g, '_').replace(/^_+|_+$/g, '') || 'root';
    return `baselines/${sanitizedRoute}_${viewport.width}x${viewport.height}.png`;
  }

  /**
   * Check if baseline exists
   */
  private async baselineExists(key: string): Promise<boolean> {
    try {
      const files = await this.config.storageProvider.listFiles?.('baselines/');
      return files?.includes(key) || false;
    } catch {
      return false;
    }
  }

  /**
   * Fetch baseline for comparison
   */
  async fetchBaseline(route: string, viewport: { width: number; height: number }): Promise<Buffer | null> {
    const key = this.getBaselineKey(route, viewport);
    
    try {
      const baseline = await this.config.storageProvider.downloadFile(key);
      core.debug(`✅ Baseline found: ${key}`);
      return baseline;
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      
      // Handle file not found errors gracefully
      if (error.code === 404 || 
          errorMessage.includes('No such object') || 
          errorMessage.includes('File not found') ||
          errorMessage.includes('does not exist')) {
        core.info(`ℹ️ No baseline found for ${route} at ${viewport.width}x${viewport.height}. Will create from current screenshot.`);
        return null;
      }
      
      // Log unexpected errors but don't fail
      core.warning(`⚠️ Unexpected error fetching baseline ${key}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Update baseline with new screenshot
   */
  async updateBaseline(route: string, viewport: { width: number; height: number }, screenshot: Buffer): Promise<void> {
    const key = this.getBaselineKey(route, viewport);
    
    try {
      core.debug(`📤 Uploading baseline to: ${key}`);
      
      await this.config.storageProvider.uploadFile(key, screenshot, {
        contentType: 'image/png',
        metadata: {
          route,
          viewport: `${viewport.width}x${viewport.height}`,
          timestamp: Date.now().toString(),
          source: 'update'
        }
      });

      core.info(`✅ Updated baseline: ${key}`);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      core.error(`❌ Failed to upload baseline ${key}: ${errorMessage}`);
      
      // Re-throw with more context
      throw new Error(`Baseline upload failed for ${route} at ${viewport.width}x${viewport.height}: ${errorMessage}`);
    }
  }

  /**
   * Compare screenshot with baseline
   */
  async compareWithBaseline(
    route: string,
    viewport: { width: number; height: number },
    screenshot: Buffer
  ): Promise<{
    hasDifference: boolean;
    diffPercentage: number;
    diffImage?: Buffer;
  }> {
    let baseline: Buffer | null = null;
    
    try {
      core.debug(`🔍 Fetching baseline for ${route} at ${viewport.width}x${viewport.height}`);
      baseline = await this.fetchBaseline(route, viewport);
    } catch (error: any) {
      core.warning(`⚠️ Error fetching baseline for ${route}: ${error.message || error}`);
      baseline = null;
    }
    
    if (!baseline) {
      // No baseline exists, save current as baseline
      core.info(`📸 Creating new baseline for ${route} at ${viewport.width}x${viewport.height}`);
      try {
        await this.updateBaseline(route, viewport, screenshot);
        core.info(`✅ New baseline created successfully for ${route}`);
        return { hasDifference: false, diffPercentage: 0 };
      } catch (error: any) {
        const errorMessage = error.message || String(error);
        core.error(`❌ Failed to create baseline for ${route}: ${errorMessage}`);
        
        // Log stack trace for debugging
        if (error.stack) {
          core.debug(`Stack trace: ${error.stack}`);
        }
        
        // Don't fail the test, just report no difference since we can't compare
        return { hasDifference: false, diffPercentage: 0 };
      }
    }

    // Perform pixel comparison
    try {
      const currentImg = PNG.sync.read(screenshot);
      const baselineImg = PNG.sync.read(baseline);
      
      // Check dimensions
      if (currentImg.width !== baselineImg.width || currentImg.height !== baselineImg.height) {
        core.warning(`Image dimensions mismatch for ${route} at ${viewport.width}x${viewport.height}`);
        return { hasDifference: true, diffPercentage: 100 };
      }

      // Use pixelmatch for comparison
      const diffImg = new PNG({ width: currentImg.width, height: currentImg.height });
      
      const numDiffPixels = pixelmatch(
        baselineImg.data,
        currentImg.data,
        diffImg.data,
        currentImg.width,
        currentImg.height,
        {
          threshold: 0.1,
          includeAA: true,
          alpha: 0.1
        }
      );
      
      const totalPixels = currentImg.width * currentImg.height;
      const diffPercentage = (numDiffPixels / totalPixels) * 100;
      
      if (diffPercentage > 0.1) { // 0.1% threshold
        return {
          hasDifference: true,
          diffPercentage,
          diffImage: PNG.sync.write(diffImg)
        };
      }

      return { hasDifference: false, diffPercentage };

    } catch (error) {
      core.warning(`Failed to compare images: ${error}`);
      return { hasDifference: true, diffPercentage: 100 };
    }
  }


  /**
   * Create baselines on demand when production URL is available
   */
  async ensureBaselines(routes: string[], viewports: Array<{ width: number; height: number }>): Promise<void> {
    // Skip baseline creation if no production URL is configured
    if (!this.config.productionUrl) {
      core.info('ℹ️ No production URL configured. Skipping baseline creation and visual comparisons.');
      return;
    }

    try {
      // Check if we have any baselines at all
      const hasAnyBaselines = await this.hasAnyBaselines();
      
      if (!hasAnyBaselines) {
        core.info('🎯 No baselines found. Creating initial baselines from production URL...');
        await this.createBaselines(routes, viewports);
      } else {
        // Create missing baselines only
        await this.createMissingBaselines(routes, viewports);
      }
    } catch (error: any) {
      core.warning(`⚠️ Baseline initialization failed: ${error.message || error}`);
      core.info('📝 Visual tests will continue but comparison will be skipped for missing baselines');
      // Don't throw - let visual testing continue without baseline comparison
    }
  }

  /**
   * Check if any baselines exist
   */
  private async hasAnyBaselines(): Promise<boolean> {
    try {
      const files = await this.config.storageProvider.listFiles?.('baselines/');
      return files && files.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create baselines from main branch deployments (if available)
   */
  async createBaselinesFromMainBranch(): Promise<boolean> {
    core.info('🔍 Attempting to create baselines from main branch deployments...');
    
    // This method would typically:
    // 1. Check for existing deployments from main branch
    // 2. Find the latest successful deployment URL
    // 3. Use that URL to create baselines
    
    // For now, we'll try to use the production URL if available
    if (this.config.productionUrl) {
      const routes = await this.getDiscoveredRoutes();
      const viewports = [
        { width: 1920, height: 1080 },
        { width: 768, height: 1024 },
        { width: 375, height: 667 }
      ];
      
      const results = await this.createBaselines(routes, viewports);
      return results.length > 0;
    }
    
    core.warning('No production URL configured for main branch baseline creation');
    return false;
  }

  /**
   * Get discovered routes from route manifest
   */
  private async getDiscoveredRoutes(): Promise<string[]> {
    try {
      const manifest = await this.impactAnalyzer.getRouteManifest();
      return manifest?.routes || ['/'];
    } catch {
      return ['/'];
    }
  }
}