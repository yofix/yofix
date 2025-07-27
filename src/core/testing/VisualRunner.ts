import * as core from '@actions/core';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { TestTemplate, TestResult, Screenshot, Video, ConsoleMessage, FirebaseConfig, Viewport, TestAction, TestAssertion } from '../../types';
import { promises as fs } from 'fs';
import path from 'path';
import { AuthHandler } from '../../github/AuthHandler';

export class VisualRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private firebaseConfig: FirebaseConfig;
  private outputDir: string;
  private testTimeout: number;
  private authHandler: AuthHandler | null = null;
  private isAuthenticated: boolean = false;

  constructor(firebaseConfig: FirebaseConfig, outputDir: string, testTimeoutMs: number = 300000) {
    this.firebaseConfig = firebaseConfig;
    this.outputDir = outputDir;
    this.testTimeout = testTimeoutMs;
  }

  /**
   * Set authentication handler
   */
  setAuthHandler(authHandler: AuthHandler): void {
    this.authHandler = authHandler;
  }
  
  /**
   * Enable smart authentication if Claude API key is available
   */
  enableSmartAuth(claudeApiKey: string): void {
    if (this.authHandler) {
      // Replace with smart-enabled handler
      const authConfig = (this.authHandler as any).authConfig;
      this.authHandler = new AuthHandler(authConfig, { 
        claudeApiKey, 
        forceSmartMode: true 
      });
      core.info('🧠 Smart authentication enabled for visual tests');
    }
  }

  /**
   * Initialize browser and context
   */
  async initialize(): Promise<void> {
    core.info('Initializing Playwright browser for React SPA testing...');
    
    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });
      
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows'
        ]
      });

      // Ensure video directory exists
      const videoDir = path.join(this.outputDir, 'videos-temp');
      await fs.mkdir(videoDir, { recursive: true });

      this.context = await this.browser.newContext({
        ignoreHTTPSErrors: true,
        // React development often has console warnings we want to capture but not fail on
        // Note: Playwright records in WebM format by default
        // For better compatibility, we might need to convert to MP4 post-recording
        recordVideo: {
          dir: videoDir,
          size: { width: 1280, height: 720 }  // Use 720p for balanced quality/size
        },
        // Additional browser context options for better video
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1
      });

      // Set default timeouts
      this.context.setDefaultTimeout(this.testTimeout);
      this.context.setDefaultNavigationTimeout(this.testTimeout);

      core.info('Browser initialized successfully');
    } catch (error) {
      core.error(`Failed to initialize browser: ${error}`);
      throw error;
    }
  }

  /**
   * Run all tests and return results
   */
  async runTests(tests: TestTemplate[]): Promise<TestResult[]> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    const results: TestResult[] = [];
    core.info(`Running ${tests.length} tests for React SPA verification...`);

    for (const test of tests) {
      try {
        core.info(`Starting test: ${test.name}`);
        const result = await this.runSingleTest(test);
        results.push(result);
        core.info(`Completed test: ${test.name} - ${result.status}`);
      } catch (error) {
        core.error(`Test ${test.name} failed with error: ${error}`);
        results.push({
          testId: test.id,
          testName: test.name,
          status: 'failed',
          duration: 0,
          screenshots: [],
          videos: [],
          errors: [String(error)],
          consoleMessages: []
        });
      }
    }

    return results;
  }

  /**
   * Run a single test with React SPA optimizations
   */
  private async runSingleTest(test: TestTemplate): Promise<TestResult> {
    if (!this.context) {
      throw new Error('Browser context not available');
    }

    const startTime = Date.now();
    
    // Create a page with video recording enabled for this specific test
    const page = await this.context.newPage();
    
    const consoleMessages: ConsoleMessage[] = [];
    const errors: string[] = [];
    const screenshots: Screenshot[] = [];
    let videos: Video[] = [];

    try {
      // Log video status at the start
      const hasVideo = page.video() !== null;
      core.info(`Test "${test.name}" - Video recording: ${hasVideo ? 'enabled' : 'disabled'}`);
      
      // Set viewport if specified
      if (test.viewport) {
        await page.setViewportSize({
          width: test.viewport.width,
          height: test.viewport.height
        });
      }

      // Set up console message collection
      page.on('console', (msg) => {
        consoleMessages.push({
          type: msg.type() as 'log' | 'warn' | 'error',
          text: msg.text(),
          timestamp: Date.now()
        });
      });

      // Set up error collection
      page.on('pageerror', (error) => {
        errors.push(`Page Error: ${error.message}`);
      });

      page.on('requestfailed', (request) => {
        errors.push(`Failed Request: ${request.url()} - ${request.failure()?.errorText}`);
      });

      // Execute test actions
      for (const action of test.actions) {
        await this.executeAction(page, action);
      }

      // Wait for React SPA to be fully loaded and hydrated
      await this.waitForReactSPAReady(page);

      // Execute assertions
      let allAssertionsPassed = true;
      for (const assertion of test.assertions) {
        try {
          await this.executeAssertion(page, assertion);
        } catch (assertionError) {
          allAssertionsPassed = false;
          errors.push(`Assertion failed: ${assertionError}`);
        }
      }

      // Take final screenshot
      const screenshotName = `${test.id}-${test.viewport?.name || 'default'}-final.png`;
      const screenshotPath = path.join(this.outputDir, 'screenshots', screenshotName);
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ 
        path: screenshotPath, 
        fullPage: true,
        type: 'png'
      });

      screenshots.push({
        name: screenshotName,
        path: screenshotPath,
        viewport: test.viewport || { width: 1920, height: 1080, name: 'default' },
        timestamp: Date.now()
      });

      // Handle video recording
      const video = page.video();
      if (video) {
        core.info(`Video recording detected for test: ${test.name}`);
        
        // Close the page first to ensure video is finalized
        await page.close();
        
        try {
          // Get the video path after closing
          const videoPath = await video.path();
          core.info(`Video path obtained: ${videoPath}`);
          
          if (videoPath) {
            const videoName = `${test.id}-${test.viewport?.width}x${test.viewport?.height}.webm`;
            const finalVideoPath = path.join(this.outputDir, 'videos', videoName);
            
            // Ensure video directory exists
            await fs.mkdir(path.dirname(finalVideoPath), { recursive: true });
            
            // Wait a bit for video to be fully written
            core.info('Waiting for video to be fully written...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if video file exists before copying
            try {
              await fs.access(videoPath);
              const sourceStats = await fs.stat(videoPath);
              core.info(`Source video size: ${sourceStats.size} bytes`);
              
              if (sourceStats.size > 0) {
                await fs.copyFile(videoPath, finalVideoPath);
                
                // Verify the copied file exists and has size
                const stats = await fs.stat(finalVideoPath);
                if (stats.size > 0) {
                  videos.push({
                    name: videoName,
                    path: finalVideoPath,
                    duration: Date.now() - startTime,
                    timestamp: startTime
                  });
                  core.info(`Video saved successfully: ${videoName} (${stats.size} bytes)`);
                } else {
                  core.warning(`Video file is empty after copy: ${videoName}`);
                }
              } else {
                core.warning(`Source video file is empty: ${videoPath}`);
              }
            } catch (videoError) {
              core.warning(`Failed to save video ${videoName}: ${videoError}`);
            }
          } else {
            core.warning('Video path is null');
          }
        } catch (error) {
          core.warning(`Failed to process video: ${error}`);
        }
      } else {
        core.info('No video recording for this test');
        await page.close();
      }

      return {
        testId: test.id,
        testName: test.name,
        status: allAssertionsPassed && errors.length === 0 ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        screenshots,
        videos,
        errors,
        consoleMessages
      };
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Execute a test action with React SPA considerations
   */
  private async executeAction(page: Page, action: TestAction): Promise<void> {
    const timeout = action.timeout || 30000;

    switch (action.type) {
      case 'goto':
        core.info(`Navigating to: ${action.target}`);
        
        // Check if we need to authenticate first
        if (this.authHandler && !this.isAuthenticated && !action.target!.includes('/login')) {
          core.info('Authentication required, logging in first...');
          const loginSuccess = await this.authHandler.login(page, this.firebaseConfig.previewUrl);
          if (loginSuccess) {
            this.isAuthenticated = true;
            core.info('Authentication successful, proceeding to target URL');
          } else {
            throw new Error('Authentication failed');
          }
        }
        
        await page.goto(action.target!, {
          waitUntil: 'networkidle',
          timeout
        });
        // Additional wait for React hydration
        await this.waitForReactSPAReady(page);
        break;

      case 'click':
        core.info(`Clicking: ${action.target}`);
        await page.click(action.target!, { timeout });
        // Wait for potential React state updates
        await page.waitForTimeout(1000);
        break;

      case 'fill':
        core.info(`Filling: ${action.target} with ${action.value}`);
        await page.fill(action.target!, action.value!, { timeout });
        break;

      case 'select':
        core.info(`Selecting: ${action.value} in ${action.target}`);
        await page.selectOption(action.target!, action.value!, { timeout });
        break;

      case 'wait':
        if (action.target) {
          core.info(`Waiting for element: ${action.target}`);
          await page.waitForSelector(action.target, { timeout });
        } else {
          core.info(`Waiting for: ${timeout}ms`);
          await page.waitForTimeout(timeout);
        }
        break;

      case 'scroll':
        core.info(`Scrolling to: ${action.target}`);
        if (action.target) {
          await page.locator(action.target).scrollIntoViewIfNeeded({ timeout });
        } else {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }
        break;

      default:
        core.warning(`Unknown action type: ${(action as any).type}`);
    }
  }

  /**
   * Execute a test assertion
   */
  private async executeAssertion(page: Page, assertion: TestAssertion): Promise<void> {
    const timeout = assertion.timeout || 10000;

    switch (assertion.type) {
      case 'visible':
        await page.waitForSelector(assertion.target, { 
          state: 'visible', 
          timeout 
        });
        break;

      case 'hidden':
        await page.waitForSelector(assertion.target, { 
          state: 'hidden', 
          timeout 
        });
        break;

      case 'text':
        if (assertion.expected) {
          const element = page.locator(assertion.target);
          await element.waitFor({ timeout });
          const text = await element.textContent();
          if (!text?.includes(assertion.expected)) {
            throw new Error(`Expected text "${assertion.expected}" not found in "${text}"`);
          }
        }
        break;

      case 'url':
        await page.waitForFunction(
          (expectedUrl) => window.location.href.includes(expectedUrl),
          assertion.target,
          { timeout }
        );
        break;

      case 'attribute':
        const element = page.locator(assertion.target);
        await element.waitFor({ timeout });
        const attr = await element.getAttribute(assertion.expected!);
        if (!attr) {
          throw new Error(`Attribute "${assertion.expected}" not found`);
        }
        break;

      default:
        core.warning(`Unknown assertion type: ${(assertion as any).type}`);
    }
  }

  /**
   * Wait for React SPA to be ready and hydrated
   */
  private async waitForReactSPAReady(page: Page): Promise<void> {
    core.info('Waiting for React SPA to be ready and hydrated...');
    
    try {
      // Wait for React root to be populated
      await page.waitForFunction(() => {
        const root = document.querySelector('#root, #app, [data-reactroot]');
        return root && root.children.length > 0;
      }, { timeout: 15000 });

      // Wait for network to be idle (React finished loading)
      await page.waitForLoadState('networkidle', { timeout: 10000 });

      // Additional wait for React hydration based on build system
      if (this.firebaseConfig.buildSystem === 'vite') {
        // Vite-specific: wait for HMR connection or module loading
        await page.waitForFunction(() => {
          return !document.querySelector('vite-error-overlay') &&
                 (window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.loadEventEnd > 0;
        }, { timeout: 10000 });
      } else {
        // Standard React: wait for bundle to finish executing
        await page.waitForFunction(() => {
          return document.readyState === 'complete' &&
                 (window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.loadEventEnd > 0;
        }, { timeout: 10000 });
      }

      // Final wait to ensure React has finished rendering
      await page.waitForTimeout(2000);
      
      core.info('React SPA is ready and hydrated');
    } catch (error) {
      core.warning(`React SPA ready check failed: ${error}. Continuing with test...`);
    }
  }

  /**
   * Take screenshot with optimal settings for React apps
   */
  async takeScreenshot(page: Page, name: string, viewport?: Viewport): Promise<Screenshot> {
    const screenshotName = `${name}.png`;
    const screenshotPath = path.join(this.outputDir, 'screenshots', screenshotName);
    
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      type: 'png',
      animations: 'disabled' // Disable animations for consistent screenshots
    });

    return {
      name: screenshotName,
      path: screenshotPath,
      viewport: viewport || { width: 1920, height: 1080, name: 'default' },
      timestamp: Date.now()
    };
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    core.info('Cleaning up browser resources...');
    
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      core.info('Browser cleanup completed');
    } catch (error) {
      core.warning(`Browser cleanup failed: ${error}`);
    }
  }
}