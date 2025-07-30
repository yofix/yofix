import * as core from '@actions/core';
import { Agent } from '../../browser-agent/core/Agent';
import { RouteAnalysisResult, Viewport, FirebaseConfig } from '../../types';

export interface TestResult {
  route: string;
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

/**
 * Test Generator - Powered by Browser Agent
 * 
 * Instead of generating Playwright test templates, this directly executes
 * tests using the browser-agent's natural language capabilities.
 */
export class TestGenerator {
  private firebaseConfig: FirebaseConfig;
  private viewports: Viewport[];
  private claudeApiKey: string;

  constructor(firebaseConfig: FirebaseConfig, viewports: Viewport[], claudeApiKey: string) {
    this.firebaseConfig = firebaseConfig;
    this.viewports = viewports;
    this.claudeApiKey = claudeApiKey;
  }

  /**
   * Run comprehensive tests on analyzed routes
   */
  async runTests(analysis: RouteAnalysisResult): Promise<TestResult[]> {
    core.info('🤖 Running tests with Browser Agent...');
    
    const results: TestResult[] = [];
    
    // Test each route
    for (const route of analysis.routes) {
      const result = await this.testRoute(route, analysis);
      results.push(result);
    }
    
    core.info(`✅ Completed ${results.length} route tests`);
    return results;
  }

  /**
   * Test a specific route with comprehensive checks
   */
  private async testRoute(route: string, analysis: RouteAnalysisResult): Promise<TestResult> {
    const startTime = Date.now();
    const url = `${this.firebaseConfig.previewUrl}${route}`;
    
    core.info(`Testing route: ${route}`);
    
    try {
      // Create comprehensive test task
      const testTask = this.buildRouteTestTask(route, url, analysis);
      
      const agent = new Agent(testTask, {
        headless: true,
        maxSteps: 25,
        llmProvider: 'anthropic',
        viewport: this.viewports[0] || { width: 1920, height: 1080 }
      });
      
      // Set API key
      process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
      
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
   * Build a comprehensive test task for a route
   */
  private buildRouteTestTask(route: string, url: string, analysis: RouteAnalysisResult): string {
    const tasks: string[] = [
      `1. Navigate to ${url}`,
      '2. Wait for the page to fully load',
      '3. Take a screenshot for baseline comparison',
      '4. Run check_visual_issues with screenshot=true to detect layout problems',
      '5. Test navigation by clicking on interactive elements',
      '6. Check for broken images or missing content'
    ];

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

  /**
   * Run authentication tests
   */
  async testAuthentication(loginUrl: string, credentials: { email: string; password: string }): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const authTask = `
        Test the authentication flow:
        
        1. Navigate to ${this.firebaseConfig.previewUrl}${loginUrl}
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
        llmProvider: 'anthropic'
      });
      
      process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
      
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
   * Generate and run tests with AI analysis
   */
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
      llmProvider: 'anthropic'
    });
    
    process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
    
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