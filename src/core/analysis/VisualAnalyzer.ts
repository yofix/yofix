import * as core from '@actions/core';
import { Agent } from '../../browser-agent/core/Agent';
import { VisualIssue, ScanResult } from '../../bot/types';
import { FirebaseConfig } from '../../types';
import { CacheManager } from '../../optimization/CacheManager';
import { errorHandler, ErrorCategory, ErrorSeverity } from '../';

export class VisualAnalyzer {
  private claudeApiKey: string;
  private githubToken: string;
  private cache: CacheManager;
  private previewUrl?: string;

  constructor(claudeApiKey: string, githubToken: string = '', cache?: CacheManager, previewUrl?: string) {
    this.claudeApiKey = claudeApiKey;
    this.githubToken = githubToken;
    this.cache = cache || new CacheManager();
    this.previewUrl = previewUrl;
  }

  async scan(options: {
    prNumber: number;
    previewUrl?: string;
    routes: string[] | 'auto';
    viewports: string[];
    options: any;
  }): Promise<ScanResult> {
    const startTime = Date.now();
    
    core.info(`🤖 Scanning PR #${options.prNumber} with Browser Agent...`);
    
    try {
      // Auto-discover routes if needed
      const routes = await this.getRoutesToTest(options.routes);
      
      // Create comprehensive visual testing task
      const visualTestTask = this.buildVisualTestTask(routes, options.viewports, options.previewUrl);
      
      const agent = new Agent(visualTestTask, {
        headless: true,
        maxSteps: routes.length * 5, // 5 steps per route
        llmProvider: 'anthropic',
        apiKey: this.claudeApiKey,
        viewport: { width: 1920, height: 1080 }
      });
      
      await agent.initialize();
      const result = await agent.run();
      
      // Extract issues from agent's memory
      const agentState = agent.getState();
      const allIssues: VisualIssue[] = [];
      
      // Collect issues from all routes
      for (const route of routes) {
        const routeIssues = agentState.memory.get(`visual_issues_${route.replace(/\//g, '_')}`) as any[] || [];
        
        const formattedIssues: VisualIssue[] = routeIssues.map((issue, index) => ({
          id: index,
          type: issue.type || 'visual',
          severity: this.mapSeverity(issue.severity),
          description: issue.description,
          affectedViewports: issue.viewport ? [issue.viewport] : ['desktop'],
          location: {
            route: route,
            selector: issue.element?.selector,
            file: issue.file,
            line: issue.line
          },
          screenshots: issue.screenshot ? [issue.screenshot] : [],
          screenshot: issue.screenshot ? {
            current: issue.screenshot
          } : undefined,        
          fix: issue.suggestedFix ? {
            id: index,
            issueId: index,
            description: issue.suggestedFix,
            confidence: 0.9,
            files: []
          } : undefined
        }));
        
        allIssues.push(...formattedIssues);
      }
      
      await agent.cleanup();
      
      const scanResult: ScanResult = {
        timestamp: startTime,
        duration: Date.now() - startTime,
        routes: routes,
        issues: allIssues,
        summary: {
          total: allIssues.length,
          bySeverity: {
            critical: allIssues.filter(i => i.severity === 'critical').length,
            high: allIssues.filter(i => i.severity === 'high').length,
            medium: allIssues.filter(i => i.severity === 'medium').length,
            low: allIssues.filter(i => i.severity === 'low').length
          },
          byType: allIssues.reduce((acc, issue) => {
            acc[issue.type] = (acc[issue.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      };
      
      core.info(`✅ Visual scan completed: ${allIssues.length} issues found in ${routes.length} routes`);
      
      return scanResult;
      
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.ANALYSIS,
        userAction: 'Visual scan',
        metadata: { prNumber: options.prNumber, routes: options.routes },
        skipGitHubPost: true
      });
      
      return {
        timestamp: startTime,
        duration: Date.now() - startTime,
        routes: [],
        issues: [],
        summary: {
          total: 0,
          bySeverity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
          },
          byType: {}
        }
      };
    }
  }

  async analyzeScreenshot(screenshot: Buffer, prompt: string): Promise<string> {
    try {
      // Create a task for screenshot analysis
      const analysisTask = `
        Analyze the provided screenshot and ${prompt}
        
        Focus on:
        - Visual layout issues
        - Element positioning problems
        - Text readability concerns
        - Color contrast issues
        - Responsive design problems
        
        Provide specific, actionable feedback.
      `;
      
      const agent = new Agent(analysisTask, {
        headless: true,
        maxSteps: 5,
        llmProvider: 'anthropic',
        apiKey: this.claudeApiKey
      });
      
      await agent.initialize();
      
      // Save screenshot to agent's file system for analysis
      const agentState = agent.getState();
      agentState.fileSystem.set('/analysis-screenshot.png', screenshot.toString('base64'));
      
      const result = await agent.run();
      await agent.cleanup();
      
      // Get analysis from agent's memory or file system
      const analysis = agentState.fileSystem.get('/analysis-result.txt') || 
                     agentState.memory.get('screenshot_analysis') ||
                     'Screenshot analysis completed';
      
      return typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.ANALYSIS,
        userAction: 'Analyze screenshot with AI',
        metadata: { prompt },
        recoverable: true,
        skipGitHubPost: true
      });
      return 'Unable to analyze screenshot';
    }
  }

  async generateFixes(issues: VisualIssue[]): Promise<Array<{ issue: VisualIssue; fix: string }>> {
    const fixes: Array<{ issue: VisualIssue; fix: string }> = [];
    
    for (const issue of issues) {
      try {
        const fixTask = `
          Generate a code fix for this visual issue:
          
          Issue Type: ${issue.type}
          Description: ${issue.description}
          Route: ${issue.location.route}
          Severity: ${issue.severity}
          Element: ${issue.location.selector || 'Unknown'}
          
          Provide:
          1. Specific CSS or component code changes
          2. Explanation of why this fixes the issue
          3. Best practices to prevent similar issues
          
          Focus on maintainable, standards-compliant solutions.
        `;
        
        const agent = new Agent(fixTask, {
          headless: true,
          maxSteps: 5,
          llmProvider: 'anthropic',
          apiKey: this.claudeApiKey
        });
        
        await agent.initialize();
        const result = await agent.run();
        
        // Get fix from agent's file system
        const agentState = agent.getState();
        const fix = agentState.fileSystem.get('/generated-fix.css') ||
                   agentState.fileSystem.get('/generated-fix.jsx') ||
                   agentState.memory.get('generated_fix') ||
                   issue.fix?.description ||
                   'Fix could not be generated';
        
        fixes.push({
          issue,
          fix: typeof fix === 'string' ? fix : JSON.stringify(fix)
        });
        
        await agent.cleanup();
        
      } catch (error) {
        await errorHandler.handleError(error as Error, {
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.ANALYSIS,
          userAction: 'Generate fix for visual issue',
          metadata: { 
            issueId: issue.id, 
            issueType: issue.type,
            severity: issue.severity 
          },
          recoverable: true,
          skipGitHubPost: true
        });
        
        fixes.push({
          issue,
          fix: issue.fix?.description || 'Manual review required'
        });
      }
    }
    
    return fixes;
  }

  /**
   * Build comprehensive visual testing task
   */
  private buildVisualTestTask(routes: string[], viewports: string[], previewUrl?: string): string {
    const baseUrl = previewUrl || this.previewUrl || '';
    
    if (!baseUrl) {
      core.warning('No preview URL provided for visual testing!');
    }
    
    const tasks: string[] = [
      'Comprehensive Visual Testing Plan:',
      '',
      `IMPORTANT: Base URL for all routes is: ${baseUrl}`,
      'You MUST use the full URLs provided below, not placeholder URLs!',
      ''
    ];
    
    routes.forEach((route, index) => {
      const fullUrl = baseUrl ? `${baseUrl}${route}` : route;
      tasks.push(`Route ${index + 1}: ${route}`);
      tasks.push(`FULL URL TO NAVIGATE TO: ${fullUrl}`);
      tasks.push(`1. Navigate to exactly this URL: ${fullUrl}`);
      tasks.push(`   DO NOT use any other URL like app.yofix.com!`);
      tasks.push(`2. Wait for page to fully load`);
      tasks.push(`3. Run check_visual_issues with screenshot=true`);
      tasks.push(`4. Test responsive behavior on different viewport sizes`);
      tasks.push(`5. Save results to /visual_issues_${route.replace(/\//g, '_')}`);
      tasks.push('');
    });
    
    if (viewports.length > 1) {
      tasks.push('Cross-Viewport Testing:');
      tasks.push(`Test each route at viewports: ${viewports.join(', ')}`);
      tasks.push('Focus on layout consistency and responsive behavior');
      tasks.push('');
    }
    
    tasks.push('Issue Detection Priorities:');
    tasks.push('- Element overlaps (critical)');
    tasks.push('- Text overflow (warning)');  
    tasks.push('- Broken images (warning)');
    tasks.push('- Horizontal scroll (critical)');
    tasks.push('- Color contrast (info)');
    tasks.push('- Alignment issues (warning)');
    tasks.push('');
    
    tasks.push('For each issue found:');
    tasks.push('- Generate a specific fix using generate_visual_fix');
    tasks.push('- Take screenshot evidence');
    tasks.push('- Classify severity appropriately');
    tasks.push('- Provide actionable suggestions');
    
    return tasks.join('\n');
  }

  /**
   * Get routes to test
   */
  private async getRoutesToTest(routes: string[] | 'auto'): Promise<string[]> {
    if (Array.isArray(routes)) {
      return routes;
    }
    
    // Auto-discovery logic
    const commonRoutes = ['/', '/about', '/contact', '/dashboard', '/profile'];
    
    // In a real implementation, this would analyze the codebase
    // to discover routes automatically
    return commonRoutes;
  }

  /**
   * Generate suggestion for an issue
   */
  private generateSuggestion(issue: any): string {
    switch (issue.type) {
      case 'text-overflow':
        return 'Use text-overflow: ellipsis or increase container width';
      case 'element-overlap':
        return 'Adjust positioning or use flexbox/grid layout';
      case 'broken-image':
        return 'Fix image source URL or add fallback image';
      case 'horizontal-overflow':
        return 'Constrain width to viewport or add horizontal scroll';
      default:
        return 'Review element styling and layout properties';
    }
  }

  /**
   * Categorize issue type
   */
  private categorizeIssue(type: string): string {
    const categories: Record<string, string> = {
      'text-overflow': 'Typography',
      'element-overlap': 'Layout',
      'broken-image': 'Media',
      'horizontal-overflow': 'Responsive',
      'color-contrast': 'Accessibility',
      'alignment': 'Layout'
    };
    
    return categories[type] || 'General';
  }

  /**
   * Map severity from various formats to VisualIssue format
   */
  private mapSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' {
    const normalizedSeverity = severity?.toLowerCase() || 'medium';
    
    switch (normalizedSeverity) {
      case 'critical':
      case 'high':
      case 'medium':  
      case 'low':
        return normalizedSeverity as 'critical' | 'high' | 'medium' | 'low';
      case 'error':
      case 'severe':
        return 'critical';
      case 'warning':
      case 'warn':
        return 'medium';
      case 'info':
      case 'notice':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Explain a visual issue in detail (for bot commands)
   */
  async explainIssue(issue: VisualIssue): Promise<string> {
    try {
      const explanationTask = `
        Provide a detailed explanation for this visual issue:
        
        Issue Type: ${issue.type}
        Description: ${issue.description}
        Severity: ${issue.severity}
        Location: ${issue.location.route}
        Element: ${issue.location.selector || 'Unknown'}
        
        Please explain:
        1. What exactly is wrong
        2. Why this is a problem
        3. How it affects user experience
        4. What should be the expected behavior
        5. Suggested fix approach
        
        Provide a clear, technical explanation that developers can understand.
      `;
      
      const agent = new Agent(explanationTask, {
        headless: true,
        maxSteps: 3,
        llmProvider: 'anthropic',
        apiKey: this.claudeApiKey
      });
      
      await agent.initialize();
      const result = await agent.run();
      
      const agentState = agent.getState();
      const explanation = agentState.fileSystem.get('/explanation.txt') ||
                         agentState.memory.get('issue_explanation') ||
                         `Issue: ${issue.description}\n\nThis ${issue.severity} severity issue affects the visual presentation of the page and should be addressed to maintain good user experience.`;
      
      await agent.cleanup();
      
      return typeof explanation === 'string' ? explanation : JSON.stringify(explanation);
      
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.ANALYSIS,
        userAction: 'Explain visual issue',
        metadata: { 
          issueId: issue.id, 
          issueType: issue.type,
          severity: issue.severity 
        },
        recoverable: true,
        skipGitHubPost: true
      });
      return `Issue: ${issue.description}\n\nThis ${issue.severity} severity issue requires manual review to determine the best fix approach.`;
    }
  }

  /**
   * Set codebase context (for compatibility)
   */
  setCodebaseContext(context: any): void {
    // Browser-agent doesn't need explicit context setting
    // as it builds context dynamically
  }
}