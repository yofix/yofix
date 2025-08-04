import * as core from '@actions/core';
import { getConfiguration } from '../hooks/ConfigurationHook';
import { BrowserContext } from 'playwright';
import { Agent } from '../../browser-agent/core/Agent';
import { RouteAnalysisResult, Viewport, FirebaseConfig } from '../../types';
import { DeterministicRunner, DeterministicTestResult } from '../deterministic/testing/DeterministicRunner';
import { StorageFactory } from '../../providers/storage/StorageFactory';
import { buildFullUrl } from '../../utils/urlBuilder';

export interface TestResult {
  route: string;
  actualUrl?: string; // URL after any redirects
  screenshotUrls?: string[]; // Actual URLs where screenshots were taken
  success: boolean;
  duration: number;
  issues: Array<{
    type: string;
    severity: 'critical' | 'warning' | 'info';
    description: string;
    fix?: string;
  }>;
  screenshots: Buffer[];
  error?: string;
}

export class TestGenerator {
  private firebaseConfig: FirebaseConfig;
  private viewports: Viewport[];
  private claudeApiKey: string;
  // private githubToken: string; // Removed - now handled by GitHubServiceFactory
  private sharedAgent: Agent | null = null;
  private sharedBrowserContext: BrowserContext | null = null;

  constructor(firebaseConfig: FirebaseConfig, viewports: Viewport[], claudeApiKey: string) {
    this.firebaseConfig = firebaseConfig;
    this.viewports = viewports;
    this.claudeApiKey = claudeApiKey;
    // this.githubToken = githubToken; // Removed - now handled by GitHubServiceFactory
  }
  
  /**
   * Get the shared browser context (if using shared session mode)
   */
  getSharedBrowserContext(): BrowserContext | null {
    return this.sharedBrowserContext;
  }
  
  /**
   * Clean up resources (call this after visual analysis is done)
   */
  async cleanup(): Promise<void> {
    if (this.sharedAgent) {
      await this.sharedAgent.cleanup();
      this.sharedAgent = null;
      this.sharedBrowserContext = null;
    }
  }

  async runTests(analysis: RouteAnalysisResult): Promise<TestResult[]> {
    // Get session mode from input or use default from config
    const sessionMode = getConfiguration().getInput('session-mode') || 
                       require('../../config/default.config').actionDefaults['session-mode'];
    
    if (sessionMode === 'sharedAgent') {
      core.info('🤖 Running tests with shared browser session...');
      return await this.runTestsWithSharedSession(analysis);
    } else {
      core.info('🤖 Running tests with independent browser sessions...');
      return await this.runTestsIndependently(analysis);
    }
  }

  /**
   * Run tests with independent browser sessions (original behavior)
   */
  private async runTestsIndependently(analysis: RouteAnalysisResult): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // Test each route
    for (const route of analysis.routes) {
      try {
        const result = await this.testRoute(route, analysis);
        results.push(result);
      } catch (error) {
        core.warning(`Failed to test route ${route}: ${error}. Continuing with next route...`);
        results.push({
          route,
          success: false,
          duration: 0,
          issues: [{
            type: 'test-error',
            severity: 'critical',
            description: `Test was canceled or failed: ${error}`
          }],
          screenshots: [],
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    core.info(`✅ Completed ${results.length} route tests`);
    return results;
  }

  /**
   * Run tests with shared browser session for efficiency
   */
  private async runTestsWithSharedSession(analysis: RouteAnalysisResult): Promise<TestResult[]> {
    const results: TestResult[] = [];
    let deterministicRunner: DeterministicRunner | null = null;
    
    try {
      // Step 1: Use browser-agent ONLY for authentication
      const authEmail = getConfiguration().getInput('auth-email');
      const authPassword = getConfiguration().getInput('auth-password');
      const authMode = getConfiguration().getInput('auth-mode') || 'llm';
      
      let initialTask = '';
      if (authEmail && authPassword) {
        const loginUrl = getConfiguration().getInput('auth-login-url') || '/login';
        if (authMode === 'llm') {
          initialTask = `Authenticate using llm_login with email="${authEmail}" password="${authPassword}" loginUrl="${loginUrl}".`;
        } else {
          initialTask = `Authenticate using smart_login with email="${authEmail}" password="${authPassword}" url="${loginUrl}".`;
        }
      } else {
        initialTask = `Navigate to ${this.firebaseConfig.previewUrl} and wait for page to load.`;
      }
      
      core.info('🔐 Initializing shared browser session with authentication...');
      
      // Create shared agent for auth only
      this.sharedAgent = new Agent(initialTask, {
        headless: true,
        maxSteps: 10,
        llmProvider: 'anthropic',
        viewport: this.viewports[0] || { width: 1920, height: 1080 },
        apiKey: this.claudeApiKey
      });
      
      await this.sharedAgent.initialize();
      const authResult = await this.sharedAgent.run();
      
      if (!authResult.success) {
        core.error('Failed to authenticate in shared session');
        throw new Error('Authentication failed');
      }
      
      core.info('✅ Shared session authenticated successfully');
      
      // Step 2: Get the browser context from agent to preserve session
      const browserContext = this.sharedAgent.getBrowserContext();
      if (!browserContext) {
        throw new Error('Failed to get browser context from agent');
      }
      
      // Store for later use by visual analyzer
      this.sharedBrowserContext = browserContext;
      
      // Initialize storage provider
      const storageProvider = await StorageFactory.createFromInputs();
      
      // Create deterministic runner with the authenticated context
      deterministicRunner = new DeterministicRunner(this.firebaseConfig, storageProvider);
      await deterministicRunner.initializeFromContext(browserContext);
      
      // Step 3: Test each route deterministically
      for (const route of analysis.routes) {
        try {
          core.info(`\n📍 Testing route: ${route}`);
          
          // Use deterministic navigation and screenshots
          const deterministicResult = await deterministicRunner.testRoute(route, this.viewports);
          
          // Convert deterministic result to TestResult format
          const result: TestResult = {
            route,
            actualUrl: deterministicResult.actualUrl,
            screenshotUrls: deterministicResult.screenshotUrls,
            success: deterministicResult.success,
            duration: 0, // Can add timing if needed
            issues: this.convertPixelDiffsToIssues(deterministicResult.pixelDiffs),
            screenshots: deterministicResult.screenshots,
            error: deterministicResult.error
          };
          
          results.push(result);
          
        } catch (error) {
          core.warning(`Failed to test route ${route}: ${error}. Continuing with next route...`);
          results.push({
            route,
            success: false,
            duration: 0,
            issues: [{
              type: 'test-error',
              severity: 'critical',
              description: `Test was canceled or failed: ${error}`
            }],
            screenshots: [],
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
    } finally {
      // Clean up
      if (deterministicRunner) {
        await deterministicRunner.cleanup();
      }
      // Don't clean up shared context yet - it might be needed for visual analysis
      // Cleanup will be called explicitly later
    }
    
    core.info(`\n✅ Completed ${results.length} route tests with hybrid approach`);
    return results;
  }

  /**
   * Test a route using the shared agent
   */
  private async testRouteWithSharedAgent(route: string, analysis: RouteAnalysisResult): Promise<TestResult> {
    const startTime = Date.now();
    const url = buildFullUrl(this.firebaseConfig.previewUrl, route);
    
    core.info(`Testing route: ${route}`);
    core.info(`Full URL: ${url}`);
    core.info(`Note: Agent should navigate from current page to this URL`);
    
    if (!this.sharedAgent || !this.sharedAgent.isActive()) {
      throw new Error('Shared agent is not active');
    }
    
    try {
      // Build simplified task for route testing (no authentication needed)
      const testTask = this.buildRouteTestTaskForSharedSession(route, url, analysis);
      
      // Run the task in the existing browser session
      const result = await this.sharedAgent.runTask(testTask);
      
      // Extract results from agent's memory
      const state = this.sharedAgent.getState();
      const visualIssues = state.memory.get('visual_issues') || [];
      const responsiveResults = state.memory.get('responsive_test_results') || [];
      
      // Process issues
      const issues = visualIssues.map((issue: any) => ({
        type: issue.type,
        severity: issue.severity,
        description: issue.description,
        fix: issue.suggestedFix
      }));
      
      return {
        route,
        success: result.success,
        duration: Date.now() - startTime,
        issues,
        screenshots: result.screenshots,
        error: result.error
      };
      
    } catch (error) {
      core.error(`Failed to test route ${route}: ${error}`);
      
      return {
        route,
        success: false,
        duration: Date.now() - startTime,
        issues: [],
        screenshots: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testRoute(route: string, analysis: RouteAnalysisResult): Promise<TestResult> {
    const startTime = Date.now();
    const url = buildFullUrl(this.firebaseConfig.previewUrl, route);
    
    core.info(`Testing route: ${route}`);
    
    try {
      // Create comprehensive test task
      const testTask = this.buildRouteTestTask(route, url, analysis);
      
      const agent = new Agent(testTask, {
        headless: true,
        maxSteps: 50, // Increased from 25 to allow for authentication and navigation retries
        llmProvider: 'anthropic',
        viewport: this.viewports[0] || { width: 1920, height: 1080 },
        apiKey: this.claudeApiKey
      });
      
      await agent.initialize();
      const result = await agent.run();
      
      // Extract results from agent's memory
      const state = agent.getState();
      const visualIssues = state.memory.get('visual_issues') || [];
      const responsiveResults = state.memory.get('responsive_test_results') || [];
      
      // Process issues
      const issues = visualIssues.map((issue: any) => ({
        type: issue.type,
        severity: issue.severity,
        description: issue.description,
        fix: issue.suggestedFix
      }));
      
      await agent.cleanup();
      
      return {
        route,
        success: result.success,
        duration: Date.now() - startTime,
        issues,
        screenshots: result.screenshots,
        error: result.error
      };
      
    } catch (error) {
      core.error(`Failed to test route ${route}: ${error}`);
      
      return {
        route,
        success: false,
        duration: Date.now() - startTime,
        issues: [],
        screenshots: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Build test task for shared session (no authentication needed)
   */
  private buildRouteTestTaskForSharedSession(route: string, url: string, analysis: RouteAnalysisResult): string {
    const tasks: string[] = [];
    
    // CRITICAL: Navigate to the target route (shared session already authenticated)
    tasks.push(`1. FIRST: Check your current URL using get_page_info`);
    tasks.push(`2. IMPORTANT: Navigate to the target URL: ${url}`);
    tasks.push(`   - Use go_to action to navigate to ${url}`);
    tasks.push(`   - Current page doesn't matter - just navigate to ${url}`);
    tasks.push(`3. Verify navigation succeeded by checking you're now at ${url}`);
    tasks.push(`4. Wait for the page to fully load (wait for network idle)`);
    tasks.push(`4. Take a screenshot for baseline comparison`);
    tasks.push('5. Run check_visual_issues with screenshot=true to detect layout problems');
    tasks.push('6. Test navigation by clicking on interactive elements');
    tasks.push('7. Check for broken images or missing content');

    // Add responsive testing for UI changes
    if (analysis.hasUIChanges) {
      tasks.push('7. Run test_responsive to check mobile and tablet layouts');
    }

    // Add form testing if forms are detected
    const hasFormComponents = analysis.components.some(comp => 
      comp.toLowerCase().includes('form') || 
      comp.toLowerCase().includes('input') ||
      comp.toLowerCase().includes('login')
    );
    
    if (hasFormComponents) {
      tasks.push('8. Test form interactions by filling out any visible forms');
    }

    // Add error boundary testing for high-risk changes
    if (analysis.riskLevel === 'high') {
      tasks.push('9. Test error boundaries by triggering edge cases');
    }

    // Add results saving
    tasks.push(`10. Save any issues found to /results${route.replace(/\//g, '_')}.json`);
    tasks.push('11. Generate fixes for any critical issues using generate_visual_fix');

    return `IMPORTANT: You are currently authenticated but may not be on the correct page.
REGARDLESS of your current location, you MUST navigate to the target route.

Test the ${route} page comprehensively:\n\n${tasks.join('\n')}

CRITICAL: Do NOT assume you are already on the correct page!
The FIRST meaningful action must be to navigate to ${url} using the go_to action!
DO NOT take screenshots or run tests until you have confirmed you are at ${url}!

Focus on:
- Visual layout issues (overlaps, overflows, alignment)
- Responsive behavior across viewports
- Interactive element functionality
- Loading performance and errors
- Accessibility concerns

Provide detailed analysis and practical fixes for any issues found.`;
  }

  private buildRouteTestTask(route: string, url: string, analysis: RouteAnalysisResult): string {
    const tasks: string[] = [];
    
    // Check if authentication is needed
    const authEmail = getConfiguration().getInput('auth-email');
    const authPassword = getConfiguration().getInput('auth-password');
    const authMode = getConfiguration().getInput('auth-mode') || 'llm';
    
    if (authEmail && authPassword) {
      const loginUrl = getConfiguration().getInput('auth-login-url') || '/login';
      if (authMode === 'llm') {
        tasks.push(`1. Use llm_login to authenticate with email="${authEmail}" password="${authPassword}" loginUrl="${loginUrl}"`);
      } else {
        tasks.push(`1. Use smart_login to authenticate with email="${authEmail}" password="${authPassword}" url="${loginUrl}"`);
      }
      tasks.push(`2. Navigate to ${url} after authentication`);
    } else {
      tasks.push(`1. Navigate to ${url}`);
    }
    
    tasks.push(
      `${tasks.length + 1}. Wait for the page to fully load`,
      `${tasks.length + 2}. Take a screenshot for baseline comparison`,
      '4. Run check_visual_issues with screenshot=true to detect layout problems',
      '5. Test navigation by clicking on interactive elements',
      '6. Check for broken images or missing content'
    );

    // Add responsive testing for UI changes
    if (analysis.hasUIChanges) {
      tasks.push('7. Run test_responsive to check mobile and tablet layouts');
    }

    // Add form testing if forms are detected
    const hasFormComponents = analysis.components.some(comp => 
      comp.toLowerCase().includes('form') || 
      comp.toLowerCase().includes('input') ||
      comp.toLowerCase().includes('login')
    );
    
    if (hasFormComponents) {
      tasks.push('8. Test form interactions by filling out any visible forms');
    }

    // Add error boundary testing for high-risk changes
    if (analysis.riskLevel === 'high') {
      tasks.push('9. Test error boundaries by triggering edge cases');
    }

    // Add results saving
    tasks.push(`10. Save any issues found to /results${route.replace(/\//g, '_')}.json`);
    tasks.push('11. Generate fixes for any critical issues using generate_visual_fix');

    return `Test the ${route} page comprehensively:\n\n${tasks.join('\n')}

Focus on:
- Visual layout issues (overlaps, overflows, alignment)
- Responsive behavior across viewports
- Interactive element functionality
- Loading performance and errors
- Accessibility concerns

Provide detailed analysis and practical fixes for any issues found.`;
  }

  async testAuthentication(loginUrl: string, credentials: { email: string; password: string }): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const authUrl = buildFullUrl(this.firebaseConfig.previewUrl, loginUrl);
      const authTask = `
        Test the authentication flow:
        
        1. Navigate to ${authUrl}
        2. Use smart_login with email="${credentials.email}" password="${credentials.password}"
        3. Verify successful login by checking for user profile or dashboard elements
        4. Test logout functionality
        5. Verify successful logout by checking return to login page
        6. Take screenshots at each step
        7. Save test results to /auth-test-results.json
        
        Report any issues with the login/logout flow.
      `;
      
      const agent = new Agent(authTask, {
        headless: true,
        maxSteps: 15,
        llmProvider: 'anthropic',
      apiKey: this.claudeApiKey
      });
      
      await agent.initialize();
      const result = await agent.run();
      await agent.cleanup();
      
      return {
        route: loginUrl,
        success: result.success,
        duration: Date.now() - startTime,
        issues: [],
        screenshots: result.screenshots,
        error: result.error
      };
      
    } catch (error) {
      return {
        route: loginUrl,
        success: false,
        duration: Date.now() - startTime,
        issues: [],
        screenshots: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Convert pixel diffs to issues format
   */
  private convertPixelDiffsToIssues(pixelDiffs?: DeterministicTestResult['pixelDiffs']): TestResult['issues'] {
    if (!pixelDiffs || pixelDiffs.length === 0) {
      return [];
    }
    
    return pixelDiffs.map(diff => ({
      type: 'visual-regression',
      severity: diff.diffPercentage > 5 ? 'critical' : 
               diff.diffPercentage > 1 ? 'warning' : 'info' as any,
      description: `Visual regression detected: ${diff.diffPercentage.toFixed(2)}% difference at ${diff.viewport.width}x${diff.viewport.height}`,
      fix: 'Review visual changes and update baseline if intentional'
    }));
  }

  async generateAndRunTests(analysis: RouteAnalysisResult): Promise<TestResult[]> {
    core.info('🧠 AI-powered test generation and execution...');
    
    const testPlanTask = `
      Analyze this web application and create a comprehensive test plan:
      
      Application URL: ${this.firebaseConfig.previewUrl}
      Routes to test: ${analysis.routes.join(', ')}
      Components: ${analysis.components.join(', ')}
      Risk Level: ${analysis.riskLevel}
      UI Changes: ${analysis.hasUIChanges ? 'Yes' : 'No'}
      
      For each route, determine:
      1. What specific functionality to test
      2. What visual elements to verify
      3. What user interactions to simulate  
      4. What edge cases to check
      5. What performance aspects to measure
      
      Then execute the tests systematically and report results.
    `;
    
    const agent = new Agent(testPlanTask, {
      headless: true,
      maxSteps: 50,
      llmProvider: 'anthropic',
    apiKey: this.claudeApiKey
    });
    
    try {
      await agent.initialize();
      const result = await agent.run();
      await agent.cleanup();
      
      // Parse results from agent's file system
      const state = agent.getState();
      const testResults: TestResult[] = [];
      
      for (const route of analysis.routes) {
        const routeFile = state.fileSystem.get(`/results${route.replace(/\//g, '_')}.json`);
        
        if (routeFile) {
          try {
            const routeResult = JSON.parse(routeFile);
            testResults.push({
              route,
              success: routeResult.success || true,
              duration: routeResult.duration || 0,
              issues: routeResult.issues || [],
              screenshots: result.screenshots || [],
              error: routeResult.error
            });
          } catch (e) {
            // Fallback result
            testResults.push({
              route,
              success: result.success,
              duration: 0,
              issues: [],
              screenshots: result.screenshots,
              error: undefined
            });
          }
        }
      }
      
      return testResults;
      
    } catch (error) {
      core.error(`AI test generation failed: ${error}`);
      
      // Fallback to standard test execution
      return await this.runTests(analysis);
    }
  }
}