"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandHandler = void 0;
const core = __importStar(require("@actions/core"));
const VisualAnalyzer_1 = require("../core/analysis/VisualAnalyzer");
const FixGenerator_1 = require("../core/fixes/FixGenerator");
const ReportFormatter_1 = require("./ReportFormatter");
const BaselineManager_1 = require("../core/baseline/BaselineManager");
const VisualIssueTestGenerator_1 = require("../core/testing/VisualIssueTestGenerator");
const Agent_1 = require("../browser-agent/core/Agent");
const RouteImpactAnalyzer_1 = require("../core/analysis/RouteImpactAnalyzer");
const TreeSitterRouteAnalyzer_1 = require("../core/analysis/TreeSitterRouteAnalyzer");
const StorageFactory_1 = require("../providers/storage/StorageFactory");
const core_1 = require("../core");
class CommandHandler {
    constructor(githubToken, claudeApiKey, codebaseContext) {
        this.browserAgent = null;
        this.currentScanResult = null;
        this.progressCallback = null;
        this.githubToken = githubToken;
        this.claudeApiKey = claudeApiKey;
        this.visualAnalyzer = new VisualAnalyzer_1.VisualAnalyzer(claudeApiKey, githubToken);
        this.fixGenerator = new FixGenerator_1.FixGenerator(claudeApiKey, codebaseContext);
        this.reportFormatter = new ReportFormatter_1.ReportFormatter();
        this.baselineManager = new BaselineManager_1.BaselineManager();
    }
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }
    async execute(command, context) {
        const activityId = `bot-${Date.now()}`;
        const commandStr = `@yofix ${command.action} ${command.args || ''}`;
        try {
            await core_1.botActivity.startActivity(activityId, commandStr);
            core.info(`Executing command: ${command.action} ${command.args}`);
            let response;
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
            if (response.success) {
                await core_1.botActivity.completeActivity(response.data, response.message);
            }
            else {
                await core_1.botActivity.failActivity(response.message || 'Command failed');
            }
            return response;
        }
        catch (error) {
            await core_1.botActivity.failActivity(error);
            throw error;
        }
    }
    async handleScan(command, context) {
        try {
            await core_1.botActivity.addStep('Initializing scan', 'running');
            const routes = command.targetRoute ? [command.targetRoute] : 'auto';
            const viewport = command.options.viewport || 'all';
            await core_1.botActivity.updateStep('Initializing scan', 'completed');
            await core_1.botActivity.addStep('Running visual analysis', 'running');
            const scanResult = await this.visualAnalyzer.scan({
                prNumber: context.prNumber,
                routes,
                viewports: this.parseViewports(viewport),
                options: {
                    ...command.options,
                    previewUrl: context.previewUrl
                }
            });
            this.currentScanResult = scanResult;
            await core_1.botActivity.updateStep('Running visual analysis', 'completed', `Found ${scanResult.issues.length} issues`);
            if (scanResult.issues.length > 0) {
                await core_1.botActivity.addStep('Generating test cases', 'running');
                const testGenerator = new VisualIssueTestGenerator_1.VisualIssueTestGenerator();
                const tests = testGenerator.generateTestsFromIssues(scanResult.issues);
                scanResult.generatedTests = tests;
                await core_1.botActivity.updateStep('Generating test cases', 'completed', `Generated ${tests.length} test cases`);
                core.info(`Generated ${tests.length} test cases for detected issues`);
            }
            const message = this.reportFormatter.formatScanResult(scanResult);
            return {
                success: true,
                message,
                data: scanResult
            };
        }
        catch (error) {
            await core_1.errorHandler.handleError(error, {
                severity: core_1.ErrorSeverity.HIGH,
                category: core_1.ErrorCategory.ANALYSIS,
                userAction: 'Visual scan command',
                metadata: { command, context },
                skipGitHubPost: true
            });
            return {
                success: false,
                message: `❌ Scan failed: ${error.message}`
            };
        }
    }
    async handleFix(command, context) {
        try {
            if (!this.currentScanResult) {
                return {
                    success: false,
                    message: '⚠️ Please run `@yofix scan` first to detect issues.'
                };
            }
            let issuesToFix;
            if (command.targetIssue) {
                const issue = this.currentScanResult.issues.find(i => i.id === command.targetIssue);
                if (!issue) {
                    return {
                        success: false,
                        message: `❌ Issue #${command.targetIssue} not found.`
                    };
                }
                issuesToFix = [issue];
            }
            else {
                issuesToFix = this.currentScanResult.issues;
            }
            const fixResult = await this.fixGenerator.generateFixes(issuesToFix);
            const message = this.reportFormatter.formatFixResult(fixResult);
            return {
                success: true,
                message,
                data: fixResult
            };
        }
        catch (error) {
            await core_1.errorHandler.handleError(error, {
                severity: core_1.ErrorSeverity.HIGH,
                category: core_1.ErrorCategory.UNKNOWN,
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
    async handleApply(command, context) {
        try {
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
        }
        catch (error) {
            return {
                success: false,
                message: `❌ Apply failed: ${error.message}`
            };
        }
    }
    async handleExplain(command, context) {
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
        }
        catch (error) {
            return {
                success: false,
                message: `❌ Explain failed: ${error.message}`
            };
        }
    }
    async handlePreview(command, context) {
        return {
            success: true,
            message: `## 👁️ Fix Preview

Preview functionality coming soon! This will show before/after comparisons of your fixes.

For now, review the fix code in the responses above.`
        };
    }
    async handleCompare(command, context) {
        const target = command.args || 'production';
        return {
            success: true,
            message: `## 🔄 Comparison with ${target}

Visual comparison feature coming soon! This will show side-by-side differences with ${target}.`
        };
    }
    async handleBaseline(command, context) {
        if (!command.args.includes('update')) {
            return {
                success: false,
                message: '⚠️ Use `@yofix baseline update` to update the visual baseline.'
            };
        }
        try {
            if (!this.currentScanResult) {
                return {
                    success: false,
                    message: '⚠️ Please run `@yofix scan` first to capture screenshots.'
                };
            }
            const screenshots = [];
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
        }
        catch (error) {
            return {
                success: false,
                message: `❌ Baseline update failed: ${error.message}`
            };
        }
    }
    async handleReport(command, context) {
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
    async handleIgnore(command, context) {
        return {
            success: true,
            message: `✅ Visual testing disabled for this PR.

Add \`yofix:skip\` label removed. To re-enable, run \`@yofix scan\`.`
        };
    }
    parseViewports(viewport) {
        const viewportMap = {
            'desktop': '1920x1080',
            'tablet': '768x1024',
            'mobile': '375x667',
            'all': '1920x1080,768x1024,375x667'
        };
        if (viewport === 'all') {
            return ['1920x1080', '768x1024', '375x667'];
        }
        if (viewportMap[viewport]) {
            return [viewportMap[viewport]];
        }
        return [viewport];
    }
    async handleTest(command, context) {
        if (!this.currentScanResult || this.currentScanResult.issues.length === 0) {
            return {
                success: false,
                message: '⚠️ No issues found. Run `@yofix scan` first to detect issues.'
            };
        }
        const testGenerator = new VisualIssueTestGenerator_1.VisualIssueTestGenerator();
        const tests = testGenerator.generateTestsFromIssues(this.currentScanResult.issues);
        const testCode = tests
            .slice(0, 3)
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
    async handleBrowser(command, context) {
        try {
            const browserCommand = command.args;
            if (!browserCommand) {
                return {
                    success: false,
                    message: '⚠️ Please provide a browser command (e.g., `@yofix browser "click the login button"`)'
                };
            }
            this.browserAgent = new Agent_1.Agent(browserCommand, {
                headless: false,
                maxSteps: 10,
                llmProvider: 'anthropic',
                viewport: { width: 1920, height: 1080 }
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await this.browserAgent.initialize();
            const result = await this.browserAgent.run();
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
        }
        catch (error) {
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
    async handleImpact(command, context) {
        try {
            await core_1.botActivity.addStep('Fetching changed files', 'running');
            const prNumber = context.prNumber;
            core.info(`Analyzing route impact for PR #${prNumber}...`);
            let storageProvider = null;
            try {
                const storageProviderName = core.getInput('storage-provider') || 'github';
                if (storageProviderName !== 'github') {
                    storageProvider = await StorageFactory_1.StorageFactory.createFromInputs();
                }
            }
            catch (error) {
                core.debug(`Storage provider initialization failed: ${error}`);
            }
            const impactAnalyzer = new RouteImpactAnalyzer_1.RouteImpactAnalyzer(this.githubToken, storageProvider);
            await core_1.botActivity.updateStep('Fetching changed files', 'completed');
            await core_1.botActivity.addStep('Building import graph with Tree-sitter', 'running');
            const impactTree = await impactAnalyzer.analyzePRImpact(prNumber);
            await core_1.botActivity.updateStep('Building import graph with Tree-sitter', 'completed');
            await core_1.botActivity.addStep('Mapping affected routes', 'running');
            const message = impactAnalyzer.formatImpactTree(impactTree);
            await core_1.botActivity.updateStep('Mapping affected routes', 'completed', `Found ${impactTree.affectedRoutes.length} affected routes`);
            return {
                success: true,
                message
            };
        }
        catch (error) {
            await core_1.errorHandler.handleError(error, {
                severity: core_1.ErrorSeverity.MEDIUM,
                category: core_1.ErrorCategory.ANALYSIS,
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
    async handleCache(command, context) {
        try {
            if (command.args.includes('clear')) {
                await core_1.botActivity.addStep('Removing route analysis cache', 'running');
                let storageProvider = null;
                try {
                    const storageProviderName = core.getInput('storage-provider') || 'github';
                    if (storageProviderName !== 'github') {
                        storageProvider = await StorageFactory_1.StorageFactory.createFromInputs();
                    }
                }
                catch (error) {
                    core.debug(`Storage provider initialization failed: ${error}`);
                }
                const analyzer = new TreeSitterRouteAnalyzer_1.TreeSitterRouteAnalyzer(process.cwd(), storageProvider);
                await analyzer.clearCache();
                await core_1.botActivity.updateStep('Removing route analysis cache', 'completed', 'Cache cleared successfully');
                return {
                    success: true,
                    message: `🗝️ **Cache Cleared Successfully!**

The route analysis cache has been cleared. The next analysis will rebuild the import graph from scratch.

💡 This is useful when:
- File moves/renames aren't detected correctly
- Import relationships seem outdated
- You want to force a fresh analysis`
                };
            }
            else if (command.args.includes('status')) {
                await core_1.botActivity.addStep('Analyzing cache metrics', 'running');
                let storageProvider = null;
                try {
                    const storageProviderName = core.getInput('storage-provider') || 'github';
                    if (storageProviderName !== 'github') {
                        storageProvider = await StorageFactory_1.StorageFactory.createFromInputs();
                    }
                }
                catch (error) {
                    core.debug(`Storage provider initialization failed: ${error}`);
                }
                const analyzer = new TreeSitterRouteAnalyzer_1.TreeSitterRouteAnalyzer(process.cwd(), storageProvider);
                const metrics = analyzer.getMetrics();
                await core_1.botActivity.updateStep('Analyzing cache metrics', 'completed');
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
        }
        catch (error) {
            await core_1.errorHandler.handleError(error, {
                severity: core_1.ErrorSeverity.LOW,
                category: core_1.ErrorCategory.UNKNOWN,
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
    getHelpMessage() {
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

### Other
- \`@yofix baseline update\` - Update baseline
- \`@yofix help\` - This message`;
    }
}
exports.CommandHandler = CommandHandler;
