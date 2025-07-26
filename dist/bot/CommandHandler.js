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
const VisualAnalyzer_1 = require("../analysis/VisualAnalyzer");
const FixGenerator_1 = require("../fixes/FixGenerator");
const ReportFormatter_1 = require("./ReportFormatter");
const BaselineManager_1 = require("../core/BaselineManager");
class CommandHandler {
    constructor(githubToken, claudeApiKey, codebaseContext) {
        this.currentScanResult = null;
        this.visualAnalyzer = new VisualAnalyzer_1.VisualAnalyzer(claudeApiKey, githubToken);
        this.fixGenerator = new FixGenerator_1.FixGenerator(claudeApiKey, codebaseContext);
        this.reportFormatter = new ReportFormatter_1.ReportFormatter();
        this.baselineManager = new BaselineManager_1.BaselineManager();
    }
    async execute(command, context) {
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
            case 'help':
            default:
                return {
                    success: true,
                    message: this.getHelpMessage()
                };
        }
    }
    async handleScan(command, context) {
        try {
            const routes = command.targetRoute ? [command.targetRoute] : 'auto';
            const viewport = command.options.viewport || 'all';
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
            const message = this.reportFormatter.formatScanResult(scanResult);
            return {
                success: true,
                message,
                data: scanResult
            };
        }
        catch (error) {
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
            await this.baselineManager.updateBaseline(context.prNumber);
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

### Other
- \`@yofix baseline update\` - Update baseline
- \`@yofix help\` - This message`;
    }
}
exports.CommandHandler = CommandHandler;
