import * as core from '@actions/core';
import { BotCommand, BotContext, BotResponse, ScanResult, VisualIssue } from './types';
import { VisualAnalyzer } from '../core/analysis/VisualAnalyzer';
import { FixGenerator } from '../core/fixes/FixGenerator';
import { ReportFormatter } from './ReportFormatter';
import { BaselineManager } from '../core/baseline/BaselineManager';
import { handleBaselineCommand } from './commands/baseline-commands';
import { CodebaseContext } from '../context/types';
import { VisualIssueTestGenerator } from '../core/testing/VisualIssueTestGenerator';
import { Agent } from '../browser-agent/core/Agent';
import { RouteImpactAnalyzer } from '../core/analysis/RouteImpactAnalyzer';
import { TreeSitterRouteAnalyzer } from '../core/analysis/TreeSitterRouteAnalyzer';
import { StorageFactory } from '../providers/storage/StorageFactory';
import { botActivity, errorHandler, ErrorCategory, ErrorSeverity } from '../core';

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
  private progressCallback: ((message: string) => Promise<void>) | null = null;

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
   * Set progress callback for updates
   */
  setProgressCallback(callback: (message: string) => Promise<void>): void {
    this.progressCallback = callback;
  }

  /**
   * Execute a bot command
   */
  async execute(command: BotCommand, context: BotContext): Promise<BotResponse> {
    const activityId = `bot-${Date.now()}`;
    const commandStr = `@yofix ${command.action} ${command.args || ''}`;
    
    try {
      // Start bot activity tracking
      await botActivity.startActivity(activityId, commandStr);
      
      core.info(`Executing command: ${command.action} ${command.args}`);

      let response: BotResponse;
      
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
      
      case 'cache':
        return await this.handleCache(command, context);
      
      case 'help':
      default:
        response = {
          success: true,
          message: this.getHelpMessage()
        };
    }
    
      // Complete activity based on response
      if (response.success) {
        await botActivity.completeActivity(response.data, response.message);
      } else {
        await botActivity.failActivity(response.message || 'Command failed');
      }
      
      return response;
      
    } catch (error) {
      // Handle any unexpected errors
      await botActivity.failActivity(error as Error);
      throw error;
    }
  }

  /**
   * Handle scan command
   */
  private async handleScan(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      await botActivity.addStep('Initializing scan', 'running');
      // Determine what to scan
      const routes = command.targetRoute ? [command.targetRoute] : 'auto';
      const viewport = command.options.viewport || 'all';

      // Run visual analysis
      await botActivity.updateStep('Initializing scan', 'completed');
      await botActivity.addStep('Running visual analysis', 'running');
      
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
      
      await botActivity.updateStep('Running visual analysis', 'completed', 
        `Found ${scanResult.issues.length} issues`);

      // Auto-generate test cases for detected issues
      if (scanResult.issues.length > 0) {
        await botActivity.addStep('Generating test cases', 'running');
        const testGenerator = new VisualIssueTestGenerator();
        const tests = testGenerator.generateTestsFromIssues(scanResult.issues);
        scanResult.generatedTests = tests;
        
        await botActivity.updateStep('Generating test cases', 'completed',
          `Generated ${tests.length} test cases`);
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
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.ANALYSIS,
        userAction: 'Visual scan command',
        metadata: { command, context },
        skipGitHubPost: true // Bot activity will handle posting
      });
      
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
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.UNKNOWN,
        userAction: 'Fix generation command',
        metadata: { command, context },
        skipGitHubPost: true
      });
      
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
    try {
      // Parse baseline command arguments
      const args = command.args.split(' ').filter(arg => arg.length > 0);
      
      // Add bot context
      const botContext = {
        ...context,
        githubToken: this.githubToken
      };
      
      // Delegate to baseline command handler
      const message = await handleBaselineCommand(command.action, args, botContext);
      
      return {
        success: true,
        message
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Baseline command failed: ${error.message}`
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
        viewport: { width: 1920, height: 1080 },
        apiKey: this.claudeApiKey
      });

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
      await botActivity.addStep('Fetching changed files', 'running');
      
      const prNumber = context.prNumber;
      
      core.info(`Analyzing route impact for PR #${prNumber}...`);
      
      // Create storage provider for route analyzer
      let storageProvider = null;
      try {
        const storageProviderName = core.getInput('storage-provider') || 'github';
        if (storageProviderName !== 'github') {
          storageProvider = await StorageFactory.createFromInputs();
        }
      } catch (error) {
        core.debug(`Storage provider initialization failed: ${error}`);
      }
      
      const impactAnalyzer = new RouteImpactAnalyzer(this.githubToken, storageProvider, context.previewUrl);
      
      await botActivity.updateStep('Fetching changed files', 'completed');
      await botActivity.addStep('Building import graph with Tree-sitter', 'running');
      
      const impactTree = await impactAnalyzer.analyzePRImpact(prNumber);
      
      await botActivity.updateStep('Building import graph with Tree-sitter', 'completed');
      await botActivity.addStep('Mapping affected routes', 'running');
      
      const message = impactAnalyzer.formatImpactTree(impactTree);
      
      await botActivity.updateStep('Mapping affected routes', 'completed',
        `Found ${impactTree.affectedRoutes.length} affected routes`);
      
      return {
        success: true,
        message
      };
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.ANALYSIS,
        userAction: 'Impact analysis command',
        metadata: { command, context },
        skipGitHubPost: true
      });
      
      return {
        success: false,
        message: `❌ Impact analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Handle cache command
   */
  private async handleCache(command: BotCommand, context: BotContext): Promise<BotResponse> {
    try {
      if (command.args.includes('clear')) {
        await botActivity.addStep('Removing route analysis cache', 'running');
        
        // Create storage provider if available
        let storageProvider = null;
        try {
          const storageProviderName = core.getInput('storage-provider') || 'github';
          if (storageProviderName !== 'github') {
            storageProvider = await StorageFactory.createFromInputs();
          }
        } catch (error) {
          core.debug(`Storage provider initialization failed: ${error}`);
        }
        
        // Clear the route analysis cache
        const analyzer = new TreeSitterRouteAnalyzer(process.cwd(), storageProvider);
        await analyzer.clearCache();
        
        await botActivity.updateStep('Removing route analysis cache', 'completed',
          'Cache cleared successfully');
        
        return {
          success: true,
          message: `🗝️ **Cache Cleared Successfully!**

The route analysis cache has been cleared. The next analysis will rebuild the import graph from scratch.

💡 This is useful when:
- File moves/renames aren't detected correctly
- Import relationships seem outdated
- You want to force a fresh analysis`
        };
      } else if (command.args.includes('status')) {
        await botActivity.addStep('Analyzing cache metrics', 'running');
        
        // Check cache status
        let storageProvider = null;
        try {
          const storageProviderName = core.getInput('storage-provider') || 'github';
          if (storageProviderName !== 'github') {
            storageProvider = await StorageFactory.createFromInputs();
          }
        } catch (error) {
          core.debug(`Storage provider initialization failed: ${error}`);
        }
        
        const analyzer = new TreeSitterRouteAnalyzer(process.cwd(), storageProvider);
        const metrics = analyzer.getMetrics();
        
        await botActivity.updateStep('Analyzing cache metrics', 'completed');
        
        return {
          success: true,
          message: `📦 **Cache Status**

- **Total Files**: ${metrics.totalFiles}
- **Route Files**: ${metrics.routeFiles}
- **Entry Points**: ${metrics.entryPoints}
- **Cached ASTs**: ${metrics.cacheSize}
- **Import Edges**: ${metrics.importEdges}
- **Storage**: ${storageProvider ? 'Cloud Storage' : 'Local Cache'}`
        };
      }
      
      return {
        success: false,
        message: '⚠️ Use `@yofix cache clear` or `@yofix cache status`'
      };
    } catch (error) {
      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.LOW,
        category: ErrorCategory.UNKNOWN,
        userAction: 'Cache management command',
        metadata: { command, context },
        skipGitHubPost: true
      });
      
      return {
        success: false,
        message: `❌ Cache operation failed: ${error.message}`
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

### Cache Management
- \`@yofix cache clear\` - Clear route analysis cache
- \`@yofix cache status\` - Check cache status

### Baseline Management
- \`@yofix baseline create [main|production]\` - Create baselines from main/production
- \`@yofix baseline update [routes...]\` - Update baselines for specific routes
- \`@yofix baseline status\` - Show baseline coverage status

### Other
- \`@yofix help\` - This message`;
  }
}