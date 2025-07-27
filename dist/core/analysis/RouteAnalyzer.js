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
exports.ClaudeRouteAnalyzer = void 0;
const sdk_1 = require("@anthropic-ai/sdk");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const CodebaseAnalyzer_1 = require("../../context/CodebaseAnalyzer");
class ClaudeRouteAnalyzer {
    constructor(claudeApiKey, githubToken) {
        this.context = null;
        this.claude = new sdk_1.Anthropic({
            apiKey: claudeApiKey,
        });
        this.octokit = github.getOctokit(githubToken);
        this.codebaseAnalyzer = new CodebaseAnalyzer_1.CodebaseAnalyzer();
    }
    async analyzeRoutes(prNumber) {
        try {
            if (!this.context) {
                core.info('Analyzing codebase structure...');
                this.context = await this.codebaseAnalyzer.analyzeRepository();
            }
            const prContext = await this.getPRContext(prNumber);
            const analysis = await this.analyzeWithClaude(prContext);
            return analysis;
        }
        catch (error) {
            core.warning(`Claude route analysis failed: ${error}`);
            return this.getFallbackAnalysis();
        }
    }
    async getPRContext(prNumber) {
        const { context } = github;
        const { data: pr } = await this.octokit.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber,
        });
        const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber,
        });
        const importantFiles = files
            .filter(file => this.isImportantFile(file.filename))
            .slice(0, 10);
        const fileContents = await Promise.all(importantFiles.map(async (file) => {
            try {
                const { data } = await this.octokit.rest.repos.getContent({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    path: file.filename,
                    ref: pr.head.sha,
                });
                if ('content' in data) {
                    return {
                        path: file.filename,
                        content: Buffer.from(data.content, 'base64').toString('utf-8'),
                        status: file.status,
                        changes: file.changes,
                    };
                }
                return null;
            }
            catch {
                return null;
            }
        }));
        return {
            pr: {
                title: pr.title,
                body: pr.body || '',
                baseBranch: pr.base.ref,
                headBranch: pr.head.ref,
            },
            changedFiles: files.map(f => ({
                filename: f.filename,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
                changes: f.changes,
            })),
            fileContents: fileContents.filter(Boolean),
        };
    }
    isImportantFile(filename) {
        const importantPatterns = [
            /pages\//,
            /app\//,
            /routes\//,
            /src\/.*\.(tsx?|jsx?)$/,
            /router/,
            /routing/,
            /navigation/,
            /components\/.*\.(tsx?|jsx?)$/,
            /next\.config/,
            /gatsby-config/,
            /vite\.config/,
            /webpack\.config/,
        ];
        return importantPatterns.some(pattern => pattern.test(filename));
    }
    async analyzeWithClaude(context) {
        const codebaseInfo = this.context ? `
## Codebase Information:
- **Framework:** ${this.context.framework}
- **Build Tool:** ${this.context.buildTool}
- **Style System:** ${this.context.styleSystem}
- **Total Routes:** ${this.context.routes.length}
- **Known Routes:** ${this.context.routes.slice(0, 10).map(r => r.path).join(', ')}${this.context.routes.length > 10 ? '...' : ''}
- **Components:** ${this.context.components.length} components found
` : '';
        const prompt = `
You are an expert frontend developer analyzing a Pull Request to determine which routes/pages need visual regression testing.

## PR Context:
**Title:** ${context.pr.title}
**Description:** ${context.pr.body}
${codebaseInfo}
## Changed Files:
${context.changedFiles.map(f => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join('\n')}

## File Contents (key files):
${context.fileContents.map(f => `
### ${f.path}
\`\`\`
${f.content.slice(0, 2000)}${f.content.length > 2000 ? '\n... (truncated)' : ''}
\`\`\`
`).join('\n')}

## Your Task:
Analyze this PR and determine:
1. Which routes/pages are likely affected by these changes
2. What type of changes these are (UI, logic, styling, etc.)
3. Your confidence level in the route detection

## Rules:
- Focus on routes that would have VISUAL changes
- Consider file-based routing (Next.js /pages/, /app/ directories)
- Consider component usage (which routes use changed components)
- Consider styling changes that might affect multiple routes
- Return actual route paths (e.g., "/", "/about", "/products/123")
- Limit to maximum 8 routes to keep testing efficient
- If it's a new page, include it
- If it's a deleted page, don't include it

## Response Format:
Respond with a JSON object:
{
  "routes": ["array", "of", "route", "paths"],
  "reasoning": "Brief explanation of why these routes were selected",
  "confidence": "high|medium|low",
  "changeType": "ui|logic|style|routing|component"
}

Example:
{
  "routes": ["/", "/products", "/checkout"],
  "reasoning": "Button component changed affects all pages that use it. Header styling modified affects layout on all routes.",
  "confidence": "high",
  "changeType": "component"
}
`;
        const response = await this.claude.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            messages: [{
                    role: 'user',
                    content: prompt,
                }],
        });
        try {
            const content = response.content[0];
            if (content.type === 'text') {
                const jsonMatch = content.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
            throw new Error('Could not parse Claude response');
        }
        catch (error) {
            core.warning(`Failed to parse Claude analysis: ${error}`);
            return this.getFallbackAnalysis();
        }
    }
    getFallbackAnalysis() {
        if (this.context && this.context.routes.length > 0) {
            const routes = this.context.routes
                .slice(0, 10)
                .map(r => r.path);
            return {
                routes: routes.length > 0 ? routes : ['/'],
                reasoning: `Using known routes from codebase analysis (${this.context.routes.length} total routes found)`,
                confidence: 'medium',
                changeType: 'ui',
            };
        }
        return {
            routes: ['/'],
            reasoning: 'Fallback to homepage due to analysis failure',
            confidence: 'low',
            changeType: 'ui',
        };
    }
    getCodebaseContext() {
        return this.context;
    }
}
exports.ClaudeRouteAnalyzer = ClaudeRouteAnalyzer;
