import { Page, Browser, chromium, BrowserContext } from 'playwright';
import * as core from '@actions/core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { Viewport, FirebaseConfig } from '../../../types';
import { StorageProvider } from '../../../providers/storage/types';
import { DynamicBaselineManager } from '../../../core/baseline/DynamicBaselineManager';

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
  private baselineManager?: DynamicBaselineManager;
  
  constructor(private firebaseConfig: FirebaseConfig, storageProvider?: StorageProvider, githubToken?: string) {
    this.storageProvider = storageProvider;
    
    // Initialize baseline manager if storage is available
    if (storageProvider) {
      this.baselineManager = new DynamicBaselineManager({
        storageProvider,
        githubToken: githubToken || process.env.GITHUB_TOKEN || '',
        productionUrl: process.env.PRODUCTION_URL
      });
    }
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
   * Initialize with existing authenticated page (preferred for session persistence)
   */
  async initializeFromPage(page: Page): Promise<void> {
    this.page = page;
    this.context = page.context();
    core.info('🤖 DeterministicRunner initialized with authenticated page');
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
      // Navigate with more resilient strategy
      try {
        // First try with networkidle (most thorough)
        await this.page.goto(url, { 
          waitUntil: 'networkidle',
          timeout: 15000 
        });
      } catch (timeoutError) {
        core.warning(`Network idle timeout, trying with domcontentloaded...`);
        // If networkidle times out, try with domcontentloaded
        try {
          await this.page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 10000 
          });
          // Give the page some time to render after DOM is loaded
          await this.page.waitForTimeout(3000);
        } catch (domError) {
          core.warning(`DOM content loaded timeout, trying with commit...`);
          // Last resort: just wait for navigation to commit
          await this.page.goto(url, { 
            waitUntil: 'commit',
            timeout: 5000 
          });
          // Give more time for page to render
          await this.page.waitForTimeout(5000);
        }
      }
      
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
        if (this.baselineManager) {
          const comparison = await this.baselineManager.compareWithBaseline(route, viewport, screenshot);
          if (comparison.hasDifference) {
            pixelDiffs.push({
              viewport,
              diffPercentage: comparison.diffPercentage,
              diffImage: comparison.diffImage
            });
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
      
      // Try to take a screenshot of the current state for debugging
      let debugScreenshot: Buffer | undefined;
      let currentUrl: string | undefined;
      try {
        currentUrl = this.page.url();
        core.info(`Current URL during error: ${currentUrl}`);
        debugScreenshot = await this.page.screenshot({ fullPage: true, type: 'png' });
        core.info(`Captured debug screenshot of error state`);
      } catch (screenshotError) {
        core.warning(`Could not capture debug screenshot: ${screenshotError}`);
      }
      
      return {
        route,
        actualUrl: currentUrl,
        success: false,
        screenshots: debugScreenshot ? [debugScreenshot] : [],
        screenshotUrls: currentUrl ? [currentUrl] : [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Initialize baselines before testing
   */
  async initializeBaselines(routes: string[], viewports: Viewport[]): Promise<void> {
    if (!this.baselineManager) return;
    
    // Ensure baselines exist for all routes
    await this.baselineManager.ensureBaselines(routes, viewports);
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