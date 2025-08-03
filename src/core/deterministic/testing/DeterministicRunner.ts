import { Page, Browser, chromium, BrowserContext } from 'playwright';
import * as core from '@actions/core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { Viewport, FirebaseConfig } from '../../../types';
import { StorageProvider } from '../../../providers/storage/types';

export interface DeterministicTestResult {
  route: string;
  actualUrl?: string; // URL after any redirects
  success: boolean;
  screenshots: Buffer[];
  screenshotUrls?: string[]; // Actual URLs where screenshots were taken
  pixelDiffs?: Array<{
    viewport: Viewport;
    diffPercentage: number;
    diffImage?: Buffer;
  }>;
  error?: string;
}

export class DeterministicRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private storageProvider?: StorageProvider;
  
  constructor(private firebaseConfig: FirebaseConfig, storageProvider?: StorageProvider) {
    this.storageProvider = storageProvider;
  }
  
  /**
   * Initialize browser - to be called after authentication
   */
  async initializeFromContext(context: BrowserContext): Promise<void> {
    this.context = context;
    this.page = await context.newPage();
    core.info('🤖 DeterministicRunner initialized with authenticated context');
  }
  
  /**
   * Initialize standalone browser (for non-auth scenarios)
   */
  async initializeStandalone(headless = true): Promise<void> {
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }
  
  /**
   * Test a route with deterministic navigation and screenshots
   */
  async testRoute(route: string, viewports: Viewport[]): Promise<DeterministicTestResult> {
    if (!this.page) {
      throw new Error('DeterministicRunner not initialized');
    }
    
    // Ensure proper URL construction with slash
    const url = route.startsWith('/') 
      ? `${this.firebaseConfig.previewUrl}${route}`
      : `${this.firebaseConfig.previewUrl}/${route}`;
    core.info(`🎯 Testing route deterministically: ${url}`);
    
    try {
      // Navigate directly - no LLM needed
      await this.page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for any animations to complete
      await this.page.waitForTimeout(1000);
      
      // Get the actual URL after navigation (may be different due to redirects)
      const actualUrl = this.page.url();
      if (actualUrl !== url) {
        core.info(`🔄 Redirected to: ${actualUrl}`);
      }
      
      // Collect screenshots at different viewports
      const screenshots: Buffer[] = [];
      const screenshotUrls: string[] = [];
      const pixelDiffs: DeterministicTestResult['pixelDiffs'] = [];
      
      for (const viewport of viewports) {
        core.info(`📸 Taking screenshot at ${viewport.width}x${viewport.height}`);
        
        await this.page.setViewportSize(viewport);
        await this.page.waitForTimeout(500); // Let viewport settle
        
        // Capture current URL in case it changed
        const currentUrl = this.page.url();
        screenshotUrls.push(currentUrl);
        
        const screenshot = await this.page.screenshot({ 
          fullPage: true,
          type: 'png'
        });
        
        screenshots.push(screenshot);
        
        // Compare with baseline if available
        if (this.storageProvider) {
          const diff = await this.compareWithBaseline(route, viewport, screenshot);
          if (diff) {
            pixelDiffs.push(diff);
          }
        }
      }
      
      // Determine success based on pixel diffs
      const success = pixelDiffs.length === 0 || 
                     pixelDiffs.every(d => d.diffPercentage < 0.1); // 0.1% threshold
      
      return {
        route,
        actualUrl,
        success,
        screenshots,
        screenshotUrls,
        pixelDiffs: pixelDiffs.length > 0 ? pixelDiffs : undefined
      };
      
    } catch (error) {
      core.error(`Failed to test route ${route}: ${error}`);
      return {
        route,
        success: false,
        screenshots: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Compare screenshot with baseline using pixel comparison
   */
  private async compareWithBaseline(
    route: string, 
    viewport: Viewport, 
    screenshot: Buffer
  ): Promise<DeterministicTestResult['pixelDiffs'][0] | null> {
    try {
      // Try to get baseline from storage
      const baselineKey = `baselines/${route.replace(/\//g, '_')}_${viewport.width}x${viewport.height}.png`;
      const baseline = await this.storageProvider?.downloadFile?.(baselineKey);
      
      if (!baseline) {
        // No baseline, save current as baseline
        await this.storageProvider?.uploadFile?.(baselineKey, screenshot);
        core.info(`📸 Saved new baseline for ${route} at ${viewport.width}x${viewport.height}`);
        return null;
      }
      
      // Perform pixel comparison
      const currentImg = PNG.sync.read(screenshot);
      const baselineImg = PNG.sync.read(baseline);
      
      // Ensure same dimensions
      if (currentImg.width !== baselineImg.width || currentImg.height !== baselineImg.height) {
        core.warning(`Image dimensions mismatch for ${route}`);
        return null;
      }
      
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
      
      if (diffPercentage > 0.1) {
        core.warning(`🔍 Visual difference detected: ${diffPercentage.toFixed(2)}% for ${route}`);
        
        return {
          viewport,
          diffPercentage,
          diffImage: PNG.sync.write(diffImg)
        };
      }
      
      return null;
      
    } catch (error) {
      core.warning(`Baseline comparison failed: ${error}`);
      return null;
    }
  }
  
  /**
   * Test basic functionality (links, forms, etc)
   */
  async testFunctionality(route: string): Promise<{
    workingLinks: number;
    brokenLinks: number;
    forms: number;
    issues: string[];
  }> {
    if (!this.page) {
      throw new Error('DeterministicRunner not initialized');
    }
    
    // Ensure proper URL construction with slash
    const url = route.startsWith('/') 
      ? `${this.firebaseConfig.previewUrl}${route}`
      : `${this.firebaseConfig.previewUrl}/${route}`;
    await this.page.goto(url, { waitUntil: 'networkidle' });
    
    const issues: string[] = [];
    
    // Test all links
    const links = await this.page.locator('a[href]').all();
    let workingLinks = 0;
    let brokenLinks = 0;
    
    for (const link of links) {
      try {
        const href = await link.getAttribute('href');
        if (href && (href.startsWith('http') || href.startsWith('/'))) {
          // Just check if clickable, don't navigate
          const isVisible = await link.isVisible();
          if (isVisible) {
            workingLinks++;
          }
        }
      } catch {
        brokenLinks++;
      }
    }
    
    // Count forms
    const forms = await this.page.locator('form').count();
    
    // Check for console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        issues.push(`Console error: ${msg.text()}`);
      }
    });
    
    return {
      workingLinks,
      brokenLinks,
      forms,
      issues
    };
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Don't close the page if using shared context
    if (this.browser) {
      await this.browser.close();
    }
    this.page = null;
    this.context = null;
    this.browser = null;
  }
  
  /**
   * Get the page instance (for advanced usage)
   */
  getPage(): Page | null {
    return this.page;
  }
}