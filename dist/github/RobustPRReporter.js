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
exports.RobustPRReporter = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
class RobustPRReporter {
    constructor(githubToken) {
        this.retryCount = 3;
        this.retryDelay = 2000;
        this.octokit = (0, github_1.getOctokit)(githubToken);
        const context = require('@actions/github').context;
        this.owner = context.repo.owner;
        this.repo = context.repo.repo;
        this.prNumber = context.payload.pull_request?.number;
        if (!this.prNumber) {
            throw new Error('No pull request number found in context');
        }
    }
    async postResults(result, storageConsoleUrl) {
        core.info(`🚀 Attempting to post results to PR #${this.prNumber}...`);
        const strategies = [
            () => this.postViaIssuesAPI(result, storageConsoleUrl),
            () => this.postViaCheckRun(result, storageConsoleUrl),
            () => this.postMinimalComment(result),
            () => this.postAsWorkflowSummary(result)
        ];
        let lastError = null;
        for (const [index, strategy] of strategies.entries()) {
            try {
                core.info(`Trying strategy ${index + 1}...`);
                await this.retryWithBackoff(strategy);
                core.info(`✅ Successfully posted results using strategy ${index + 1}`);
                return;
            }
            catch (error) {
                lastError = error;
                core.warning(`Strategy ${index + 1} failed: ${error}`);
            }
        }
        core.error(`Failed to post PR comment after all strategies: ${lastError}`);
        core.warning('Results will be available in workflow logs and outputs');
    }
    async postViaIssuesAPI(result, storageConsoleUrl) {
        const comment = this.generateFullComment(result, storageConsoleUrl);
        const existingComment = await this.findExistingComment();
        if (existingComment) {
            await this.octokit.rest.issues.updateComment({
                owner: this.owner,
                repo: this.repo,
                comment_id: existingComment.id,
                body: comment
            });
        }
        else {
            await this.octokit.rest.issues.createComment({
                owner: this.owner,
                repo: this.repo,
                issue_number: this.prNumber,
                body: comment
            });
        }
    }
    async postViaCheckRun(result, storageConsoleUrl) {
        const summary = this.generateCheckRunSummary(result, storageConsoleUrl);
        const checkRuns = await this.octokit.rest.checks.listForRef({
            owner: this.owner,
            repo: this.repo,
            ref: require('@actions/github').context.sha,
            check_name: 'YoFix Visual Testing'
        });
        if (checkRuns.data.check_runs.length > 0) {
            await this.octokit.rest.checks.update({
                owner: this.owner,
                repo: this.repo,
                check_run_id: checkRuns.data.check_runs[0].id,
                status: 'completed',
                conclusion: result.status === 'success' ? 'success' : 'failure',
                output: {
                    title: 'Visual Testing Results',
                    summary: summary
                }
            });
        }
        else {
            await this.octokit.rest.checks.create({
                owner: this.owner,
                repo: this.repo,
                name: 'YoFix Visual Testing',
                head_sha: require('@actions/github').context.sha,
                status: 'completed',
                conclusion: result.status === 'success' ? 'success' : 'failure',
                output: {
                    title: 'Visual Testing Results',
                    summary: summary
                }
            });
        }
    }
    async postMinimalComment(result) {
        const minimalComment = `## Visual Testing Results

**Status**: ${result.status} | **Tests**: ${result.passedTests}/${result.totalTests} passed

View full results in the [workflow logs](${this.getWorkflowUrl()})`;
        await this.octokit.rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: this.prNumber,
            body: minimalComment
        });
    }
    async postAsWorkflowSummary(result) {
        const summary = this.generateWorkflowSummary(result);
        await core.summary
            .addHeading('YoFix Visual Testing Results')
            .addRaw(summary)
            .write();
        const comment = `## Visual Testing Complete

Results have been posted to the [workflow summary](${this.getWorkflowUrl()})`;
        await this.octokit.rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: this.prNumber,
            body: comment
        });
    }
    async retryWithBackoff(fn) {
        let lastError = null;
        for (let i = 0; i < this.retryCount; i++) {
            try {
                await fn();
                return;
            }
            catch (error) {
                lastError = error;
                const delay = this.retryDelay * Math.pow(2, i);
                core.info(`Retry ${i + 1}/${this.retryCount} after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
    async findExistingComment() {
        try {
            const comments = await this.octokit.rest.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: this.prNumber,
                per_page: 100
            });
            const existingComment = comments.data.find(comment => comment.body?.includes('Runtime PR Verification') ||
                comment.body?.includes('Visual Testing Results'));
            return existingComment ? { id: existingComment.id } : null;
        }
        catch (error) {
            return null;
        }
    }
    generateFullComment(result, storageConsoleUrl) {
        const PRReporter = require('./PRReporter').PRReporter;
        const reporter = new PRReporter('dummy-token');
        return reporter['generateCommentBody'](result, storageConsoleUrl);
    }
    generateCheckRunSummary(result, storageConsoleUrl) {
        let summary = `## Test Results: ${result.passedTests}/${result.totalTests} passed\n\n`;
        if (result.failedTests > 0) {
            summary += `### Failed Tests\n\n`;
            for (const test of result.testResults.filter(t => t.status === 'failed')) {
                summary += `- **${test.testName}**: ${test.errors.join(', ')}\n`;
            }
            summary += '\n';
        }
        if (storageConsoleUrl) {
            summary += `### Screenshots\n\nView all screenshots in [Firebase Console](${storageConsoleUrl})\n\n`;
        }
        return summary;
    }
    generateWorkflowSummary(result) {
        return `
### Status: ${result.status}

| Metric | Value |
|--------|-------|
| Total Tests | ${result.totalTests} |
| Passed | ${result.passedTests} |
| Failed | ${result.failedTests} |
| Duration | ${(result.duration / 1000).toFixed(2)}s |

### Test Details

${result.testResults.map(test => `- ${test.status === 'passed' ? '✅' : '❌'} **${test.testName}** (${test.duration}ms)`).join('\n')}
`;
    }
    getWorkflowUrl() {
        const context = require('@actions/github').context;
        const runId = process.env.GITHUB_RUN_ID || context.runId;
        return `https://github.com/${this.owner}/${this.repo}/actions/runs/${runId}`;
    }
}
exports.RobustPRReporter = RobustPRReporter;
