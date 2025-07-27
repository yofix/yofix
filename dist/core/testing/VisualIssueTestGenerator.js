"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualIssueTestGenerator = void 0;
class VisualIssueTestGenerator {
    generateTestsFromIssues(issues) {
        const tests = [];
        const issuesByRoute = this.groupIssuesByRoute(issues);
        for (const [route, routeIssues] of issuesByRoute) {
            tests.push(this.createVisualRegressionTest(route, routeIssues));
        }
        return tests;
    }
    generateFixVerificationTests(issues, fixes) {
        const tests = [];
        for (const issue of issues) {
            const fix = fixes.find(f => f.issueId === issue.id);
            if (fix) {
                tests.push(this.createFixVerificationTest(issue, fix));
            }
        }
        return tests;
    }
    createVisualRegressionTest(route, issues) {
        const actions = [
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
        const assertions = [];
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
            type: 'route',
            selector: 'body',
            actions,
            assertions,
            viewport: { width: 1920, height: 1080, name: 'desktop' }
        };
    }
    createFixVerificationTest(issue, fix) {
        const actions = [
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
        const assertions = [];
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
            type: 'route',
            selector: issue.location.selector || 'body',
            actions,
            assertions,
            viewport: { width: 1920, height: 1080, name: issue.affectedViewports[0] || 'desktop' }
        };
    }
    generatePlaywrightCode(template) {
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
    generateActionCode(action) {
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
    generateAssertionCode(assertion) {
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
    groupIssuesByRoute(issues) {
        const grouped = new Map();
        for (const issue of issues) {
            const route = issue.location.route;
            if (!grouped.has(route)) {
                grouped.set(route, []);
            }
            grouped.get(route).push(issue);
        }
        return grouped;
    }
    getAffectedViewports(issues) {
        const viewports = new Set();
        issues.forEach(issue => {
            issue.affectedViewports.forEach(vp => viewports.add(vp));
        });
        return Array.from(viewports).join(', ');
    }
    getHighestSeverity(issues) {
        const severities = ['critical', 'high', 'medium', 'low'];
        const issueSeverities = issues.map(i => i.severity);
        for (const severity of severities) {
            if (issueSeverities.includes(severity)) {
                return severity;
            }
        }
        return 'low';
    }
}
exports.VisualIssueTestGenerator = VisualIssueTestGenerator;
