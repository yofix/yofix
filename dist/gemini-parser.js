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
exports.GeminiParser = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
class GeminiParser {
    constructor(githubToken, geminiBotName = 'gemini-bot') {
        this.octokit = (0, github_1.getOctokit)(githubToken);
        this.geminiBotName = geminiBotName;
    }
    async findGeminiComment() {
        try {
            const context = require('@actions/github').context;
            const { owner, repo } = context.repo;
            const prNumber = context.payload.pull_request?.number;
            if (!prNumber) {
                throw new Error('No pull request number found in context');
            }
            core.info(`Searching for ${this.geminiBotName} comments in PR #${prNumber}`);
            const comments = await this.octokit.rest.issues.listComments({
                owner,
                repo,
                issue_number: prNumber,
                per_page: 100
            });
            const geminiComments = comments.data.filter(comment => comment.user?.login.toLowerCase().includes(this.geminiBotName.toLowerCase()) ||
                comment.body.toLowerCase().includes('gemini') ||
                comment.body.includes('🤖') ||
                comment.body.includes('## Code Review') ||
                comment.body.includes('## Analysis'));
            if (geminiComments.length === 0) {
                core.warning(`No ${this.geminiBotName} comments found in PR #${prNumber}`);
                return null;
            }
            const latestComment = geminiComments.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
            core.info(`Found ${this.geminiBotName} comment from ${latestComment.created_at}`);
            return latestComment;
        }
        catch (error) {
            core.error(`Failed to fetch PR comments: ${error}`);
            return null;
        }
    }
    parseGeminiAnalysis(comment) {
        const body = comment.body;
        core.info('Parsing Gemini analysis for React components and routes...');
        const analysis = {
            hasUIChanges: false,
            changedPaths: [],
            components: [],
            routes: [],
            testSuggestions: [],
            riskLevel: 'low'
        };
        const filePathPatterns = [
            /(?:Modified|Changed|Updated):\s*([^\n]+\.(?:tsx?|jsx?|css|scss|less))/gi,
            /`([^`]+\.(?:tsx?|jsx?|css|scss|less))`/gi,
            /src\/[^\s)]+\.(?:tsx?|jsx?|css|scss|less)/gi,
            /pages\/[^\s)]+\.(?:tsx?|jsx?)/gi,
            /components\/[^\s)]+\.(?:tsx?|jsx?)/gi
        ];
        for (const pattern of filePathPatterns) {
            const matches = [...body.matchAll(pattern)];
            for (const match of matches) {
                const path = match[1] || match[0];
                if (path && !analysis.changedPaths.includes(path)) {
                    analysis.changedPaths.push(path);
                }
            }
        }
        const componentPatterns = [
            /(?:component|Component)\s*:?\s*([A-Z][a-zA-Z0-9]+)/gi,
            /`([A-Z][a-zA-Z0-9]+)`(?:\s*component)/gi,
            /src\/components\/([^\/\s]+)/gi,
            /(?:export\s+(?:default\s+)?(?:function|const)\s+)([A-Z][a-zA-Z0-9]+)/gi
        ];
        for (const pattern of componentPatterns) {
            const matches = [...body.matchAll(pattern)];
            for (const match of matches) {
                const component = match[1];
                if (component && !analysis.components.includes(component)) {
                    analysis.components.push(component);
                }
            }
        }
        const routePatterns = [
            /(?:route|Route|page|Page)\s*:?\s*([\/\w-]+)/gi,
            /src\/pages\/([^\/\s]+)/gi,
            /path\s*[:=]\s*["']([^"']+)["']/gi,
            /(?:navigate|router\.push|history\.push)\(['"`]([^'"`]+)['"`]/gi,
            /\/[a-zA-Z0-9\/-]+(?:\.[a-zA-Z0-9]+)?/g
        ];
        for (const pattern of routePatterns) {
            const matches = [...body.matchAll(pattern)];
            for (const match of matches) {
                let route = match[1] || match[0];
                if (route && route.startsWith('/') && !analysis.routes.includes(route)) {
                    route = route.split('?')[0].split('#')[0];
                    if (route.length > 1 && route !== '/api') {
                        analysis.routes.push(route);
                    }
                }
            }
        }
        const testSuggestionPatterns = [
            /(?:test|Test|should|Should)\s+([^.!?\n]+)/gi,
            /(?:verify|Verify|check|Check)\s+([^.!?\n]+)/gi,
            /(?:ensure|Ensure)\s+([^.!?\n]+)/gi
        ];
        for (const pattern of testSuggestionPatterns) {
            const matches = [...body.matchAll(pattern)];
            for (const match of matches) {
                const suggestion = match[1]?.trim();
                if (suggestion && suggestion.length > 10 && suggestion.length < 100) {
                    analysis.testSuggestions.push(suggestion);
                }
            }
        }
        const uiKeywords = [
            'ui', 'component', 'style', 'css', 'layout', 'design', 'visual',
            'button', 'form', 'input', 'modal', 'dialog', 'page', 'route',
            'render', 'display', 'show', 'hide', 'color', 'font', 'margin',
            'padding', 'responsive', 'mobile', 'desktop'
        ];
        analysis.hasUIChanges = uiKeywords.some(keyword => body.toLowerCase().includes(keyword)) || analysis.components.length > 0 || analysis.routes.length > 0;
        const riskKeywords = {
            high: ['breaking', 'major', 'critical', 'error', 'fail', 'security', 'auth'],
            medium: ['change', 'update', 'modify', 'refactor', 'new', 'add'],
            low: ['minor', 'fix', 'patch', 'style', 'formatting']
        };
        const lowerBody = body.toLowerCase();
        if (riskKeywords.high.some(keyword => lowerBody.includes(keyword))) {
            analysis.riskLevel = 'high';
        }
        else if (riskKeywords.medium.some(keyword => lowerBody.includes(keyword))) {
            analysis.riskLevel = 'medium';
        }
        if (body.includes('vite') || body.includes('Vite')) {
            analysis.platformInfo = { framework: 'React', buildTool: 'Vite' };
        }
        else if (body.includes('react') || body.includes('React')) {
            analysis.platformInfo = { framework: 'React', buildTool: 'Create React App' };
        }
        analysis.changedPaths = [...new Set(analysis.changedPaths)];
        analysis.components = [...new Set(analysis.components)];
        analysis.routes = [...new Set(analysis.routes)];
        analysis.testSuggestions = [...new Set(analysis.testSuggestions)].slice(0, 10);
        core.info(`Parsed Gemini analysis:
      - UI Changes: ${analysis.hasUIChanges}
      - Changed Paths: ${analysis.changedPaths.length}
      - Components: ${analysis.components.length}
      - Routes: ${analysis.routes.length}  
      - Risk Level: ${analysis.riskLevel}
      - Test Suggestions: ${analysis.testSuggestions.length}`);
        if (analysis.components.length > 0) {
            core.info(`Components detected: ${analysis.components.join(', ')}`);
        }
        if (analysis.routes.length > 0) {
            core.info(`Routes detected: ${analysis.routes.join(', ')}`);
        }
        return analysis;
    }
    async getAnalysis() {
        const comment = await this.findGeminiComment();
        if (!comment) {
            core.warning('No Gemini comment found. Will proceed with basic UI testing.');
            return {
                hasUIChanges: true,
                changedPaths: [],
                components: [],
                routes: ['/'],
                testSuggestions: ['Verify page loads correctly', 'Check responsive design'],
                riskLevel: 'medium'
            };
        }
        return this.parseGeminiAnalysis(comment);
    }
    generateDefaultSuggestions(analysis) {
        const suggestions = [];
        if (analysis.components.length > 0) {
            suggestions.push(`Verify ${analysis.components.join(', ')} component(s) render correctly`);
            suggestions.push(`Test ${analysis.components.join(', ')} component(s) functionality`);
        }
        if (analysis.routes.length > 0) {
            suggestions.push(`Navigate to ${analysis.routes.join(', ')} route(s)`);
            suggestions.push(`Verify ${analysis.routes.join(', ')} route(s) load without errors`);
        }
        if (analysis.riskLevel === 'high') {
            suggestions.push('Perform comprehensive testing due to high-risk changes');
            suggestions.push('Verify error handling and edge cases');
        }
        if (analysis.hasUIChanges) {
            suggestions.push('Test responsive design on mobile and desktop');
            suggestions.push('Verify visual consistency across viewports');
        }
        return suggestions;
    }
}
exports.GeminiParser = GeminiParser;
