/**
 * Deterministic Engine - Core module for fast, reliable visual testing
 * 
 * This engine provides deterministic testing capabilities without LLM assistance:
 * - Direct browser automation
 * - Pixel-perfect visual comparison
 * - Functional testing (links, forms, console errors)
 * - Baseline management
 */

import * as core from '@actions/core';
import { DeterministicRunner } from './testing/DeterministicRunner';
import { DeterministicVisualAnalyzer } from './visual/DeterministicVisualAnalyzer';
import { DeterministicEngineConfig, DeterministicReport, DeterministicScanOptions, DeterministicTestResult } from './types';
import { defaultConfig } from '../../config/default.config';
import { StorageFactory } from '../../providers/storage/StorageFactory';
import { Agent } from '../../browser-agent/core/Agent';

export class DeterministicEngine {
  private config: DeterministicEngineConfig;
  private runner?: DeterministicRunner;
  private analyzer?: DeterministicVisualAnalyzer;
  private authAgent?: Agent;
  
  constructor(config: Partial<DeterministicEngineConfig>) {
    this.config = {
      mode: defaultConfig.engine.mode,
      pixelDiffThreshold: defaultConfig.engine.deterministicOptions.pixelDiffThreshold,
      enableBaselines: defaultConfig.engine.deterministicOptions.enableBaselines,
      baselineUpdateStrategy: defaultConfig.engine.deterministicOptions.baselineUpdateStrategy,
      ...config,
      previewUrl: config.previewUrl || '',
      viewports: config.viewports || []
    };
  }
  
  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    core.info(`🚀 Initializing Deterministic Engine in ${this.config.mode} mode...`);
    
    // Initialize storage provider
    const storageProvider = await StorageFactory.createFromInputs();
    
    // Create runner
    this.runner = new DeterministicRunner(
      { previewUrl: this.config.previewUrl } as any,
      storageProvider
    );
    
    // Create analyzer
    this.analyzer = new DeterministicVisualAnalyzer(
      this.config.previewUrl,
      this.config.mode === 'assisted' ? core.getInput('claude-api-key') : undefined
    );
  }
  
  /**
   * Authenticate using LLM (when needed)
   */
  async authenticate(credentials: { email: string; password: string; loginUrl: string }): Promise<void> {
    const authMode = core.getInput('auth-mode') || 'llm';
    
    if (authMode !== 'llm') {
      core.info('📋 Non-LLM auth mode selected, skipping authentication');
      return;
    }
    
    core.info('🔐 Authenticating with LLM assistance...');
    
    const authTask = `Authenticate using llm_login with email="${credentials.email}" password="${credentials.password}" loginUrl="${credentials.loginUrl}". After successful login, wait for navigation to complete.`;
    
    this.authAgent = new Agent(authTask, {
      headless: true,
      maxSteps: 10,
      llmProvider: 'anthropic',
      viewport: this.config.viewports[0] || { width: 1920, height: 1080 },
      apiKey: core.getInput('claude-api-key')
    });
    
    await this.authAgent.initialize();
    const result = await this.authAgent.run();
    
    if (!result.success) {
      throw new Error('Authentication failed');
    }
    
    core.info('✅ Authentication successful');
    
    // Initialize runner with authenticated context
    const browserContext = this.authAgent.getBrowserContext();
    if (browserContext && this.runner) {
      await this.runner.initializeFromContext(browserContext);
    }
  }
  
  /**
   * Run visual scan on routes
   */
  async scan(options: DeterministicScanOptions): Promise<DeterministicReport> {
    if (!this.runner || !this.analyzer) {
      throw new Error('Engine not initialized');
    }
    
    const startTime = Date.now();
    const routeResults = new Map<string, any>();
    const allIssues: any[] = [];
    
    core.info(`🔍 Starting ${this.config.mode} scan of ${options.routes.length} routes...`);
    
    // If no authenticated context, initialize standalone
    if (!this.authAgent) {
      await this.runner.initializeStandalone(true);
    }
    
    // Test each route
    for (const route of options.routes) {
      core.info(`\n📸 Testing route: ${route}`);
      
      const result: DeterministicTestResult = await this.runner.testRoute(route, options.viewports);
      routeResults.set(route, result);
      
      // Convert test results to issues
      if (!result.success && result.pixelDiffs) {
        for (const diff of result.pixelDiffs) {
          if (diff.diffPercentage > (this.config.pixelDiffThreshold || 0.1)) {
            allIssues.push({
              type: 'visual-regression',
              severity: diff.diffPercentage > 5 ? 'critical' : 'medium',
              description: `${diff.diffPercentage.toFixed(2)}% visual difference detected`,
              route,
              viewport: diff.viewport,
              evidence: diff.diffImage
            });
          }
        }
      }
      
      // Run functional tests if enabled
      if (options.enableFunctionalTests && this.runner.getPage()) {
        const functionalResults = await this.runner.testFunctionality(route);
        result.functionalTests = functionalResults;
        
        // Add functional issues
        if (functionalResults.brokenLinks > 0) {
          allIssues.push({
            type: 'broken-link',
            severity: 'medium',
            description: `${functionalResults.brokenLinks} broken links found`,
            route
          });
        }
        
        functionalResults.issues.forEach(issue => {
          allIssues.push({
            type: 'console-error',
            severity: 'low',
            description: issue,
            route
          });
        });
      }
    }
    
    const successfulRoutes = Array.from(routeResults.values()).filter(r => r.success).length;
    
    const report: DeterministicReport = {
      timestamp: startTime,
      duration: Date.now() - startTime,
      totalRoutes: options.routes.length,
      successfulRoutes,
      failedRoutes: options.routes.length - successfulRoutes,
      issues: allIssues,
      routeResults
    };
    
    core.info(`\n✅ Scan complete in ${report.duration}ms`);
    core.info(`📊 Results: ${successfulRoutes}/${options.routes.length} routes passed`);
    core.info(`🔍 Found ${allIssues.length} issues`);
    
    return report;
  }
  
  /**
   * Generate fixes for issues (assisted mode only)
   */
  async generateFixes(issues: any[]): Promise<Array<{ issue: any; fix: string }>> {
    if (this.config.mode !== 'assisted' || !this.analyzer) {
      // In deterministic mode, provide standard fixes
      return issues.map(issue => ({
        issue,
        fix: this.getDeterministicFix(issue)
      }));
    }
    
    // Use analyzer for LLM-powered fixes
    return await this.analyzer.generateFixes(issues);
  }
  
  /**
   * Get deterministic fix suggestion
   */
  private getDeterministicFix(issue: any): string {
    switch (issue.type) {
      case 'visual-regression':
        return 'Visual regression detected. Review changes and update baseline if intentional.';
      case 'broken-link':
        return 'Fix broken links by updating href attributes or ensuring target pages exist.';
      case 'console-error':
        return 'Investigate and fix JavaScript errors in the console.';
      default:
        return 'Manual review required for this issue.';
    }
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.runner) {
      await this.runner.cleanup();
    }
    if (this.authAgent) {
      await this.authAgent.cleanup();
    }
  }
}

// Export types and components
export * from './types';
export { DeterministicRunner } from './testing/DeterministicRunner';
export { DeterministicVisualAnalyzer } from './visual/DeterministicVisualAnalyzer';