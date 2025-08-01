import * as core from '@actions/core';
import { Agent } from '../../browser-agent/core/Agent';
import { VisualIssue, CodeFix } from '../../bot/types';
import { TestTemplate, TestAction, TestAssertion } from '../../types';

/**
 * Visual Issue Test Generator - Powered by Browser Agent
 * 
 * Generates and executes tests from visual issues using browser-agent's
 * natural language capabilities instead of static Playwright templates.
 */
export class VisualIssueTestGenerator {
  private claudeApiKey: string;
  
  constructor(claudeApiKey: string = '') {
    this.claudeApiKey = claudeApiKey || process.env.CLAUDE_API_KEY || '';
  }

  /**
   * Generate and execute tests directly from visual issues using browser-agent
   */
  async generateAndExecuteTests(issues: VisualIssue[]): Promise<Array<{
    issue: VisualIssue;
    testResult: {
      success: boolean;
      duration: number;
      screenshots: Buffer[];
      error?: string;
    };
  }>> {
    core.info('🤖 Generating and executing tests with Browser Agent...');
    
    const results = [];
    
    for (const issue of issues) {
      const testResult = await this.runIssueTest(issue);
      results.push({ issue, testResult });
    }
    
    return results;
  }

  /**
   * Generate test cases from visual issues (legacy compatibility)
   */
  generateTestsFromIssues(issues: VisualIssue[]): TestTemplate[] {
    const tests: TestTemplate[] = [];
    
    // Group issues by route
    const issuesByRoute = this.groupIssuesByRoute(issues);
    
    for (const [route, routeIssues] of issuesByRoute) {
      tests.push(this.createVisualRegressionTest(route, routeIssues));
    }
    
    return tests;
  }

  /**
   * Generate tests that verify fixes work correctly
   */
  async generateAndExecuteFixVerificationTests(issues: VisualIssue[], fixes: CodeFix[]): Promise<Array<{
    issue: VisualIssue;
    fix: CodeFix;
    testResult: {
      success: boolean;
      verificationPassed: boolean;
      duration: number;
      screenshots: Buffer[];
      error?: string;
    };
  }>> {
    const results = [];
    
    for (const issue of issues) {
      const fix = fixes.find(f => f.issueId === issue.id);
      if (fix) {
        const testResult = await this.runFixVerificationTest(issue, fix);
        results.push({ issue, fix, testResult });
      }
    }
    
    return results;
  }

  /**
   * Run test for a specific visual issue using browser-agent
   */
  private async runIssueTest(issue: VisualIssue): Promise<{
    success: boolean;
    duration: number;
    screenshots: Buffer[];
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const testTask = this.buildIssueTestTask(issue);
      
      const agent = new Agent(testTask, {
        headless: true,
        maxSteps: 15,
        llmProvider: 'anthropic',
        apiKey: this.claudeApiKey,
        viewport: { width: 1920, height: 1080 }
      });
      
      await agent.initialize();
      const result = await agent.run();
      await agent.cleanup();
      
      return {
        success: result.success,
        duration: Date.now() - startTime,
        screenshots: result.screenshots || [],
        error: result.error
      };
      
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        screenshots: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run fix verification test using browser-agent
   */
  private async runFixVerificationTest(issue: VisualIssue, fix: CodeFix): Promise<{
    success: boolean;
    verificationPassed: boolean;
    duration: number;
    screenshots: Buffer[];
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const verificationTask = this.buildFixVerificationTask(issue, fix);
      
      const agent = new Agent(verificationTask, {
        headless: true,
        maxSteps: 20,
        llmProvider: 'anthropic',
        apiKey: this.claudeApiKey,
        viewport: { width: 1920, height: 1080 }
      });
      
      await agent.initialize();
      const result = await agent.run();
      
      // Check if fix verification passed
      const agentState = agent.getState();
      const verificationResult = agentState.memory.get('fix_verification_result');
      const verificationPassed = verificationResult === 'passed' || result.success;
      
      await agent.cleanup();
      
      return {
        success: result.success,
        verificationPassed,
        duration: Date.now() - startTime,
        screenshots: result.screenshots || [],
        error: result.error
      };
      
    } catch (error) {
      return {
        success: false,
        verificationPassed: false,
        duration: Date.now() - startTime,
        screenshots: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Build test task for a visual issue
   */
  private buildIssueTestTask(issue: VisualIssue): string {
    const tasks = [
      `Test for Visual Issue: ${issue.description}`,
      `Issue Type: ${issue.type}`,
      `Severity: ${issue.severity}`,
      `Route: ${issue.location.route}`,
      '',
      `1. Navigate to ${issue.location.route}`,
      '2. Wait for page to fully load',
      '3. Take a screenshot for comparison',
      ''
    ];

    // Add specific test steps based on issue type
    switch (issue.type) {
      case 'layout':
        tasks.push('4. Check for element overlaps using check_visual_issues');
        tasks.push('5. Verify proper element positioning');
        tasks.push('6. Test responsive behavior across viewports');
        break;
        
      case 'typography':
        tasks.push('4. Check for text overflow or truncation');
        tasks.push('5. Verify font rendering and readability');
        tasks.push('6. Test text scaling on different screen sizes');
        break;
        
      case 'visual':
        tasks.push('4. Run comprehensive visual analysis');
        tasks.push('5. Compare against expected visual baseline');
        tasks.push('6. Check for color contrast issues');
        break;
        
      case 'interaction':
        tasks.push('4. Test interactive elements (buttons, links, forms)');
        tasks.push('5. Verify hover and focus states');
        tasks.push('6. Check accessibility of interactive components');
        break;
        
      default:
        tasks.push('4. Run general visual analysis');
        tasks.push('5. Check for layout inconsistencies');
        tasks.push('6. Verify expected functionality');
    }
    
    tasks.push('');
    tasks.push('7. Document any issues found');
    tasks.push('8. Take additional screenshots of problem areas');
    tasks.push('9. Generate detailed test report');
    
    return tasks.join('\n');
  }

  /**
   * Build fix verification task
   */
  private buildFixVerificationTask(issue: VisualIssue, fix: CodeFix): string {
    return `
Fix Verification Test:

Original Issue: ${issue.description}
Fix Applied: ${fix.description}
Route: ${issue.location.route}

Test Steps:
1. Navigate to ${issue.location.route}
2. Wait for page to fully load
3. Take screenshot for baseline comparison
4. Verify the original issue has been resolved:
   - ${issue.description}
5. Check that the fix doesn't introduce new issues
6. Test the fix across different viewports if needed
7. Verify functionality still works as expected
8. Save verification result to /fix_verification_result as 'passed' or 'failed'
9. Take final screenshots showing the fixed state

Focus Areas:
- Ensure original issue is no longer present
- Verify no new visual regressions introduced
- Confirm functionality remains intact
- Test edge cases related to the fix
    `.trim();
  }

  /**
   * Group issues by route for batch testing
   */
  private groupIssuesByRoute(issues: VisualIssue[]): Map<string, VisualIssue[]> {
    const grouped = new Map<string, VisualIssue[]>();
    
    for (const issue of issues) {
      const route = issue.location.route || '/';
      if (!grouped.has(route)) {
        grouped.set(route, []);
      }
      grouped.get(route)!.push(issue);
    }
    
    return grouped;
  }

  /**
   * Create visual regression test template (legacy compatibility)
   */
  private createVisualRegressionTest(route: string, issues: VisualIssue[]): TestTemplate {
    const actions: TestAction[] = [
      {
        type: 'navigate',
        selector: '',
        value: route,
        description: `Navigate to ${route}`
      },
      {
        type: 'wait',
        timeout: 2000,
        description: 'Wait for page load'
      }
    ];

    const assertions: TestAssertion[] = [
      {
        type: 'visual-snapshot',
        target: 'page',
        description: 'Take visual snapshot for regression detection'
      }
    ];

    // Add specific assertions based on issue types
    const issueTypes = [...new Set(issues.map(i => i.type))];
    
    if (issueTypes.includes('layout')) {
      assertions.push({
        type: 'no-overlap',
        target: 'page',
        description: 'Verify no element overlaps'
      });
    }
    
    if (issueTypes.includes('typography')) {
      assertions.push({
        type: 'no-overflow',
        target: 'page',
        description: 'Verify no text overflow'
      });
    }

    return {
      id: `visual-regression-${route.replace(/\//g, '-')}`,
      name: `Visual Regression Test: ${route}`,
      type: 'route',
      selector: route,
      actions,
      assertions
    };
  }

  /**
   * Generate fix verification tests (legacy compatibility)
   */
  generateFixVerificationTests(issues: VisualIssue[], fixes: CodeFix[]): TestTemplate[] {
    const tests: TestTemplate[] = [];
    
    for (const issue of issues) {
      const fix = fixes.find(f => f.issueId === issue.id);
      if (fix) {
        tests.push(this.createFixVerificationTest(issue, fix));
      }
    }
    
    return tests;
  }

  /**
   * Create fix verification test template (legacy compatibility)
   */
  private createFixVerificationTest(issue: VisualIssue, fix: CodeFix): TestTemplate {
    return {
      id: `fix-verification-${issue.id}`,
      name: `Fix Verification: ${issue.description}`,
      type: 'component',
      selector: issue.location.selector || 'page',
      actions: [
        {
          type: 'navigate',
          value: issue.location.route || '/',
          description: `Navigate to ${issue.location.route || '/'}`
        },
        {
          type: 'wait',
          timeout: 2000,
          description: 'Wait for fix to render'
        }
      ],
      assertions: [
        {
          type: 'visual-snapshot',
          target: issue.location.selector || 'page',
          description: 'Verify fix applied correctly'
        }
      ]
    };
  }

  /**
   * Generate Playwright code from test template (legacy compatibility)
   */
  generatePlaywrightCode(test: TestTemplate): string {
    const imports = `
import { test, expect } from '@playwright/test';

test('${test.name}', async ({ page }) => {`;

    const actions = test.actions.map(action => {
      switch (action.type) {
        case 'navigate':
          return `  await page.goto('${action.value}');`;
        case 'wait':
          return `  await page.waitForTimeout(${action.timeout || 1000});`;
        case 'click':
          return `  await page.click('${action.selector}');`;
        case 'type':
          return `  await page.fill('${action.selector}', '${action.value}');`;
        default:
          return `  // ${action.description}`;
      }
    }).join('\n');

    const assertions = test.assertions.map(assertion => {
      switch (assertion.type) {
        case 'visual-snapshot':
          return `  await expect(page).toHaveScreenshot('${test.id}.png');`;
        case 'no-overlap':
          return `  // TODO: Add element overlap detection`;
        case 'no-overflow':
          return `  // TODO: Add text overflow detection`;
        default:
          return `  // ${assertion.description}`;
      }
    }).join('\n');

    return `${imports}
${actions}
${assertions}
});`;
  }
}