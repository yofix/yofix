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
exports.TestGenerator = void 0;
const core = __importStar(require("@actions/core"));
const Agent_1 = require("../../browser-agent/core/Agent");
class TestGenerator {
    constructor(firebaseConfig, viewports, claudeApiKey) {
        this.firebaseConfig = firebaseConfig;
        this.viewports = viewports;
        this.claudeApiKey = claudeApiKey;
    }
    async runTests(analysis) {
        core.info('🤖 Running tests with Browser Agent...');
        const results = [];
        for (const route of analysis.routes) {
            const result = await this.testRoute(route, analysis);
            results.push(result);
        }
        core.info(`✅ Completed ${results.length} route tests`);
        return results;
    }
    async testRoute(route, analysis) {
        const startTime = Date.now();
        const url = `${this.firebaseConfig.previewUrl}${route}`;
        core.info(`Testing route: ${route}`);
        try {
            const testTask = this.buildRouteTestTask(route, url, analysis);
            const agent = new Agent_1.Agent(testTask, {
                headless: true,
                maxSteps: 25,
                llmProvider: 'anthropic',
                viewport: this.viewports[0] || { width: 1920, height: 1080 }
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            const result = await agent.run();
            const state = agent.getState();
            const visualIssues = state.memory.get('visual_issues') || [];
            const responsiveResults = state.memory.get('responsive_test_results') || [];
            const issues = visualIssues.map((issue) => ({
                type: issue.type,
                severity: issue.severity,
                description: issue.description,
                fix: issue.suggestedFix
            }));
            await agent.cleanup();
            return {
                route,
                success: result.success,
                duration: Date.now() - startTime,
                issues,
                screenshots: result.screenshots,
                error: result.error
            };
        }
        catch (error) {
            core.error(`Failed to test route ${route}: ${error}`);
            return {
                route,
                success: false,
                duration: Date.now() - startTime,
                issues: [],
                screenshots: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    buildRouteTestTask(route, url, analysis) {
        const tasks = [
            `1. Navigate to ${url}`,
            '2. Wait for the page to fully load',
            '3. Take a screenshot for baseline comparison',
            '4. Run check_visual_issues with screenshot=true to detect layout problems',
            '5. Test navigation by clicking on interactive elements',
            '6. Check for broken images or missing content'
        ];
        if (analysis.hasUIChanges) {
            tasks.push('7. Run test_responsive to check mobile and tablet layouts');
        }
        const hasFormComponents = analysis.components.some(comp => comp.toLowerCase().includes('form') ||
            comp.toLowerCase().includes('input') ||
            comp.toLowerCase().includes('login'));
        if (hasFormComponents) {
            tasks.push('8. Test form interactions by filling out any visible forms');
        }
        if (analysis.riskLevel === 'high') {
            tasks.push('9. Test error boundaries by triggering edge cases');
        }
        tasks.push(`10. Save any issues found to /results${route.replace(/\//g, '_')}.json`);
        tasks.push('11. Generate fixes for any critical issues using generate_visual_fix');
        return `Test the ${route} page comprehensively:\n\n${tasks.join('\n')}

Focus on:
- Visual layout issues (overlaps, overflows, alignment)
- Responsive behavior across viewports
- Interactive element functionality
- Loading performance and errors
- Accessibility concerns

Provide detailed analysis and practical fixes for any issues found.`;
    }
    async testAuthentication(loginUrl, credentials) {
        const startTime = Date.now();
        try {
            const authTask = `
        Test the authentication flow:
        
        1. Navigate to ${this.firebaseConfig.previewUrl}${loginUrl}
        2. Use smart_login with email="${credentials.email}" password="${credentials.password}"
        3. Verify successful login by checking for user profile or dashboard elements
        4. Test logout functionality
        5. Verify successful logout by checking return to login page
        6. Take screenshots at each step
        7. Save test results to /auth-test-results.json
        
        Report any issues with the login/logout flow.
      `;
            const agent = new Agent_1.Agent(authTask, {
                headless: true,
                maxSteps: 15,
                llmProvider: 'anthropic'
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            const result = await agent.run();
            await agent.cleanup();
            return {
                route: loginUrl,
                success: result.success,
                duration: Date.now() - startTime,
                issues: [],
                screenshots: result.screenshots,
                error: result.error
            };
        }
        catch (error) {
            return {
                route: loginUrl,
                success: false,
                duration: Date.now() - startTime,
                issues: [],
                screenshots: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    async generateAndRunTests(analysis) {
        core.info('🧠 AI-powered test generation and execution...');
        const testPlanTask = `
      Analyze this web application and create a comprehensive test plan:
      
      Application URL: ${this.firebaseConfig.previewUrl}
      Routes to test: ${analysis.routes.join(', ')}
      Components: ${analysis.components.join(', ')}
      Risk Level: ${analysis.riskLevel}
      UI Changes: ${analysis.hasUIChanges ? 'Yes' : 'No'}
      
      For each route, determine:
      1. What specific functionality to test
      2. What visual elements to verify
      3. What user interactions to simulate  
      4. What edge cases to check
      5. What performance aspects to measure
      
      Then execute the tests systematically and report results.
    `;
        const agent = new Agent_1.Agent(testPlanTask, {
            headless: true,
            maxSteps: 50,
            llmProvider: 'anthropic'
        });
        process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
        try {
            await agent.initialize();
            const result = await agent.run();
            await agent.cleanup();
            const state = agent.getState();
            const testResults = [];
            for (const route of analysis.routes) {
                const routeFile = state.fileSystem.get(`/results${route.replace(/\//g, '_')}.json`);
                if (routeFile) {
                    try {
                        const routeResult = JSON.parse(routeFile);
                        testResults.push({
                            route,
                            success: routeResult.success || true,
                            duration: routeResult.duration || 0,
                            issues: routeResult.issues || [],
                            screenshots: result.screenshots || [],
                            error: routeResult.error
                        });
                    }
                    catch (e) {
                        testResults.push({
                            route,
                            success: result.success,
                            duration: 0,
                            issues: [],
                            screenshots: result.screenshots,
                            error: undefined
                        });
                    }
                }
            }
            return testResults;
        }
        catch (error) {
            core.error(`AI test generation failed: ${error}`);
            return await this.runTests(analysis);
        }
    }
}
exports.TestGenerator = TestGenerator;
