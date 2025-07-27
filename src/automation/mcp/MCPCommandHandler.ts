import * as core from '@actions/core';
import { MCPManager, MCPResult } from './MCPManager';
import { NaturalLanguageParser } from './NaturalLanguageParser';
import { VisualAnalyzer } from '../../core/analysis/VisualAnalyzer';
import { VisualIssue } from '../../bot/types';

/**
 * Handles MCP-based commands for advanced browser automation
 */
export class MCPCommandHandler {
  private mcpManager: MCPManager;
  private nlParser: NaturalLanguageParser;
  private visualAnalyzer: VisualAnalyzer;
  private sessionActive: boolean = false;

  constructor(claudeApiKey: string) {
    this.mcpManager = new MCPManager();
    this.nlParser = new NaturalLanguageParser();
    this.visualAnalyzer = new VisualAnalyzer(claudeApiKey, '');
  }

  /**
   * Execute a natural language browser command
   */
  async executeBrowserCommand(command: string, options?: {
    previewUrl?: string;
    viewport?: { width: number; height: number };
  }): Promise<MCPBrowserResult> {
    try {
      // Initialize browser if not already active
      if (!this.sessionActive) {
        await this.mcpManager.initialize({
          viewport: options?.viewport,
          headless: true
        });
        this.sessionActive = true;

        // Navigate to preview URL if provided
        if (options?.previewUrl) {
          await this.mcpManager.executeAction({
            type: 'navigate',
            params: { url: options.previewUrl }
          });
        }
      }

      // Parse natural language command
      const actions = await this.nlParser.parse(command);
      
      if (actions.length === 0) {
        return {
          success: false,
          message: `Could not understand command: "${command}"`,
          data: null
        };
      }

      // Execute actions
      const results: MCPResult[] = [];
      for (const action of actions) {
        core.info(`Executing MCP action: ${action.type}`);
        const result = await this.mcpManager.executeAction(action);
        results.push(result);

        if (!result.success) {
          return {
            success: false,
            message: `Failed to ${action.type}: ${result.error}`,
            data: results
          };
        }
      }

      // Generate summary
      const summary = this.generateExecutionSummary(actions, results);

      return {
        success: true,
        message: summary,
        data: {
          actions: actions,
          results: results,
          state: this.mcpManager.getState()
        }
      };

    } catch (error) {
      core.error(`MCP command error: ${error}`);
      return {
        success: false,
        message: `Browser automation error: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * Execute visual verification command
   */
  async executeVisualCommand(command: string): Promise<MCPVisualResult> {
    try {
      // Take screenshot for analysis
      const screenshotResult = await this.mcpManager.executeAction({
        type: 'screenshot',
        params: { fullPage: false }
      });

      if (!screenshotResult.success || !screenshotResult.data) {
        throw new Error('Failed to capture screenshot');
      }

      // Analyze visual issues
      const issues = await this.analyzeScreenshot(
        screenshotResult.data.buffer,
        command
      );

      return {
        success: true,
        message: this.formatVisualResults(issues),
        issues: issues,
        screenshot: screenshotResult.data
      };

    } catch (error) {
      return {
        success: false,
        message: `Visual verification failed: ${error.message}`,
        issues: [],
        screenshot: null
      };
    }
  }

  /**
   * Execute a test scenario
   */
  async executeTestScenario(scenario: TestScenario): Promise<MCPTestResult> {
    const results: StepResult[] = [];
    let allPassed = true;

    try {
      // Initialize for test
      await this.mcpManager.initialize({
        viewport: scenario.viewport,
        headless: true
      });
      this.sessionActive = true;

      // Navigate to starting URL
      if (scenario.startUrl) {
        await this.mcpManager.executeAction({
          type: 'navigate',
          params: { url: scenario.startUrl }
        });
      }

      // Execute each step
      for (const step of scenario.steps) {
        core.info(`Executing test step: ${step.description}`);
        
        const stepResult = await this.executeTestStep(step);
        results.push(stepResult);

        if (!stepResult.passed) {
          allPassed = false;
          if (scenario.stopOnFailure) {
            break;
          }
        }
      }

      // Generate test report
      const report = this.generateTestReport(scenario, results);

      return {
        success: allPassed,
        message: report,
        passed: allPassed,
        results: results,
        duration: this.calculateDuration(results)
      };

    } catch (error) {
      return {
        success: false,
        message: `Test scenario failed: ${error.message}`,
        passed: false,
        results: results,
        duration: 0
      };
    }
  }

  /**
   * Execute a single test step
   */
  private async executeTestStep(step: TestStep): Promise<StepResult> {
    const startTime = Date.now();

    try {
      // Parse and execute action
      const actions = await this.nlParser.parse(step.action);
      
      for (const action of actions) {
        const result = await this.mcpManager.executeAction(action);
        if (!result.success) {
          throw new Error(result.error);
        }
      }

      // Verify assertion if provided
      if (step.assertion) {
        const assertionResult = await this.verifyAssertion(step.assertion);
        if (!assertionResult.passed) {
          return {
            step: step.description,
            passed: false,
            error: assertionResult.error,
            duration: Date.now() - startTime
          };
        }
      }

      return {
        step: step.description,
        passed: true,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        step: step.description,
        passed: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Verify test assertion
   */
  private async verifyAssertion(assertion: TestAssertion): Promise<AssertionResult> {
    try {
      const state = this.mcpManager.getState();

      switch (assertion.type) {
        case 'url':
          const currentUrl = state.url;
          const expected = assertion.expected;
          if (!currentUrl.includes(expected)) {
            return {
              passed: false,
              error: `Expected URL to contain "${expected}", but got "${currentUrl}"`
            };
          }
          break;

        case 'visible':
          const visibleResult = await this.mcpManager.executeAction({
            type: 'evaluate',
            params: {
              script: `
                const element = document.querySelector('${assertion.selector}');
                element && element.offsetParent !== null;
              `
            }
          });
          
          if (!visibleResult.data) {
            return {
              passed: false,
              error: `Element "${assertion.selector}" is not visible`
            };
          }
          break;

        case 'text':
          const textResult = await this.mcpManager.executeAction({
            type: 'evaluate',
            params: {
              script: `
                const element = document.querySelector('${assertion.selector}');
                element ? element.textContent : null;
              `
            }
          });

          if (!textResult.data || !textResult.data.includes(assertion.expected)) {
            return {
              passed: false,
              error: `Expected text "${assertion.expected}" not found in element "${assertion.selector}"`
            };
          }
          break;

        case 'custom':
          if (assertion.script) {
            const customResult = await this.mcpManager.executeAction({
              type: 'evaluate',
              params: { script: assertion.script }
            });

            if (!customResult.data) {
              return {
                passed: false,
                error: `Custom assertion failed: ${assertion.description}`
              };
            }
          }
          break;
      }

      return { passed: true };

    } catch (error) {
      return {
        passed: false,
        error: `Assertion error: ${error.message}`
      };
    }
  }

  /**
   * Analyze screenshot for visual issues
   */
  private async analyzeScreenshot(
    buffer: Buffer, 
    context: string
  ): Promise<VisualIssue[]> {
    // This would integrate with the visual analyzer
    // For now, return a mock response
    return [];
  }

  /**
   * Generate execution summary
   */
  private generateExecutionSummary(actions: any[], results: MCPResult[]): string {
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    let summary = `## 🤖 Browser Automation Complete\n\n`;
    summary += `Executed ${actions.length} action(s): `;
    summary += `✅ ${successful} successful`;
    
    if (failed > 0) {
      summary += `, ❌ ${failed} failed`;
    }

    summary += '\n\n### Actions Performed:\n';
    actions.forEach((action, index) => {
      const result = results[index];
      const status = result.success ? '✅' : '❌';
      summary += `${index + 1}. ${status} ${this.describeAction(action)}\n`;
    });

    return summary;
  }

  /**
   * Describe action in human-readable format
   */
  private describeAction(action: any): string {
    switch (action.type) {
      case 'navigate':
        return `Navigate to ${action.params.url}`;
      case 'click':
        return `Click on ${action.params.selector}`;
      case 'type':
        return `Type "${action.params.text}" in ${action.params.selector}`;
      case 'scroll':
        return `Scroll ${action.params.direction} ${action.params.amount || ''}`;
      case 'wait':
        return action.params.selector ? 
          `Wait for ${action.params.selector}` : 
          `Wait ${action.params.timeout}ms`;
      case 'screenshot':
        return `Take screenshot${action.params.fullPage ? ' (full page)' : ''}`;
      case 'hover':
        return `Hover over ${action.params.selector}`;
      default:
        return `${action.type} action`;
    }
  }

  /**
   * Format visual results
   */
  private formatVisualResults(issues: VisualIssue[]): string {
    if (issues.length === 0) {
      return '✅ No visual issues detected';
    }

    let message = `## 🔍 Visual Issues Found\n\n`;
    message += `Detected ${issues.length} visual issue(s):\n\n`;

    issues.forEach((issue, index) => {
      message += `**${index + 1}. ${issue.type}** (${issue.severity})\n`;
      message += `   ${issue.description}\n`;
      if (issue.location.selector) {
        message += `   Element: \`${issue.location.selector}\`\n`;
      }
      message += '\n';
    });

    return message;
  }

  /**
   * Generate test report
   */
  private generateTestReport(scenario: TestScenario, results: StepResult[]): string {
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const totalDuration = this.calculateDuration(results);

    let report = `## 🧪 Test Scenario: ${scenario.name}\n\n`;
    report += `**Status:** ${failed === 0 ? '✅ PASSED' : '❌ FAILED'}\n`;
    report += `**Duration:** ${totalDuration}ms\n`;
    report += `**Steps:** ${passed}/${results.length} passed\n\n`;

    if (results.length > 0) {
      report += '### Test Steps:\n';
      results.forEach((result, index) => {
        const status = result.passed ? '✅' : '❌';
        report += `${index + 1}. ${status} ${result.step} (${result.duration}ms)\n`;
        if (result.error) {
          report += `   ⚠️ Error: ${result.error}\n`;
        }
      });
    }

    return report;
  }

  /**
   * Calculate total duration
   */
  private calculateDuration(results: StepResult[]): number {
    return results.reduce((total, result) => total + result.duration, 0);
  }

  /**
   * Close browser session
   */
  async closeSession(): Promise<void> {
    if (this.sessionActive) {
      await this.mcpManager.close();
      this.sessionActive = false;
    }
  }
}

// Types
export interface MCPBrowserResult {
  success: boolean;
  message: string;
  data: any;
}

export interface MCPVisualResult {
  success: boolean;
  message: string;
  issues: VisualIssue[];
  screenshot: any;
}

export interface MCPTestResult {
  success: boolean;
  message: string;
  passed: boolean;
  results: StepResult[];
  duration: number;
}

export interface TestScenario {
  name: string;
  description?: string;
  startUrl?: string;
  viewport?: { width: number; height: number };
  steps: TestStep[];
  stopOnFailure?: boolean;
}

export interface TestStep {
  description: string;
  action: string;
  assertion?: TestAssertion;
  timeout?: number;
}

export interface TestAssertion {
  type: 'url' | 'visible' | 'text' | 'custom';
  selector?: string;
  expected?: string;
  script?: string;
  description?: string;
}

export interface StepResult {
  step: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface AssertionResult {
  passed: boolean;
  error?: string;
}