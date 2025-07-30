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
exports.VisualAnalyzer = void 0;
const core = __importStar(require("@actions/core"));
const Agent_1 = require("../../browser-agent/core/Agent");
const CacheManager_1 = require("../../optimization/CacheManager");
class VisualAnalyzer {
    constructor(claudeApiKey, githubToken = '', cache) {
        this.claudeApiKey = claudeApiKey;
        this.githubToken = githubToken;
        this.cache = cache || new CacheManager_1.CacheManager();
    }
    async scan(options) {
        const startTime = Date.now();
        core.info(`🤖 Scanning PR #${options.prNumber} with Browser Agent...`);
        try {
            const routes = await this.getRoutesToTest(options.routes);
            const visualTestTask = this.buildVisualTestTask(routes, options.viewports);
            const agent = new Agent_1.Agent(visualTestTask, {
                headless: true,
                maxSteps: routes.length * 5,
                llmProvider: 'anthropic',
                viewport: { width: 1920, height: 1080 }
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            const result = await agent.run();
            const agentState = agent.getState();
            const allIssues = [];
            for (const route of routes) {
                const routeIssues = agentState.memory.get(`visual_issues_${route.replace(/\//g, '_')}`) || [];
                const formattedIssues = routeIssues.map((issue, index) => ({
                    id: index,
                    type: issue.type || 'visual',
                    severity: this.mapSeverity(issue.severity),
                    description: issue.description,
                    affectedViewports: issue.viewport ? [issue.viewport] : ['desktop'],
                    location: {
                        route: route,
                        selector: issue.element?.selector,
                        file: issue.file,
                        line: issue.line
                    },
                    screenshots: issue.screenshot ? [issue.screenshot] : [],
                    screenshot: issue.screenshot ? {
                        current: issue.screenshot
                    } : undefined,
                    fix: issue.suggestedFix ? {
                        id: index,
                        issueId: index,
                        description: issue.suggestedFix,
                        confidence: 0.9,
                        files: []
                    } : undefined
                }));
                allIssues.push(...formattedIssues);
            }
            await agent.cleanup();
            const scanResult = {
                timestamp: startTime,
                duration: Date.now() - startTime,
                routes: routes,
                issues: allIssues,
                summary: {
                    total: allIssues.length,
                    bySeverity: {
                        critical: allIssues.filter(i => i.severity === 'critical').length,
                        high: allIssues.filter(i => i.severity === 'high').length,
                        medium: allIssues.filter(i => i.severity === 'medium').length,
                        low: allIssues.filter(i => i.severity === 'low').length
                    },
                    byType: allIssues.reduce((acc, issue) => {
                        acc[issue.type] = (acc[issue.type] || 0) + 1;
                        return acc;
                    }, {})
                }
            };
            core.info(`✅ Visual scan completed: ${allIssues.length} issues found in ${routes.length} routes`);
            return scanResult;
        }
        catch (error) {
            core.error(`Visual scan failed: ${error}`);
            return {
                timestamp: startTime,
                duration: Date.now() - startTime,
                routes: [],
                issues: [],
                summary: {
                    total: 0,
                    bySeverity: {
                        critical: 0,
                        high: 0,
                        medium: 0,
                        low: 0
                    },
                    byType: {}
                }
            };
        }
    }
    async analyzeScreenshot(screenshot, prompt) {
        try {
            const analysisTask = `
        Analyze the provided screenshot and ${prompt}
        
        Focus on:
        - Visual layout issues
        - Element positioning problems
        - Text readability concerns
        - Color contrast issues
        - Responsive design problems
        
        Provide specific, actionable feedback.
      `;
            const agent = new Agent_1.Agent(analysisTask, {
                headless: true,
                maxSteps: 5,
                llmProvider: 'anthropic'
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            const agentState = agent.getState();
            agentState.fileSystem.set('/analysis-screenshot.png', screenshot.toString('base64'));
            const result = await agent.run();
            await agent.cleanup();
            const analysis = agentState.fileSystem.get('/analysis-result.txt') ||
                agentState.memory.get('screenshot_analysis') ||
                'Screenshot analysis completed';
            return typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
        }
        catch (error) {
            core.warning(`Screenshot analysis failed: ${error}`);
            return 'Unable to analyze screenshot';
        }
    }
    async generateFixes(issues) {
        const fixes = [];
        for (const issue of issues) {
            try {
                const fixTask = `
          Generate a code fix for this visual issue:
          
          Issue Type: ${issue.type}
          Description: ${issue.description}
          Route: ${issue.location.route}
          Severity: ${issue.severity}
          Element: ${issue.location.selector || 'Unknown'}
          
          Provide:
          1. Specific CSS or component code changes
          2. Explanation of why this fixes the issue
          3. Best practices to prevent similar issues
          
          Focus on maintainable, standards-compliant solutions.
        `;
                const agent = new Agent_1.Agent(fixTask, {
                    headless: true,
                    maxSteps: 5,
                    llmProvider: 'anthropic'
                });
                process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
                await agent.initialize();
                const result = await agent.run();
                const agentState = agent.getState();
                const fix = agentState.fileSystem.get('/generated-fix.css') ||
                    agentState.fileSystem.get('/generated-fix.jsx') ||
                    agentState.memory.get('generated_fix') ||
                    issue.fix?.description ||
                    'Fix could not be generated';
                fixes.push({
                    issue,
                    fix: typeof fix === 'string' ? fix : JSON.stringify(fix)
                });
                await agent.cleanup();
            }
            catch (error) {
                core.warning(`Failed to generate fix for issue ${issue.id}: ${error}`);
                fixes.push({
                    issue,
                    fix: issue.fix?.description || 'Manual review required'
                });
            }
        }
        return fixes;
    }
    buildVisualTestTask(routes, viewports) {
        const tasks = [
            'Comprehensive Visual Testing Plan:',
            ''
        ];
        routes.forEach((route, index) => {
            tasks.push(`Route ${index + 1}: ${route}`);
            tasks.push(`1. Navigate to ${route}`);
            tasks.push(`2. Wait for page to fully load`);
            tasks.push(`3. Run check_visual_issues with screenshot=true`);
            tasks.push(`4. Test responsive behavior on different viewport sizes`);
            tasks.push(`5. Save results to /visual_issues_${route.replace(/\//g, '_')}`);
            tasks.push('');
        });
        if (viewports.length > 1) {
            tasks.push('Cross-Viewport Testing:');
            tasks.push(`Test each route at viewports: ${viewports.join(', ')}`);
            tasks.push('Focus on layout consistency and responsive behavior');
            tasks.push('');
        }
        tasks.push('Issue Detection Priorities:');
        tasks.push('- Element overlaps (critical)');
        tasks.push('- Text overflow (warning)');
        tasks.push('- Broken images (warning)');
        tasks.push('- Horizontal scroll (critical)');
        tasks.push('- Color contrast (info)');
        tasks.push('- Alignment issues (warning)');
        tasks.push('');
        tasks.push('For each issue found:');
        tasks.push('- Generate a specific fix using generate_visual_fix');
        tasks.push('- Take screenshot evidence');
        tasks.push('- Classify severity appropriately');
        tasks.push('- Provide actionable suggestions');
        return tasks.join('\n');
    }
    async getRoutesToTest(routes) {
        if (Array.isArray(routes)) {
            return routes;
        }
        const commonRoutes = ['/', '/about', '/contact', '/dashboard', '/profile'];
        return commonRoutes;
    }
    generateSuggestion(issue) {
        switch (issue.type) {
            case 'text-overflow':
                return 'Use text-overflow: ellipsis or increase container width';
            case 'element-overlap':
                return 'Adjust positioning or use flexbox/grid layout';
            case 'broken-image':
                return 'Fix image source URL or add fallback image';
            case 'horizontal-overflow':
                return 'Constrain width to viewport or add horizontal scroll';
            default:
                return 'Review element styling and layout properties';
        }
    }
    categorizeIssue(type) {
        const categories = {
            'text-overflow': 'Typography',
            'element-overlap': 'Layout',
            'broken-image': 'Media',
            'horizontal-overflow': 'Responsive',
            'color-contrast': 'Accessibility',
            'alignment': 'Layout'
        };
        return categories[type] || 'General';
    }
    mapSeverity(severity) {
        const normalizedSeverity = severity?.toLowerCase() || 'medium';
        switch (normalizedSeverity) {
            case 'critical':
            case 'high':
            case 'medium':
            case 'low':
                return normalizedSeverity;
            case 'error':
            case 'severe':
                return 'critical';
            case 'warning':
            case 'warn':
                return 'medium';
            case 'info':
            case 'notice':
                return 'low';
            default:
                return 'medium';
        }
    }
    async explainIssue(issue) {
        try {
            const explanationTask = `
        Provide a detailed explanation for this visual issue:
        
        Issue Type: ${issue.type}
        Description: ${issue.description}
        Severity: ${issue.severity}
        Location: ${issue.location.route}
        Element: ${issue.location.selector || 'Unknown'}
        
        Please explain:
        1. What exactly is wrong
        2. Why this is a problem
        3. How it affects user experience
        4. What should be the expected behavior
        5. Suggested fix approach
        
        Provide a clear, technical explanation that developers can understand.
      `;
            const agent = new Agent_1.Agent(explanationTask, {
                headless: true,
                maxSteps: 3,
                llmProvider: 'anthropic'
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            const result = await agent.run();
            const agentState = agent.getState();
            const explanation = agentState.fileSystem.get('/explanation.txt') ||
                agentState.memory.get('issue_explanation') ||
                `Issue: ${issue.description}\n\nThis ${issue.severity} severity issue affects the visual presentation of the page and should be addressed to maintain good user experience.`;
            await agent.cleanup();
            return typeof explanation === 'string' ? explanation : JSON.stringify(explanation);
        }
        catch (error) {
            core.warning(`Failed to explain issue ${issue.id}: ${error}`);
            return `Issue: ${issue.description}\n\nThis ${issue.severity} severity issue requires manual review to determine the best fix approach.`;
        }
    }
    setCodebaseContext(context) {
    }
}
exports.VisualAnalyzer = VisualAnalyzer;
