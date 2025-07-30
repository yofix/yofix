import * as core from '@actions/core';
import { BotCommand, BotContext, BotResponse, ScanResult, VisualIssue } from './types';
import { VisualAnalyzer } from '../core/analysis/VisualAnalyzer';
import { FixGenerator } from '../core/fixes/FixGenerator';
import { ReportFormatter } from './ReportFormatter';
import { BaselineManager } from '../core/baseline/BaselineManager';
import { CodebaseContext } from '../context/types';
import { VisualIssueTestGenerator } from '../core/testing/VisualIssueTestGenerator';
import { Agent } from '../browser-agent/core/Agent';
import { RouteImpactAnalyzer } from '../core/analysis/RouteImpactAnalyzer';

/**
 * Handles execution of bot commands
 */
export class CommandHandler {
  private visualAnalyzer: VisualAnalyzer;
  private fixGenerator: FixGenerator;
  private reportFormatter: ReportFormatter;
  private baselineManager: BaselineManager;
  private browserAgent: Agent | null = null;
  private claudeApiKey: string;
  private githubToken: string;
  
  // In-memory cache for current PR analysis
  private currentScanResult: ScanResult | null = null;

  constructor(githubToken: string, claudeApiKey: string, codebaseContext?: CodebaseContext) {
    this.githubToken = githubToken;
    this.claudeApiKey = claudeApiKey;
    this.visualAnalyzer = new VisualAnalyzer(claudeApiKey, githubToken);
    this.fixGenerator = new FixGenerator(claudeApiKey, codebaseContext);
    this.reportFormatter = new ReportFormatter();
    this.baselineManager = new BaselineManager();
    // Browser agent is created on demand
  }

  /**
   * Execute a bot command
   */
  async execute(command: BotCommand, context: BotContext): Promise<BotResponse> {
    core.info(`Executing command: ${command.action} ${command.args}`);

    switch (command.action) {
      case 'scan':
        return await this.handleScan(command, context);
      
      case 'fix':
        return await this.handleFix(command, context);
      
      case 'apply':
        return await this.handleApply(command, context);
      
      case 'explain':
        return await this.handleExplain(command, context);
      
      case 'preview':
        return await this.handlePreview(command, context);
      
      case 'compare':
        return await this.handleCompare(command, context);
      
      case 'baseline':
        return await this.handleBaseline(command, context);
      
      case 'report':
        return await this.handleReport(command, context);
      
      case 'ignore':
        return await this.handleIgnore(command, context);
      
      case 'test':
        return await this.handleTest(command, context);
      
      case 'browser':
        return await this.handleBrowser(command, context);
      
      case 'impact':
        return await this.handleImpact(command, context);
      
      case 'help':
      default:
        return {
          success: true,
          message: this.getHelpMessage()
        };
    }
  }

  /**
   * Handle scan command
   */
  private async handleScan(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      // Determine what to scan
      const routes = command.targetRoute ? [command.targetRoute] : 'auto';
      const viewport = command.options.viewport || 'all';

      // Run visual analysis
      const scanResult = await this.visualAnalyzer.scan({
        prNumber: context.prNumber,
        routes,
        viewports: this.parseViewports(viewport),
        options: {
          ...command.options,
          previewUrl: context.previewUrl
        }
      });

      // Cache result for subsequent commands
      this.currentScanResult = scanResult;

      // Auto-generate test cases for detected issues
      if (scanResult.issues.length > 0) {
        const testGenerator = new VisualIssueTestGenerator();
        const tests = testGenerator.generateTestsFromIssues(scanResult.issues);
        scanResult.generatedTests = tests;
        
        core.info(`Generated ${tests.length} test cases for detected issues`);
      }
      
      // Format response
      const message = this.reportFormatter.formatScanResult(scanResult);

      return {
        success: true,
        message,
        data: scanResult
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Scan failed: ${error.message}`
      };
    }
  }

  /**
   * Handle fix command
   */
  private async handleFix(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      // Ensure we have scan results
      if (!this.currentScanResult) {
        return {
          success: false,
          message: '⚠️ Please run `@yofix scan` first to detect issues.'
        };
      }

      // Determine which issues to fix
      let issuesToFix: VisualIssue[];
      
      if (command.targetIssue) {
        const issue = this.currentScanResult.issues.find(i => i.id === command.targetIssue);
        if (!issue) {
          return {
            success: false,
            message: `❌ Issue #${command.targetIssue} not found.`
          };
        }
        issuesToFix = [issue];
      } else {
        issuesToFix = this.currentScanResult.issues;
      }

      // Generate fixes
      const fixResult = await this.fixGenerator.generateFixes(issuesToFix);
      
      // Format response
      const message = this.reportFormatter.formatFixResult(fixResult);

      return {
        success: true,
        message,
        data: fixResult
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Fix generation failed: ${error.message}`
      };
    }
  }

  /**
   * Handle apply command
   */
  private async handleApply(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      // This would create a commit with the fixes
      // For now, we'll return instructions
      
      return {
        success: true,
        message: `## 🔧 Applying Fixes

To apply the suggested fixes:

1. **Review the fixes** above
2. **Create a new branch**: \`git checkout -b yofix-visual-fixes\`
3. **Apply fixes manually** or use:
   \`\`\`bash
   npx yofix apply --pr ${context.prNumber}
   \`\`\`
4. **Commit and push**: 
   \`\`\`bash
   git add -A
   git commit -m "fix: apply YoFix visual corrections"
   git push origin yofix-visual-fixes
   \`\`\`

💡 In the future, YoFix will automatically create commits for you!`
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Apply failed: ${error.message}`
      };
    }
  }

  /**
   * Handle explain command
   */
  private async handleExplain(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      if (!command.targetIssue || !this.currentScanResult) {
        return {
          success: false,
          message: '⚠️ Please specify an issue number (e.g., `@yofix explain #3`)'
        };
      }

      const issue = this.currentScanResult.issues.find(i => i.id === command.targetIssue);
      if (!issue) {
        return {
          success: false,
          message: `❌ Issue #${command.targetIssue} not found.`
        };
      }

      const explanation = await this.visualAnalyzer.explainIssue(issue);
      const message = this.reportFormatter.formatExplanation(issue, explanation);

      return {
        success: true,
        message
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Explain failed: ${error.message}`
      };
    }
  }

  /**
   * Handle preview command
   */
  private async handlePreview(command: BotCommand, context: BotContext): Promise<BotResponse> {
    return {
      success: true,
      message: `## 👁️ Fix Preview

Preview functionality coming soon! This will show before/after comparisons of your fixes.

For now, review the fix code in the responses above.`
    };
  }

  /**
   * Handle compare command
   */
  private async handleCompare(command: BotCommand, context: BotContext): Promise<BotResponse> {
    const target = command.args || 'production';
    
    return {
      success: true,
      message: `## 🔄 Comparison with ${target}

Visual comparison feature coming soon! This will show side-by-side differences with ${target}.`
    };
  }

  /**
   * Handle baseline command
   */
  private async handleBaseline(command: BotCommand, context: BotContext): Promise<BotResponse> {
    if (!command.args.includes('update')) {
      return {
        success: false,
        message: '⚠️ Use `@yofix baseline update` to update the visual baseline.'
      };
    }

    try {
      // Get current scan results
      if (!this.currentScanResult) {
        return {
          success: false,
          message: '⚠️ Please run `@yofix scan` first to capture screenshots.'
        };
      }
      
      // Prepare screenshots for baseline update
      const screenshots: Array<{
        route: string;
        viewport: string;
        buffer: Buffer;
        metadata?: any;
      }> = [];
      
      // TODO: Get actual screenshot buffers from scan results
      // For now, we'll need to re-capture them
      core.warning('Baseline update needs screenshot buffer implementation');
      
      await this.baselineManager.updateBaseline({
        prNumber: context.prNumber,
        screenshots
      });
      
      return {
        success: true,
        message: `✅ Visual baseline updated successfully!

The current state has been saved as the new baseline for future comparisons.`
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Baseline update failed: ${error.message}`
      };
    }
  }

  /**
   * Handle report command
   */
  private async handleReport(command: BotCommand, context: BotContext): Promise<BotResponse> {
    if (!this.currentScanResult) {
      return {
        success: false,
        message: '⚠️ No scan results available. Run `@yofix scan` first.'
      };
    }

    const fullReport = this.reportFormatter.generateFullReport(this.currentScanResult);
    
    return {
      success: true,
      message: fullReport
    };
  }

  /**
   * Handle ignore command
   */
  private async handleIgnore(command: BotCommand, context: BotContext): Promise<BotResponse> {
    // This would add a label or comment to skip visual testing
    return {
      success: true,
      message: `✅ Visual testing disabled for this PR.

Add \`yofix:skip\` label removed. To re-enable, run \`@yofix scan\`.`
    };
  }

  /**
   * Parse viewport string into array
   */
  private parseViewports(viewport: string): string[] {
    const viewportMap: Record<string, string> = {
      'desktop': '1920x1080',
      'tablet': '768x1024',
      'mobile': '375x667',
      'all': '1920x1080,768x1024,375x667'
    };
    
    if (viewport === 'all') {
      return ['1920x1080', '768x1024', '375x667'];
    }
    
    // Check if it's a named viewport
    if (viewportMap[viewport]) {
      return [viewportMap[viewport]];
    }
    
    // Otherwise assume it's a dimension string like "1920x1080"
    return [viewport];
  }

  /**
   * Handle test command - generate Playwright tests
   */
  private async handleTest(command: BotCommand, context: BotContext): Promise<BotResponse> {
    if (!this.currentScanResult || this.currentScanResult.issues.length === 0) {
      return {
        success: false,
        message: '⚠️ No issues found. Run `@yofix scan` first to detect issues.'
      };
    }
    
    const testGenerator = new VisualIssueTestGenerator();
    const tests = testGenerator.generateTestsFromIssues(this.currentScanResult.issues);
    
    // Generate actual Playwright code
    const testCode = tests
      .slice(0, 3) // Show first 3 tests
      .map(test => testGenerator.generatePlaywrightCode(test))
      .join('\n\n');
    
    return {
      success: true,
      message: `## 🧪 Generated Playwright Tests

Generated ${tests.length} test cases from ${this.currentScanResult.issues.length} visual issues.

### Example Test:

\`\`\`typescript
${testCode}
\`\`\`

💾 To save all tests, run:
\`\`\`bash
npx yofix generate-tests --pr ${context.prNumber}
\`\`\``
    };
  }

  /**
   * Handle browser command - advanced automation
   */
  private async handleBrowser(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      const browserCommand = command.args;
      
      if (!browserCommand) {
        return {
          success: false,
          message: '⚠️ Please provide a browser command (e.g., `@yofix browser "click the login button"`)'
        };
      }

      // Create browser agent for the command
      this.browserAgent = new Agent(browserCommand, {
        headless: false,
        maxSteps: 10,
        llmProvider: 'anthropic',
        viewport: { width: 1920, height: 1080 }
      });

      process.env.ANTHROPIC_API_KEY = this.claudeApiKey;

      // Execute browser automation
      await this.browserAgent.initialize();
      const result = await this.browserAgent.run();
      
      // Clean up browser session after command
      await this.browserAgent.cleanup();
      this.browserAgent = null;

      return {
        success: result.success,
        message: result.success ? '✅ Browser command executed successfully' : `❌ Failed: ${result.error || 'Unknown error'}`,
        data: {
          steps: result.steps,
          finalUrl: result.finalUrl,
          duration: result.duration
        }
      };
    } catch (error) {
      // Ensure browser is closed on error
      if (this.browserAgent) {
        await this.browserAgent.cleanup();
        this.browserAgent = null;
      }
      
      return {
        success: false,
        message: `❌ Browser command failed: ${error.message}`
      };
    }
  }

  /**
   * Handle impact command - show route impact tree
   */
  private async handleImpact(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      const prNumber = context.prNumber;
      
      core.info(`Analyzing route impact for PR #${prNumber}...`);
      
      const impactAnalyzer = new RouteImpactAnalyzer(this.githubToken);
      const impactTree = await impactAnalyzer.analyzePRImpact(prNumber);
      
      const message = impactAnalyzer.formatImpactTree(impactTree);
      
      return {
        success: true,
        message
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Impact analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Get help message
   */
  private getHelpMessage(): string {
    return `## 🔧 YoFix Bot - Available Commands

### Scanning
- \`@yofix scan\` - Scan all routes
- \`@yofix scan /route\` - Scan specific route
- \`@yofix scan --viewport mobile\` - Scan specific viewport

### Fixing
- \`@yofix fix\` - Generate all fixes
- \`@yofix fix #3\` - Fix specific issue
- \`@yofix apply\` - Apply fixes

### Analysis
- \`@yofix explain #2\` - Explain an issue
- \`@yofix report\` - Full report

### Testing
- \`@yofix test\` - Generate Playwright tests

### Browser Automation (Beta)
- \`@yofix browser "command"\` - Execute browser commands
  - Example: \`@yofix browser "click the login button"\`
  - Example: \`@yofix browser "fill email with test@example.com"\`
  - Example: \`@yofix browser "navigate to /dashboard and take a screenshot"\`

### Analysis
- \`@yofix impact\` - Show route impact tree

### Other
- \`@yofix baseline update\` - Update baseline
- \`@yofix help\` - This message`;
  }
}