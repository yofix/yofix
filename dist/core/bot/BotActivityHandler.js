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
exports.botActivity = exports.BotActivityHandler = void 0;
const core = __importStar(require("@actions/core"));
const GitHubCommentEngine_1 = require("../github/GitHubCommentEngine");
const CentralizedErrorHandler_1 = require("../error/CentralizedErrorHandler");
class BotActivityHandler {
    constructor(githubToken) {
        this.activities = new Map();
        this.currentActivity = null;
        this.commentEngine = (0, GitHubCommentEngine_1.getGitHubCommentEngine)(githubToken);
    }
    async startActivity(id, command, initialMessage) {
        const activity = {
            id,
            command,
            status: 'pending',
            startTime: new Date(),
            steps: []
        };
        this.activities.set(id, activity);
        this.currentActivity = activity;
        const message = initialMessage || `🤖 **Processing \`${command}\`**\n\n⏳ Initializing...`;
        await this.commentEngine.startThread(id, message, {
            reactions: ['eyes']
        });
        activity.status = 'running';
    }
    async addStep(stepName, status = 'pending', message) {
        if (!this.currentActivity) {
            core.warning('No active bot activity');
            return;
        }
        const step = {
            name: stepName,
            status,
            message,
            timestamp: new Date()
        };
        this.currentActivity.steps.push(step);
        await this.updateProgress();
    }
    async updateStep(stepName, status, message) {
        if (!this.currentActivity)
            return;
        const step = this.currentActivity.steps.find(s => s.name === stepName);
        if (!step) {
            core.warning(`Step ${stepName} not found`);
            return;
        }
        const previousStatus = step.status;
        step.status = status;
        if (message)
            step.message = message;
        if (status === 'completed' || status === 'failed') {
            step.duration = Date.now() - step.timestamp.getTime();
        }
        await this.updateProgress();
    }
    async completeActivity(result, finalMessage) {
        if (!this.currentActivity)
            return;
        this.currentActivity.status = 'completed';
        this.currentActivity.endTime = new Date();
        this.currentActivity.result = result;
        const duration = this.currentActivity.endTime.getTime() - this.currentActivity.startTime.getTime();
        const durationStr = this.formatDuration(duration);
        let message = `✅ **Completed \`${this.currentActivity.command}\`**\n\n`;
        if (finalMessage) {
            message += finalMessage + '\n\n';
        }
        message += this.generateStepsSummary();
        message += `\n⏱️ Total time: ${durationStr}`;
        await this.commentEngine.updateThread(this.currentActivity.id, message, {
            reactions: ['+1', 'rocket']
        });
        this.currentActivity = null;
    }
    async failActivity(error, context) {
        if (!this.currentActivity)
            return;
        this.currentActivity.status = 'failed';
        this.currentActivity.endTime = new Date();
        this.currentActivity.error = error instanceof Error ? error : new Error(error);
        await CentralizedErrorHandler_1.errorHandler.handleError(this.currentActivity.error, {
            category: CentralizedErrorHandler_1.ErrorCategory.UNKNOWN,
            severity: CentralizedErrorHandler_1.ErrorSeverity.HIGH,
            userAction: `Bot command: ${this.currentActivity.command}`,
            metadata: context,
            skipGitHubPost: true
        });
        let message = `❌ **Failed \`${this.currentActivity.command}\`**\n\n`;
        message += `**Error**: ${this.currentActivity.error.message}\n\n`;
        message += this.generateStepsSummary();
        const tips = this.getBotCommandTips(this.currentActivity.command, this.currentActivity.error.message);
        if (tips.length > 0) {
            message += '\n### 💡 Suggestions:\n';
            message += tips.map(tip => `- ${tip}`).join('\n');
        }
        await this.commentEngine.updateThread(this.currentActivity.id, message, {
            reactions: ['confused', '-1']
        });
        this.currentActivity = null;
    }
    async postBotResponse(message, options) {
        const formattedMessage = options?.success !== false
            ? `✅ ${message}`
            : `❌ ${message}`;
        if (options?.threadId) {
            await this.commentEngine.replyToThread(options.threadId, formattedMessage, {
                reactions: options.reactions
            });
        }
        else {
            await this.commentEngine.postComment(formattedMessage, {
                reactions: options.reactions
            });
        }
    }
    async postHelpMessage(commands) {
        let message = '## 🔧 YoFix Bot Commands\n\n';
        for (const cmd of commands) {
            message += `### \`${cmd.command}\`\n`;
            message += `${cmd.description}\n`;
            if (cmd.examples && cmd.examples.length > 0) {
                message += '\n**Examples:**\n';
                message += cmd.examples.map(ex => `- \`${ex}\``).join('\n');
                message += '\n';
            }
            message += '\n';
        }
        message += '---\n';
        message += '💡 **Tips:**\n';
        message += '- All commands start with `@yofix`\n';
        message += '- Use `--help` with any command for more info\n';
        message += '- Commands can be chained with `&&`\n';
        await this.commentEngine.postComment(message, {
            reactions: ['heart']
        });
    }
    async handleUnknownCommand(command, suggestions) {
        let message = `❓ **Unknown command: \`${command}\`**\n\n`;
        if (suggestions && suggestions.length > 0) {
            message += 'Did you mean:\n';
            message += suggestions.map(s => `- \`@yofix ${s}\``).join('\n');
            message += '\n\n';
        }
        message += 'Use `@yofix help` to see available commands.';
        await this.commentEngine.postComment(message, {
            reactions: ['confused']
        });
    }
    async updateProgress() {
        if (!this.currentActivity)
            return;
        const message = this.generateProgressMessage();
        await this.commentEngine.updateThread(this.currentActivity.id, message);
    }
    generateProgressMessage() {
        if (!this.currentActivity)
            return '';
        let message = `🔄 **Processing \`${this.currentActivity.command}\`**\n\n`;
        for (const step of this.currentActivity.steps) {
            const icon = this.getStepIcon(step.status);
            const duration = step.duration ? ` (${this.formatDuration(step.duration)})` : '';
            message += `${icon} ${step.name}${duration}\n`;
            if (step.message) {
                message += `   ${step.message}\n`;
            }
        }
        const elapsed = Date.now() - this.currentActivity.startTime.getTime();
        message += `\n⏱️ Elapsed: ${this.formatDuration(elapsed)}`;
        return message;
    }
    generateStepsSummary() {
        if (!this.currentActivity)
            return '';
        let summary = '### Steps Summary\n';
        const completed = this.currentActivity.steps.filter(s => s.status === 'completed').length;
        const failed = this.currentActivity.steps.filter(s => s.status === 'failed').length;
        const skipped = this.currentActivity.steps.filter(s => s.status === 'skipped').length;
        const total = this.currentActivity.steps.length;
        summary += `- ✅ Completed: ${completed}/${total}\n`;
        if (failed > 0)
            summary += `- ❌ Failed: ${failed}\n`;
        if (skipped > 0)
            summary += `- ⏭️ Skipped: ${skipped}\n`;
        return summary + '\n';
    }
    getStepIcon(status) {
        switch (status) {
            case 'pending': return '⏳';
            case 'running': return '🔄';
            case 'completed': return '✅';
            case 'failed': return '❌';
            case 'skipped': return '⏭️';
            default: return '❓';
        }
    }
    formatDuration(ms) {
        if (ms < 1000)
            return `${ms}ms`;
        if (ms < 60000)
            return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
    getBotCommandTips(command, error) {
        const tips = [];
        if (command.includes('scan')) {
            tips.push('Ensure the preview URL is accessible');
            tips.push('Check if authentication is required');
            tips.push('Try specifying a specific route: `@yofix scan /dashboard`');
        }
        if (command.includes('fix')) {
            tips.push('Run `@yofix scan` first to detect issues');
            tips.push('Specify an issue number: `@yofix fix #3`');
        }
        if (command.includes('test')) {
            tips.push('Ensure test credentials are configured');
            tips.push('Check the login URL is correct');
            tips.push('Try a different auth mode');
        }
        if (error.includes('timeout')) {
            tips.push('The operation took too long - try again');
            tips.push('Check if the site is responding slowly');
        }
        if (error.includes('not found')) {
            tips.push('Check the spelling of your command');
            tips.push('Use `@yofix help` to see available options');
        }
        return tips;
    }
}
exports.BotActivityHandler = BotActivityHandler;
exports.botActivity = new BotActivityHandler();
