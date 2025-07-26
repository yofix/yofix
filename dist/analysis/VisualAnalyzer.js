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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualAnalyzer = void 0;
const core = __importStar(require("@actions/core"));
const sdk_1 = require("@anthropic-ai/sdk");
const claude_route_analyzer_1 = require("../claude-route-analyzer");
const CacheManager_1 = require("../cache/CacheManager");
const ImageOptimizer_1 = require("../optimization/ImageOptimizer");
const crypto_1 = __importDefault(require("crypto"));
class VisualAnalyzer {
    constructor(claudeApiKey, githubToken = '', cache) {
        this.codebaseContext = null;
        this.claude = new sdk_1.Anthropic({ apiKey: claudeApiKey });
        this.claudeApiKey = claudeApiKey;
        this.githubToken = githubToken;
        this.cache = cache || new CacheManager_1.CacheManager();
        this.imageOptimizer = new ImageOptimizer_1.ImageOptimizer();
    }
    async scan(options) {
        const startTime = Date.now();
        const issues = [];
        core.info(`🔍 Scanning PR #${options.prNumber} for visual issues...`);
        try {
            let routesToScan = [];
            if (options.routes === 'auto') {
                const routeAnalyzer = new claude_route_analyzer_1.ClaudeRouteAnalyzer(this.claudeApiKey, this.githubToken);
                const analysis = await routeAnalyzer.analyzeRoutes(options.prNumber);
                routesToScan = analysis.routes;
                this.codebaseContext = routeAnalyzer.getCodebaseContext();
                core.info(`Claude identified ${routesToScan.length} routes to scan`);
            }
            else {
                routesToScan = options.routes;
            }
            const maxRoutes = options.options?.maxRoutes || 10;
            if (routesToScan.length > maxRoutes) {
                core.warning(`Limiting scan to ${maxRoutes} routes (found ${routesToScan.length})`);
                routesToScan = routesToScan.slice(0, maxRoutes);
            }
            const previewUrl = options.options?.previewUrl || process.env.PREVIEW_URL;
            if (!previewUrl) {
                throw new Error('Preview URL not found. Please provide preview-url input.');
            }
            for (const route of routesToScan) {
                for (const viewport of options.viewports) {
                    try {
                        const routeIssues = await this.analyzeRoute(previewUrl, route, viewport, options.prNumber);
                        issues.push(...routeIssues);
                    }
                    catch (error) {
                        core.warning(`Failed to analyze ${route} at ${viewport}: ${error.message}`);
                    }
                }
            }
            issues.forEach((issue, index) => {
                issue.id = index + 1;
            });
            const summary = this.calculateSummary(issues);
            return {
                timestamp: Date.now(),
                duration: Date.now() - startTime,
                routes: routesToScan,
                issues,
                summary
            };
        }
        catch (error) {
            core.error(`Scan failed: ${error.message}`);
            return {
                timestamp: Date.now(),
                duration: Date.now() - startTime,
                routes: [],
                issues: [],
                summary: {
                    total: 0,
                    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
                    byType: {}
                }
            };
        }
    }
    async explainIssue(issue) {
        const prompt = `Analyze this visual issue and provide a detailed explanation:

Issue Type: ${issue.type}
Severity: ${issue.severity}
Description: ${issue.description}
Affected Viewports: ${issue.affectedViewports.join(', ')}
Location: ${issue.location.route} - ${issue.location.selector}

Please provide:
1. A detailed explanation of what's happening
2. Root cause analysis
3. Impact on user experience
4. Potential browser compatibility concerns
5. Recommended fix approach

Format the response in markdown.`;
        try {
            const response = await this.claude.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1024,
                temperature: 0.3,
                messages: [{
                        role: 'user',
                        content: prompt
                    }]
            });
            return response.content[0].type === 'text' ? response.content[0].text : issue.description;
        }
        catch (error) {
            core.warning(`Failed to get detailed explanation: ${error.message}`);
            return `**${issue.type}**

${issue.description}

This issue affects ${issue.affectedViewports.join(', ')} viewports at ${issue.location.route}.`;
        }
    }
    async captureAndAnalyze(page, route) {
        const screenshot = await page.screenshot({ fullPage: true });
        const optimized = await this.imageOptimizer.optimize(screenshot, {
            format: 'webp',
            quality: 90
        });
        const imageHash = crypto_1.default
            .createHash('sha256')
            .update(optimized.buffer)
            .digest('hex');
        const base64Image = optimized.buffer.toString('base64');
        const cacheKey = this.cache.createVisualAnalysisKey({
            imageHash,
            analysisType: 'visual-issues',
            options: { route }
        });
        const response = await this.cache.wrap(cacheKey, () => this.claude.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            temperature: 0.3,
            messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze this screenshot for visual issues. Focus on:
- Layout problems (overlapping elements, misalignment, broken grids)
- Responsive issues (content overflow, improper scaling)
- Text readability (contrast, truncation, font size)
- Spacing inconsistencies
- Color and styling issues
- Accessibility concerns

For each issue found, provide:
1. Issue type
2. Severity (critical/high/medium/low)
3. Description
4. Affected elements (CSS selectors if identifiable)
5. Suggested fix approach

Format your response as JSON.`
                        },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: base64Image
                            }
                        }
                    ]
                }]
        }), { ttl: 3600 });
        let issues = [];
        try {
            const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                if (analysis.issues && Array.isArray(analysis.issues)) {
                    issues = analysis.issues.map((issue) => ({
                        severity: issue.severity || 'medium',
                        type: issue.type || 'Visual Issue',
                        description: issue.description || 'Unspecified visual issue',
                        affectedViewports: [],
                        location: {
                            route,
                            selector: issue.selector || ''
                        }
                    }));
                }
            }
        }
        catch (error) {
            core.warning(`Failed to parse Claude Vision response: ${error.message}`);
        }
        return {
            screenshot,
            analysis: response.content[0].type === 'text' ? response.content[0].text : '',
            issues
        };
    }
    async compareWithBaseline(current, baseline) {
        const currentBase64 = current.toString('base64');
        const baselineBase64 = baseline.toString('base64');
        const response = await this.claude.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            temperature: 0.1,
            messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Compare these two screenshots and identify visual differences. Focus on layout changes, styling differences, and content modifications. Provide a difference percentage (0-100) and list specific issues. Format as JSON.'
                        },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: baselineBase64
                            }
                        },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: currentBase64
                            }
                        }
                    ]
                }]
        });
        let result = {
            hasDifferences: false,
            diffPercentage: 0,
            issues: []
        };
        try {
            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                result.hasDifferences = analysis.hasDifferences || false;
                result.diffPercentage = analysis.diffPercentage || 0;
                result.issues = (analysis.issues || []).map((issue) => ({
                    severity: issue.severity || 'medium',
                    type: 'Visual Regression',
                    description: issue.description || 'Visual difference detected',
                    affectedViewports: [],
                    location: {
                        route: '',
                        selector: issue.selector || ''
                    }
                }));
            }
        }
        catch (error) {
            core.warning(`Failed to parse baseline comparison: ${error.message}`);
        }
        return result;
    }
    async analyzeRoute(previewUrl, route, viewport, prNumber) {
        const url = new URL(route, previewUrl).toString();
        core.info(`Analyzing ${url} at ${viewport} viewport`);
        const [width, height] = viewport.split('x').map(v => parseInt(v));
        const { chromium } = await Promise.resolve().then(() => __importStar(require('playwright')));
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width, height },
            userAgent: 'YoFix/1.0 Visual Analysis Bot'
        });
        const page = await context.newPage();
        try {
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            await page.waitForTimeout(2000);
            const { issues } = await this.captureAndAnalyze(page, route);
            issues.forEach(issue => {
                issue.affectedViewports = [this.getViewportName(viewport)];
            });
            return issues;
        }
        finally {
            await browser.close();
        }
    }
    getViewportName(viewport) {
        const [width] = viewport.split('x').map(v => parseInt(v));
        if (width <= 480)
            return 'mobile';
        if (width <= 768)
            return 'tablet';
        return 'desktop';
    }
    calculateSummary(issues) {
        const summary = {
            total: issues.length,
            bySeverity: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            },
            byType: {}
        };
        issues.forEach(issue => {
            summary.bySeverity[issue.severity]++;
            if (!summary.byType[issue.type]) {
                summary.byType[issue.type] = 0;
            }
            summary.byType[issue.type]++;
        });
        return summary;
    }
}
exports.VisualAnalyzer = VisualAnalyzer;
