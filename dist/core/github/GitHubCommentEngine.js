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
exports.GitHubCommentEngine = void 0;
exports.getGitHubCommentEngine = getGitHubCommentEngine;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
class GitHubCommentEngine {
    constructor(githubToken) {
        this.threadCache = new Map();
        this.errorCount = 0;
        this.errorSummary = [];
        this.octokit = github.getOctokit(githubToken);
        this.context = github.context;
        this.owner = this.context.repo.owner;
        this.repo = this.context.repo.repo;
        this.prNumber = this.context.payload.pull_request?.number ||
            this.context.payload.issue?.number ||
            parseInt(process.env.PR_NUMBER || '0');
    }
    async postComment(message, options = {}) {
        try {
            if (this.prNumber === 0) {
                core.warning('No PR number found, cannot post comment');
                return null;
            }
            let body = message;
            if (options.inReplyTo) {
                const replyUrl = `${this.context.payload.repository?.html_url}/pull/${this.prNumber}#issuecomment-${options.inReplyTo}`;
                body = `> In reply to [this comment](${replyUrl})\n\n${message}`;
            }
            if (options.signature) {
                body = `${body}\n\n<!-- ${options.signature} -->`;
            }
            if (options.isError) {
                body = this.formatErrorMessage(body);
            }
            if (options.isProgress) {
                body = this.formatProgressMessage(body);
            }
            let commentId;
            if (options.updateExisting && options.signature) {
                const existingComment = await this.findCommentBySignature(options.signature);
                if (existingComment) {
                    await this.octokit.rest.issues.updateComment({
                        owner: this.owner,
                        repo: this.repo,
                        comment_id: existingComment.id,
                        body
                    });
                    commentId = existingComment.id;
                    core.info(`Updated existing comment #${commentId}`);
                }
                else {
                    const response = await this.octokit.rest.issues.createComment({
                        owner: this.owner,
                        repo: this.repo,
                        issue_number: this.prNumber,
                        body
                    });
                    commentId = response.data.id;
                    core.info(`Created new comment #${commentId}`);
                }
            }
            else {
                const response = await this.octokit.rest.issues.createComment({
                    owner: this.owner,
                    repo: this.repo,
                    issue_number: this.prNumber,
                    body
                });
                commentId = response.data.id;
                core.info(`Created new comment #${commentId}`);
            }
            if (options.reactions && options.reactions.length > 0) {
                await this.addReactions(commentId, options.reactions);
            }
            if (options.threadId) {
                this.threadCache.set(options.threadId, commentId);
            }
            return commentId;
        }
        catch (error) {
            core.error(`Failed to post comment: ${error}`);
            return null;
        }
    }
    async postError(error, context) {
        try {
            this.errorCount++;
            const errorMessage = error instanceof Error ? error.message : error;
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.errorSummary.push({
                timestamp: new Date(),
                error: errorMessage,
                location: context?.location
            });
            let message = `### ❌ YoFix Error #${this.errorCount}\n\n`;
            if (context?.userAction) {
                message += `**Action**: ${context.userAction}\n`;
            }
            if (context?.location) {
                message += `**Location**: \`${context.location}\`\n`;
            }
            message += `**Error**: ${errorMessage}\n`;
            if (context?.metadata) {
                message += '\n**Context**:\n```json\n' + JSON.stringify(context.metadata, null, 2) + '\n```\n';
            }
            if (context?.includeStackTrace && errorStack) {
                message += '\n<details>\n<summary>Stack Trace</summary>\n\n```\n' + errorStack + '\n```\n</details>\n';
            }
            const tips = context?.tips || this.generateTroubleshootingTips(errorMessage);
            if (tips.length > 0) {
                message += '\n#### 💡 Troubleshooting Tips:\n' + tips.map(tip => `- ${tip}`).join('\n');
            }
            message += '\n\n---\n';
            message += '📚 [Documentation](https://github.com/yofix/yofix#troubleshooting) | ';
            message += '🐛 [Report Issue](https://github.com/yofix/yofix/issues/new) | ';
            message += '💬 [Get Help](https://github.com/yofix/yofix/discussions)';
            await this.postComment(message, {
                isError: true,
                signature: 'yofix-error',
                updateExisting: false
            });
        }
        catch (postError) {
            core.error(`Failed to post error to GitHub: ${postError}`);
            core.error(`Original error: ${error}`);
        }
    }
    async startThread(threadId, message, options = {}) {
        const commentId = await this.postComment(message, {
            ...options,
            threadId,
            signature: `yofix-thread-${threadId}`
        });
        if (commentId) {
            this.threadCache.set(threadId, commentId);
        }
        return commentId;
    }
    async replyToThread(threadId, message, options = {}) {
        const parentCommentId = this.threadCache.get(threadId);
        if (!parentCommentId) {
            core.warning(`Thread ${threadId} not found, creating new comment`);
            return this.postComment(message, options);
        }
        return this.postComment(message, {
            ...options,
            inReplyTo: parentCommentId
        });
    }
    async updateThread(threadId, message, options = {}) {
        await this.postComment(message, {
            ...options,
            updateExisting: true,
            signature: `yofix-thread-${threadId}`
        });
    }
    async postProgress(taskId, message, options = {}) {
        await this.postComment(message, {
            ...options,
            updateExisting: true,
            signature: `yofix-progress-${taskId}`,
            isProgress: true
        });
    }
    async addReactions(commentId, reactions) {
        if (!reactions)
            return;
        for (const reaction of reactions) {
            try {
                await this.octokit.rest.reactions.createForIssueComment({
                    owner: this.owner,
                    repo: this.repo,
                    comment_id: commentId,
                    content: reaction
                });
            }
            catch (error) {
                core.warning(`Failed to add reaction ${reaction}: ${error}`);
            }
        }
    }
    async reactToComment(commentId, reaction) {
        try {
            await this.octokit.rest.reactions.createForIssueComment({
                owner: this.owner,
                repo: this.repo,
                comment_id: commentId,
                content: reaction
            });
        }
        catch (error) {
            core.warning(`Failed to react to comment: ${error}`);
        }
    }
    async postErrorSummary() {
        if (this.errorSummary.length === 0)
            return;
        let message = `## 📊 Error Summary\n\n`;
        message += `Total errors encountered: **${this.errorCount}**\n\n`;
        message += '| Time | Error | Location |\n';
        message += '|------|-------|----------|\n';
        for (const error of this.errorSummary) {
            const time = error.timestamp.toLocaleTimeString();
            const errorMsg = error.error.length > 50 ? error.error.substring(0, 50) + '...' : error.error;
            const location = error.location || 'Unknown';
            message += `| ${time} | ${errorMsg} | ${location} |\n`;
        }
        await this.postComment(message, {
            signature: 'yofix-error-summary',
            updateExisting: true
        });
    }
    async findCommentBySignature(signature) {
        try {
            const comments = await this.octokit.rest.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: this.prNumber,
                per_page: 100
            });
            const signatureComment = `<!-- ${signature} -->`;
            const existingComment = comments.data.find(comment => comment.body?.includes(signatureComment));
            return existingComment ? { id: existingComment.id } : null;
        }
        catch (error) {
            core.warning(`Failed to find existing comment: ${error}`);
            return null;
        }
    }
    formatErrorMessage(message) {
        return `🚨 **Error** 🚨\n\n${message}`;
    }
    formatProgressMessage(message) {
        const timestamp = new Date().toLocaleTimeString();
        return `🔄 **Progress Update** (${timestamp})\n\n${message}`;
    }
    generateTroubleshootingTips(errorMessage) {
        const tips = [];
        if (errorMessage.includes('Claude API') || errorMessage.includes('authentication_error')) {
            tips.push('🔑 Verify your Claude API key is valid and has sufficient credits');
            tips.push('📋 Set `CLAUDE_API_KEY` secret in your repository settings');
        }
        if (errorMessage.includes('Firebase') || errorMessage.includes('storage')) {
            tips.push('🔥 Check your Firebase credentials and storage bucket');
            tips.push('📋 Ensure `firebase-credentials` is base64 encoded correctly');
            tips.push('💡 Alternative: Use `storage-provider: s3` for AWS S3 storage');
        }
        if (errorMessage.includes('preview-url') || errorMessage.includes('accessible')) {
            tips.push('🌐 The preview URL might not be accessible');
            tips.push('⏳ Wait for deployment to complete before running YoFix');
            tips.push('🔒 Check if the URL requires authentication');
        }
        if (errorMessage.includes('auth') || errorMessage.includes('login')) {
            tips.push('🔐 Check your test credentials');
            tips.push('🤖 Try `auth-mode: smart` if LLM auth fails');
            tips.push('📍 Verify `auth-login-url` points to the correct login page');
        }
        if (errorMessage.includes('timeout')) {
            tips.push('⏱️ Increase `test-timeout` value (e.g., `10m`)');
            tips.push('🌐 Check if the site is loading slowly');
            tips.push('🔄 Try running the test again');
        }
        if (errorMessage.includes('screenshot') || errorMessage.includes('visual')) {
            tips.push('🖼️ Ensure the page is fully loaded before screenshots');
            tips.push('📱 Check if the viewport size is appropriate');
            tips.push('🔄 Clear browser cache and retry');
        }
        if (tips.length === 0) {
            tips.push('📖 Check the [documentation](https://github.com/yofix/yofix#configuration)');
            tips.push('🐛 [Report an issue](https://github.com/yofix/yofix/issues) if the problem persists');
        }
        return tips;
    }
    async getThreadHistory(threadId) {
        const parentCommentId = this.threadCache.get(threadId);
        if (!parentCommentId)
            return [];
        try {
            const comments = await this.octokit.rest.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: this.prNumber
            });
            return comments.data.filter(comment => comment.body?.includes(`#issuecomment-${parentCommentId}`));
        }
        catch (error) {
            core.warning(`Failed to get thread history: ${error}`);
            return [];
        }
    }
}
exports.GitHubCommentEngine = GitHubCommentEngine;
let globalInstance = null;
function getGitHubCommentEngine(githubToken) {
    if (!globalInstance) {
        const token = githubToken || core.getInput('github-token', { required: true });
        globalInstance = new GitHubCommentEngine(token);
    }
    return globalInstance;
}
