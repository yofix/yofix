import * as core from '@actions/core';
import { Agent } from '../../browser-agent/core/Agent';
import { TestTemplate, TestResult, Screenshot, Video, ConsoleMessage, FirebaseConfig, Viewport } from '../../types';
import { SmartAuthHandler } from '../../github/SmartAuthHandler';
import { buildFullUrl } from '../../utils/urlBuilder';

/**
 * Visual Runner - Powered by Browser Agent
 * 
 * Runs visual tests using browser-agent instead of complex Playwright orchestration.
 * This reduces complexity by ~80% while providing better reliability and self-healing.
 */
export class VisualRunner {
  private firebaseConfig: FirebaseConfig;
  private outputDir: string;
  private testTimeout: number;
  private authHandler: SmartAuthHandler | null = null;
  private claudeApiKey: string;

  constructor(firebaseConfig: FirebaseConfig, outputDir: string, testTimeoutMs: number = 300000, claudeApiKey: string = '') {
    this.firebaseConfig = firebaseConfig;
    this.outputDir = outputDir;
    this.testTimeout = testTimeoutMs;
    this.claudeApiKey = claudeApiKey || process.env.CLAUDE_API_KEY || '';
  }

  /**
   * Set authentication handler
   */
  setAuthHandler(authHandler: SmartAuthHandler): void {
    this.authHandler = authHandler;
  }

  /**
   * Run visual tests using browser-agent
   */
  async runTests(templates: TestTemplate[]): Promise<TestResult[]> {
    core.info('🤖 Running visual tests with Browser Agent...');
    
    const results: TestResult[] = [];
    
    for (const template of templates) {
      const result = await this.runSingleTest(template);
      results.push(result);
    }
    
    core.info(`✅ Completed ${results.length} visual tests`);
    return results;
  }

  /**
   * Run a single test template using browser-agent
   */
  private async runSingleTest(template: TestTemplate): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      core.info(`Running test: ${template.name}`);
      
      // Build comprehensive test task from template
      const testTask = this.buildTestTask(template);
      
      const agent = new Agent(testTask, {
        headless: true,
        maxSteps: template.actions.length + 10, // Extra steps for validation
        llmProvider: 'anthropic',
        viewport: template.viewport || { width: 1920, height: 1080 },
        apiKey: this.claudeApiKey
      });
      
      await agent.initialize();
      const result = await agent.run();
      
      // Extract test results from agent
      const agentState = agent.getState();
      const testErrors = agentState.memory.get('test_errors') as string[] || [];
      const screenshots = result.screenshots || [];
      
      await agent.cleanup();
      
      return {
        testId: template.id,
        testName: template.name,
        status: result.success && testErrors.length === 0 ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        screenshots: screenshots.map((buf, i) => ({
          name: `${template.id}-${i}.png`,
          path: `${this.outputDir}/${template.id}-${i}.png`,
          viewport: template.viewport || { width: 1920, height: 1080, name: 'desktop' },
          timestamp: Date.now()
        })),
        videos: [], // Browser-agent doesn't support video recording yet
        errors: testErrors.concat(result.error ? [result.error] : []),
        consoleMessages: [] // Browser-agent abstracts console messages
      };
      
    } catch (error) {
      core.error(`Test ${template.name} failed: ${error}`);
      
      return {
        testId: template.id,
        testName: template.name,
        status: 'failed',
        duration: Date.now() - startTime,
        screenshots: [],
        videos: [],
        errors: [error instanceof Error ? error.message : String(error)],
        consoleMessages: []
      };
    }
  }

  /**
   * Build natural language test task from template
   */
  private buildTestTask(template: TestTemplate): string {
    const tasks: string[] = [
      `Test: ${template.name}`,
      `Type: ${template.type}`,
      ''
    ];
    
    // Add authentication if needed
    if (this.authHandler) {
      tasks.push('1. Authenticate using smart_login if required');
    }
    
    // Convert template actions to natural language
    template.actions.forEach((action, index) => {
      const step = this.authHandler ? index + 2 : index + 1;
      
      switch (action.type) {
        case 'goto':
        case 'navigate':
          const targetUrl = buildFullUrl(this.firebaseConfig.previewUrl, action.value || action.selector || '/');
          tasks.push(`${step}. Navigate to ${targetUrl}`);
          break;
          
        case 'click':
          if (action.selector) {
            tasks.push(`${step}. Click on element matching selector: ${action.selector}`);
          } else {
            tasks.push(`${step}. Click on element containing text: "${action.value}"`);
          }
          break;
          
        case 'fill':
        case 'type':
          tasks.push(`${step}. Type "${action.value}" into input field: ${action.selector || action.target}`);
          break;
          
        case 'wait':
          tasks.push(`${step}. Wait ${action.timeout || 1000}ms for page to load`);
          break;
          
        case 'scroll':
          tasks.push(`${step}. Scroll the page to reveal more content`);
          break;
          
        case 'hover':
          tasks.push(`${step}. Hover over element: ${action.selector || action.target}`);
          break;
          
        default:
          tasks.push(`${step}. Perform ${action.type} action on ${action.selector || action.target}`);
      }
    });
    
    tasks.push('');
    tasks.push('Validation:');
    
    // Convert template assertions to validation steps
    template.assertions.forEach((assertion, index) => {
      const validationStep = `V${index + 1}`;
      
      switch (assertion.type) {
        case 'visible':
          tasks.push(`${validationStep}. Verify element is visible: ${assertion.selector || assertion.target}`);
          break;
          
        case 'text':
          tasks.push(`${validationStep}. Verify text "${assertion.expected}" appears in: ${assertion.selector || assertion.target}`);
          break;
          
        case 'url':
          tasks.push(`${validationStep}. Verify current URL contains: ${assertion.expected}`);
          break;
          
        case 'no-overlap':
          tasks.push(`${validationStep}. Verify no element overlaps detected on page`);
          break;
          
        case 'visual-snapshot':
          tasks.push(`${validationStep}. Take screenshot and verify visual consistency`);
          break;
          
        case 'no-overflow':
          tasks.push(`${validationStep}. Verify no horizontal overflow on page`);
          break;
          
        default:
          tasks.push(`${validationStep}. Verify ${assertion.type}: ${assertion.expected || assertion.description}`);
      }
    });
    
    tasks.push('');
    tasks.push('Error Handling:');
    tasks.push('- Save any errors encountered to /test_errors');
    tasks.push('- Take screenshots of any visual issues');
    tasks.push('- Continue with remaining validations even if one fails');
    
    return tasks.join('\n');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Browser-agent handles its own cleanup
    core.info('🧹 Visual runner cleanup completed');
  }

  /**
   * Initialize (for backward compatibility)
   */
  async initialize(): Promise<void> {
    core.info('🤖 Visual Runner initialized with Browser Agent');
  }
}