import * as core from '@actions/core';
import { VisualIssue, CodeFix } from '../../bot/types';
import { TestTemplate, TestAction, TestAssertion } from '../../types';

/**
 * Generates Playwright tests from detected visual issues
 */
export class VisualIssueTestGenerator {
  /**
   * Generate test cases from visual issues
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
   * Create visual regression test for a route
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
        selector: '',
        value: '2000',
        description: 'Wait for animations to complete'
      }
    ];

    // Add specific checks for each issue type
    const assertions: TestAssertion[] = [];
    
    for (const issue of issues) {
      switch (issue.type) {
        case 'layout-shift':
          actions.push({
            type: 'hover',
            selector: issue.location.selector || 'body',
            value: '',
            description: 'Trigger hover state'
          });
          assertions.push({
            type: 'position-stable',
            target: issue.location.selector || 'body',
            selector: issue.location.selector || '',
            expected: 'stable',
            description: 'Element should not move on hover'
          });
          break;
          
        case 'text-overflow':
          assertions.push({
            type: 'no-overflow',
            target: issue.location.selector || 'body',
            selector: issue.location.selector || '',
            expected: 'contained',
            description: 'Text should not overflow container'
          });
          break;
          
        case 'element-overlap':
          assertions.push({
            type: 'no-overlap',
            target: issue.location.selector || 'body',
            selector: issue.location.selector || '',
            expected: 'separated',
            description: 'Elements should not overlap'
          });
          break;
          
        case 'responsive-breakage':
          // Test will handle multiple viewports
          assertions.push({
            type: 'visual-snapshot',
            target: issue.location.selector || 'body',
            selector: issue.location.selector || '',
            expected: 'intact',
            description: 'Layout should work on all viewports'
          });
          break;
      }
    }

    // Add visual snapshot assertion
    assertions.push({
      type: 'visual-snapshot',
      target: 'body',
      selector: '',
      expected: 'matches-baseline',
      description: 'Visual appearance matches baseline'
    });

    return {
      id: `visual-test-${route.replace(/\//g, '-')}`,
      name: `Visual Regression Test - ${route}`,
      type: 'route' as const,
      selector: 'body',
      actions,
      assertions,
      viewport: { width: 1920, height: 1080, name: 'desktop' } // TODO: Use actual affected viewport
    };
  }

  /**
   * Create test to verify a fix works
   */
  private createFixVerificationTest(issue: VisualIssue, fix: CodeFix): TestTemplate {
    const actions: TestAction[] = [
      {
        type: 'navigate',
        selector: '',
        value: issue.location.route,
        description: `Navigate to ${issue.location.route}`
      },
      {
        type: 'wait',
        selector: '',
        value: '2000',
        description: 'Wait for page load'
      }
    ];

    // Add issue-specific verification steps
    const assertions: TestAssertion[] = [];
    
    switch (issue.type) {
      case 'layout-shift':
        actions.push({
          type: 'measure-position',
          selector: issue.location.selector || '',
          value: 'before-interaction',
          description: 'Measure initial position'
        });
        actions.push({
          type: 'hover',
          selector: issue.location.selector || '',
          value: '',
          description: 'Trigger interaction'
        });
        actions.push({
          type: 'measure-position',
          selector: issue.location.selector || '',
          value: 'after-interaction',
          description: 'Measure position after interaction'
        });
        assertions.push({
          type: 'position-stable',
          target: issue.location.selector || 'body',
          selector: issue.location.selector || '',
          expected: 'no-movement',
          description: 'Position should remain stable'
        });
        break;
        
      case 'text-overflow':
        assertions.push({
          type: 'text-contained',
          target: issue.location.selector || 'body',
          selector: issue.location.selector || '',
          expected: 'within-bounds',
          description: 'Text should be properly contained'
        });
        break;
        
      case 'color-contrast':
        assertions.push({
          type: 'contrast-ratio',
          target: issue.location.selector || 'body',
          selector: issue.location.selector || '',
          expected: 'wcag-aa',
          description: 'Color contrast should meet WCAG AA standards'
        });
        break;
    }

    return {
      id: `fix-verify-${issue.id}`,
      name: `Fix Verification - Issue #${issue.id}`,
      type: 'route' as const,
      selector: issue.location.selector || 'body',
      actions,
      assertions,
      viewport: { width: 1920, height: 1080, name: issue.affectedViewports[0] || 'desktop' } // Test on first affected viewport
    };
  }

  /**
   * Generate Playwright test code
   */
  generatePlaywrightCode(template: TestTemplate): string {
    const viewport = Array.isArray(template.viewport) ? template.viewport[0] : template.viewport;
    
    return `import { test, expect } from '@playwright/test';

test.describe('${template.name}', () => {
  test('${template.name}', async ({ page }) => {
    // Set viewport
    await page.setViewportSize({ width: ${viewport.width}, height: ${viewport.height} });
    
    // Execute actions
${template.actions.map(action => this.generateActionCode(action)).join('\n')}
    
    // Verify assertions
${template.assertions.map(assertion => this.generateAssertionCode(assertion)).join('\n')}
  });
});`;
  }

  /**
   * Generate code for a test action
   */
  private generateActionCode(action: TestAction): string {
    switch (action.type) {
      case 'navigate':
        return `    await page.goto('${action.value}');`;
      case 'wait':
        return `    await page.waitForTimeout(${action.value});`;
      case 'hover':
        return `    await page.hover('${action.selector}');`;
      case 'click':
        return `    await page.click('${action.selector}');`;
      case 'type':
        return `    await page.fill('${action.selector}', '${action.value}');`;
      case 'measure-position':
        return `    const ${action.value} = await page.locator('${action.selector}').boundingBox();`;
      default:
        return `    // ${action.description}`;
    }
  }

  /**
   * Generate code for an assertion
   */
  private generateAssertionCode(assertion: TestAssertion): string {
    switch (assertion.type) {
      case 'visible':
        return `    await expect(page.locator('${assertion.selector}')).toBeVisible();`;
      case 'text':
        return `    await expect(page.locator('${assertion.selector}')).toHaveText('${assertion.expected}');`;
      case 'no-overflow':
        return `    const overflow = await page.evaluate(() => {
      const el = document.querySelector('${assertion.selector}');
      return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
    });
    expect(overflow).toBe(false);`;
      case 'position-stable':
        return `    expect(before-interaction).toEqual(after-interaction);`;
      case 'visual-snapshot':
        return `    await expect(page).toHaveScreenshot('${assertion.expected}.png');`;
      default:
        return `    // Verify: ${assertion.description}`;
    }
  }

  /**
   * Group issues by route
   */
  private groupIssuesByRoute(issues: VisualIssue[]): Map<string, VisualIssue[]> {
    const grouped = new Map<string, VisualIssue[]>();
    
    for (const issue of issues) {
      const route = issue.location.route;
      if (!grouped.has(route)) {
        grouped.set(route, []);
      }
      grouped.get(route)!.push(issue);
    }
    
    return grouped;
  }

  /**
   * Get all affected viewports
   */
  private getAffectedViewports(issues: VisualIssue[]): string {
    const viewports = new Set<string>();
    issues.forEach(issue => {
      issue.affectedViewports.forEach(vp => viewports.add(vp));
    });
    return Array.from(viewports).join(', ');
  }

  /**
   * Get highest severity from issues
   */
  private getHighestSeverity(issues: VisualIssue[]): string {
    const severities = ['critical', 'high', 'medium', 'low'];
    const issueSeverities = issues.map(i => i.severity);
    
    for (const severity of severities) {
      if (issueSeverities.includes(severity as any)) {
        return severity;
      }
    }
    
    return 'low';
  }
}