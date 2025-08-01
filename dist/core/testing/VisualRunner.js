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
exports.VisualRunner = void 0;
const core = __importStar(require("@actions/core"));
const Agent_1 = require("../../browser-agent/core/Agent");
class VisualRunner {
    constructor(firebaseConfig, outputDir, testTimeoutMs = 300000, claudeApiKey = '') {
        this.authHandler = null;
        this.firebaseConfig = firebaseConfig;
        this.outputDir = outputDir;
        this.testTimeout = testTimeoutMs;
        this.claudeApiKey = claudeApiKey || process.env.CLAUDE_API_KEY || '';
    }
    setAuthHandler(authHandler) {
        this.authHandler = authHandler;
    }
    async runTests(templates) {
        core.info('🤖 Running visual tests with Browser Agent...');
        const results = [];
        for (const template of templates) {
            const result = await this.runSingleTest(template);
            results.push(result);
        }
        core.info(`✅ Completed ${results.length} visual tests`);
        return results;
    }
    async runSingleTest(template) {
        const startTime = Date.now();
        try {
            core.info(`Running test: ${template.name}`);
            const testTask = this.buildTestTask(template);
            const agent = new Agent_1.Agent(testTask, {
                headless: true,
                maxSteps: template.actions.length + 10,
                llmProvider: 'anthropic',
                viewport: template.viewport || { width: 1920, height: 1080 },
                apiKey: this.claudeApiKey
            });
            await agent.initialize();
            const result = await agent.run();
            const agentState = agent.getState();
            const testErrors = agentState.memory.get('test_errors') || [];
            const screenshots = result.screenshots || [];
            await agent.cleanup();
            return {
                testId: template.id,
                testName: template.name,
                status: result.success && testErrors.length === 0 ? 'passed' : 'failed',
                duration: Date.now() - startTime,
                screenshots: screenshots.map((buf, i) => ({
                    name: `${template.id}-${i}.png`,
                    path: `${this.outputDir}/${template.id}-${i}.png`,
                    viewport: template.viewport || { width: 1920, height: 1080, name: 'desktop' },
                    timestamp: Date.now()
                })),
                videos: [],
                errors: testErrors.concat(result.error ? [result.error] : []),
                consoleMessages: []
            };
        }
        catch (error) {
            core.error(`Test ${template.name} failed: ${error}`);
            return {
                testId: template.id,
                testName: template.name,
                status: 'failed',
                duration: Date.now() - startTime,
                screenshots: [],
                videos: [],
                errors: [error instanceof Error ? error.message : String(error)],
                consoleMessages: []
            };
        }
    }
    buildTestTask(template) {
        const tasks = [
            `Test: ${template.name}`,
            `Type: ${template.type}`,
            ''
        ];
        if (this.authHandler) {
            tasks.push('1. Authenticate using smart_login if required');
        }
        template.actions.forEach((action, index) => {
            const step = this.authHandler ? index + 2 : index + 1;
            switch (action.type) {
                case 'goto':
                case 'navigate':
                    tasks.push(`${step}. Navigate to ${this.firebaseConfig.previewUrl}${action.value || action.selector}`);
                    break;
                case 'click':
                    if (action.selector) {
                        tasks.push(`${step}. Click on element matching selector: ${action.selector}`);
                    }
                    else {
                        tasks.push(`${step}. Click on element containing text: "${action.value}"`);
                    }
                    break;
                case 'fill':
                case 'type':
                    tasks.push(`${step}. Type "${action.value}" into input field: ${action.selector || action.target}`);
                    break;
                case 'wait':
                    tasks.push(`${step}. Wait ${action.timeout || 1000}ms for page to load`);
                    break;
                case 'scroll':
                    tasks.push(`${step}. Scroll the page to reveal more content`);
                    break;
                case 'hover':
                    tasks.push(`${step}. Hover over element: ${action.selector || action.target}`);
                    break;
                default:
                    tasks.push(`${step}. Perform ${action.type} action on ${action.selector || action.target}`);
            }
        });
        tasks.push('');
        tasks.push('Validation:');
        template.assertions.forEach((assertion, index) => {
            const validationStep = `V${index + 1}`;
            switch (assertion.type) {
                case 'visible':
                    tasks.push(`${validationStep}. Verify element is visible: ${assertion.selector || assertion.target}`);
                    break;
                case 'text':
                    tasks.push(`${validationStep}. Verify text "${assertion.expected}" appears in: ${assertion.selector || assertion.target}`);
                    break;
                case 'url':
                    tasks.push(`${validationStep}. Verify current URL contains: ${assertion.expected}`);
                    break;
                case 'no-overlap':
                    tasks.push(`${validationStep}. Verify no element overlaps detected on page`);
                    break;
                case 'visual-snapshot':
                    tasks.push(`${validationStep}. Take screenshot and verify visual consistency`);
                    break;
                case 'no-overflow':
                    tasks.push(`${validationStep}. Verify no horizontal overflow on page`);
                    break;
                default:
                    tasks.push(`${validationStep}. Verify ${assertion.type}: ${assertion.expected || assertion.description}`);
            }
        });
        tasks.push('');
        tasks.push('Error Handling:');
        tasks.push('- Save any errors encountered to /test_errors');
        tasks.push('- Take screenshots of any visual issues');
        tasks.push('- Continue with remaining validations even if one fails');
        return tasks.join('\n');
    }
    async cleanup() {
        core.info('🧹 Visual runner cleanup completed');
    }
    async initialize() {
        core.info('🤖 Visual Runner initialized with Browser Agent');
    }
}
exports.VisualRunner = VisualRunner;
