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
exports.YoFixBot = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const CommandParser_1 = require("./CommandParser");
const CommandHandler_1 = require("./CommandHandler");
const CodebaseAnalyzer_1 = require("../context/CodebaseAnalyzer");
const core_1 = require("../core");
class YoFixBot {
    constructor(githubToken, claudeApiKey) {
        this.botUsername = 'yofix';
        this.codebaseContext = null;
        this.commentEngine = (0, core_1.getGitHubCommentEngine)();
        this.octokit = github.getOctokit(githubToken);
        this.commandParser = new CommandParser_1.CommandParser();
        this.commandHandler = new CommandHandler_1.CommandHandler(githubToken, claudeApiKey);
        this.initializeCodebaseContext();
    }
    async initializeCodebaseContext() {
        try {
            const analyzer = new CodebaseAnalyzer_1.CodebaseAnalyzer();
            this.codebaseContext = await analyzer.analyzeRepository();
            const { config } = await Promise.resolve().then(() => __importStar(require('../core')));
            const githubToken = config.get('github-token', {
                defaultValue: process.env.YOFIX_GITHUB_TOKEN
            });
            const claudeApiKey = config.getSecret('claude-api-key');
            this.commandHandler = new CommandHandler_1.CommandHandler(githubToken, claudeApiKey, this.codebaseContext);
            core.info('✅ Codebase context initialized successfully');
        }
        catch (error) {
            await core_1.errorHandler.handleError(error, {
                severity: core_1.ErrorSeverity.LOW,
                category: core_1.ErrorCategory.CONFIGURATION,
                userAction: 'Initialize codebase context',
                recoverable: true,
                skipGitHubPost: true
            });
        }
    }
    async handleIssueComment(context) {
        const { issue, comment } = context.payload;
        if (!issue?.pull_request || !comment) {
            return;
        }
        const commentBody = comment.body.toLowerCase();
        if (!commentBody.includes(`@${this.botUsername}`)) {
            return;
        }
        core.info(`YoFix bot mentioned in PR #${issue.number}`);
        try {
            const command = this.commandParser.parse(comment.body);
            if (!command) {
                await core_1.botActivity.handleUnknownCommand(comment.body.replace(/@yofix\s*/i, ''));
                return;
            }
            await this.commentEngine.reactToComment(comment.id, 'eyes');
            const previewUrl = await this.getPreviewUrl(issue.number);
            const result = await this.commandHandler.execute(command, {
                prNumber: issue.number,
                repo: context.repo,
                comment: {
                    id: comment.id,
                    user: comment.user,
                    body: comment.body
                },
                previewUrl
            });
        }
        catch (error) {
            await core_1.errorHandler.handleError(error, {
                severity: core_1.ErrorSeverity.HIGH,
                category: core_1.ErrorCategory.UNKNOWN,
                userAction: `Bot command: ${comment.body}`,
                metadata: {
                    issueNumber: issue.number,
                    commentId: comment.id
                }
            });
        }
    }
    isBotComment(comment) {
        return comment.user?.login?.includes('bot') ||
            comment.user?.type === 'Bot';
    }
    async getPreviewUrl(prNumber) {
        const context = github.context;
        try {
            const envUrl = process.env.PREVIEW_URL || core.getInput('preview-url');
            if (envUrl) {
                return envUrl;
            }
            const { data: comments } = await this.octokit.rest.issues.listComments({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prNumber
            });
            for (const comment of comments) {
                const urlMatch = comment.body.match(/https:\/\/[^.]+--pr-\d+[^.]+\.web\.app/);
                if (urlMatch) {
                    return urlMatch[0];
                }
            }
            const projectId = process.env.FIREBASE_PROJECT_ID || core.getInput('firebase-project-id');
            if (projectId) {
                return `https://${projectId}--pr-${prNumber}.web.app`;
            }
        }
        catch (error) {
            await core_1.errorHandler.handleError(error, {
                severity: core_1.ErrorSeverity.LOW,
                category: core_1.ErrorCategory.CONFIGURATION,
                userAction: 'Get preview URL',
                recoverable: true,
                skipGitHubPost: true,
                metadata: { prNumber }
            });
        }
        return undefined;
    }
    static async createApp(appId, privateKey) {
        throw new Error('GitHub App mode not yet implemented');
    }
}
exports.YoFixBot = YoFixBot;
