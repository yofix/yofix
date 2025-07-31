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
class YoFixBot {
    constructor(githubToken, claudeApiKey) {
        this.botUsername = 'yofix';
        this.codebaseContext = null;
        this.progressCommentId = null;
        this.octokit = github.getOctokit(githubToken);
        this.commandParser = new CommandParser_1.CommandParser();
        this.commandHandler = new CommandHandler_1.CommandHandler(githubToken, claudeApiKey);
        this.initializeCodebaseContext();
    }
    async initializeCodebaseContext() {
        try {
            const analyzer = new CodebaseAnalyzer_1.CodebaseAnalyzer();
            this.codebaseContext = await analyzer.analyzeRepository();
            const githubToken = core.getInput('github-token') || process.env.YOFIX_GITHUB_TOKEN || '';
            const claudeApiKey = process.env.CLAUDE_API_KEY || core.getInput('claude-api-key') || '';
            this.commandHandler = new CommandHandler_1.CommandHandler(githubToken, claudeApiKey, this.codebaseContext);
            core.info('✅ Codebase context initialized successfully');
        }
        catch (error) {
            core.warning(`Failed to initialize codebase context: ${error.message}`);
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
                await this.postComment(issue.number, this.getHelpMessage(), comment.id);
                return;
            }
            await this.octokit.rest.reactions.createForIssueComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: comment.id,
                content: 'eyes'
            });
            const progressComment = await this.postProgressComment(issue.number, `🔄 **Processing \`@yofix ${command.action}\`**\n\n⏳ Initializing...`, comment.id);
            this.progressCommentId = progressComment.data.id;
            const previewUrl = await this.getPreviewUrl(issue.number);
            const updateProgress = async (message) => {
                if (this.progressCommentId) {
                    await this.updateComment(this.progressCommentId, message);
                }
            };
            const commandHandlerWithProgress = this.commandHandler;
            commandHandlerWithProgress.setProgressCallback?.(updateProgress);
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
            if (this.progressCommentId) {
                await this.updateComment(this.progressCommentId, result.message);
            }
            else {
                await this.postComment(issue.number, result.message, comment.id);
            }
        }
        catch (error) {
            core.error(`Bot error: ${error}`);
            const errorMessage = `❌ YoFix encountered an error: ${error.message}\n\nTry \`@yofix help\` for available commands.`;
            if (this.progressCommentId) {
                await this.updateComment(this.progressCommentId, errorMessage);
            }
            else {
                await this.postComment(issue.number, errorMessage, comment.id);
            }
        }
    }
    async postComment(issueNumber, body, inReplyTo) {
        const context = github.context;
        const finalBody = inReplyTo
            ? `> In reply to [this comment](${context.payload.comment?.html_url || `#issuecomment-${inReplyTo}`})\n\n${body}`
            : body;
        await this.octokit.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issueNumber,
            body: finalBody
        });
    }
    async postProgressComment(issueNumber, body, inReplyTo) {
        const context = github.context;
        const finalBody = inReplyTo
            ? `> In reply to [this comment](${context.payload.comment?.html_url || `#issuecomment-${inReplyTo}`})\n\n${body}`
            : body;
        return await this.octokit.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issueNumber,
            body: finalBody
        });
    }
    async updateComment(commentId, body) {
        const context = github.context;
        await this.octokit.rest.issues.updateComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: commentId,
            body
        });
    }
    getHelpMessage() {
        return `## 🔧 YoFix Bot Commands

I can help you detect and fix visual issues in your PR. Here are my commands:

### 🔍 Scanning Commands
- \`@yofix scan\` - Scan all routes for visual issues
- \`@yofix scan /specific-route\` - Scan a specific route
- \`@yofix scan --viewport mobile\` - Scan with specific viewport

### 🔧 Fix Commands
- \`@yofix fix\` - Generate fixes for all detected issues
- \`@yofix fix #3\` - Generate fix for specific issue
- \`@yofix apply\` - Apply all suggested fixes
- \`@yofix apply #2\` - Apply specific fix

### 📊 Analysis Commands
- \`@yofix explain #1\` - Get detailed explanation of an issue
- \`@yofix compare production\` - Compare with production baseline
- \`@yofix report\` - Generate full analysis report
- \`@yofix impact\` - Show route impact tree from PR changes

### 🎯 Other Commands
- \`@yofix baseline update\` - Update visual baseline with current state
- \`@yofix preview\` - Preview fixes before applying
- \`@yofix ignore\` - Skip visual testing for this PR
- \`@yofix help\` - Show this help message

### 💡 Examples
\`\`\`
@yofix scan /dashboard --viewport tablet
@yofix fix #1
@yofix apply
\`\`\`

Need more help? Check our [documentation](https://yofix.dev/docs).`;
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
            core.warning(`Failed to get preview URL: ${error.message}`);
        }
        return undefined;
    }
    static async createApp(appId, privateKey) {
        throw new Error('GitHub App mode not yet implemented');
    }
}
exports.YoFixBot = YoFixBot;
