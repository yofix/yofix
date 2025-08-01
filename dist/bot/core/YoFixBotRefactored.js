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
exports.BotFactory = exports.YoFixBotRefactored = exports.DefaultGitHubInteractor = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const ProgressReporter_1 = require("./ProgressReporter");
const CommandParser_1 = require("../CommandParser");
class DefaultGitHubInteractor {
    constructor(octokit) {
        this.octokit = octokit;
    }
    async addReaction(params) {
        await this.octokit.rest.reactions.createForIssueComment({
            ...params,
            content: params.content
        });
    }
    async createComment(params) {
        return await this.octokit.rest.issues.createComment(params);
    }
    async updateComment(params) {
        await this.octokit.rest.issues.updateComment(params);
    }
}
exports.DefaultGitHubInteractor = DefaultGitHubInteractor;
class YoFixBotRefactored {
    constructor(githubInteractor, commandRegistry, botUsername = 'yofix') {
        this.githubInteractor = githubInteractor;
        this.commandRegistry = commandRegistry;
        this.botUsername = botUsername;
        this.commandParser = new CommandParser_1.CommandParser();
    }
    async handleIssueComment(context) {
        const { issue, comment } = context.payload;
        if (!issue?.pull_request || !comment) {
            return;
        }
        if (!this.isBotMentioned(comment.body)) {
            return;
        }
        core.info(`YoFix bot mentioned in PR #${issue.number}`);
        try {
            const command = this.parseCommand(comment.body);
            if (!command) {
                await this.handleInvalidCommand(context, comment);
                return;
            }
            await this.executeCommand(command, context, comment);
        }
        catch (error) {
            await this.handleError(error, context, comment);
        }
    }
    isBotMentioned(body) {
        return body.toLowerCase().includes(`@${this.botUsername}`);
    }
    parseCommand(body) {
        return this.commandParser.parse(body);
    }
    async executeCommand(command, context, comment) {
        await this.acknowledge(context, comment);
        const handler = this.commandRegistry.getHandler(command);
        if (!handler) {
            await this.handleUnknownCommand(context, comment, command);
            return;
        }
        const progressComment = await this.createProgressComment(context, comment, `🔄 **Processing \`@yofix ${command.action}\`**\n\n⏳ Initializing...`);
        const progressReporter = this.createProgressReporter(context, progressComment.data.id);
        const botContext = {
            prNumber: context.payload.issue.number,
            repo: context.repo,
            comment: {
                id: comment.id,
                user: comment.user,
                body: comment.body
            },
            previewUrl: await this.getPreviewUrl(context.payload.issue.number)
        };
        try {
            const result = await handler.execute(command, botContext);
            await progressReporter.report(result.message);
        }
        catch (error) {
            await progressReporter.report(`❌ Error: ${error.message}\n\nTry \`@yofix help\` for available commands.`);
            throw error;
        }
    }
    async acknowledge(context, comment) {
        await this.githubInteractor.addReaction({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: comment.id,
            content: 'eyes'
        });
    }
    async createProgressComment(context, originalComment, initialMessage) {
        const body = `> In reply to [this comment](${originalComment.html_url})\n\n${initialMessage}`;
        return await this.githubInteractor.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.payload.issue.number,
            body
        });
    }
    createProgressReporter(context, commentId) {
        const updateComment = async (id, body) => {
            await this.githubInteractor.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: id,
                body
            });
        };
        return ProgressReporter_1.ProgressReporterFactory.createForGitHubComment(updateComment, commentId);
    }
    async handleInvalidCommand(context, comment) {
        const helpMessage = this.commandRegistry.getAllHandlers()
            .map(handler => handler.getHelpText())
            .join('\n');
        await this.githubInteractor.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.payload.issue.number,
            body: `## 🔧 YoFix Bot Commands\n\n${helpMessage}`
        });
    }
    async handleUnknownCommand(context, comment, command) {
        await this.githubInteractor.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.payload.issue.number,
            body: `❓ Unknown command: \`${command.action}\`\n\nTry \`@yofix help\` for available commands.`
        });
    }
    async handleError(error, context, comment) {
        core.error(`Bot error: ${error}`);
        await this.githubInteractor.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.payload.issue.number,
            body: `❌ YoFix encountered an error: ${error.message}\n\nTry \`@yofix help\` for available commands.`
        });
    }
    async getPreviewUrl(prNumber) {
        const envUrl = process.env.PREVIEW_URL || core.getInput('preview-url');
        if (envUrl) {
            return envUrl;
        }
        const projectId = process.env.FIREBASE_PROJECT_ID || core.getInput('firebase-project-id');
        if (projectId) {
            return `https://${projectId}--pr-${prNumber}.web.app`;
        }
        return undefined;
    }
}
exports.YoFixBotRefactored = YoFixBotRefactored;
class BotFactory {
    static create(githubToken, commandRegistry) {
        const octokit = github.getOctokit(githubToken);
        const githubInteractor = new DefaultGitHubInteractor(octokit);
        return new YoFixBotRefactored(githubInteractor, commandRegistry);
    }
}
exports.BotFactory = BotFactory;
