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
exports.OptimizedAgent = void 0;
const ActionRegistry_1 = require("./ActionRegistry");
const DOMIndexer_1 = require("./DOMIndexer");
const VisionMode_1 = require("./VisionMode");
const ParallelOrchestrator_1 = require("./ParallelOrchestrator");
const PromptBuilder_1 = require("../llm/PromptBuilder");
const StateManager_1 = require("./StateManager");
const actions_1 = require("../actions");
const AnthropicProvider_1 = require("../llm/providers/AnthropicProvider");
const core = __importStar(require("@actions/core"));
class OptimizedAgent {
    constructor(task, options = {}) {
        this.domCacheTime = 0;
        this.DOM_CACHE_TTL = 2000;
        this.task = task;
        this.options = {
            headless: options.headless ?? true,
            maxSteps: options.maxSteps ?? 15,
            llmProvider: options.llmProvider ?? 'anthropic',
            viewport: options.viewport ?? { width: 1280, height: 720 },
            useVisionMode: options.useVisionMode ?? false,
            ...options
        };
        this.actionRegistry = new ActionRegistry_1.ActionRegistry();
        this.domIndexer = new DOMIndexer_1.DOMIndexer();
        this.orchestrator = new ParallelOrchestrator_1.BrowserTaskOrchestrator(3);
        this.promptBuilder = new PromptBuilder_1.PromptBuilder();
        this.stateManager = new StateManager_1.StateManager(task);
        this.llmProvider = new AnthropicProvider_1.AnthropicProvider({
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-3-sonnet-20240229'
        });
    }
    async initialize() {
        (0, actions_1.registerBuiltInActions)(this.actionRegistry);
        const { chromium } = require('playwright');
        this.browser = await chromium.launch({
            headless: this.options.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.context = await this.browser.newContext({
            viewport: this.options.viewport,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        });
        this.page = await this.context.newPage();
        if (this.options.useVisionMode) {
            this.visionMode = new VisionMode_1.VisionMode(this.page);
        }
    }
    async run() {
        const startTime = Date.now();
        const screenshots = [];
        try {
            let batchCount = 0;
            while (batchCount < Math.ceil(this.options.maxSteps / 3) && !this.stateManager.isCompleted()) {
                batchCount++;
                const initResults = await this.parallelInit();
                const actions = await this.getNextActionsBatch(initResults);
                if (!actions || actions.length === 0) {
                    core.debug('No more actions suggested');
                    break;
                }
                const results = await this.executeBatch(actions);
                results.forEach((result, index) => {
                    const action = actions[index];
                    const stepResult = {
                        action: action.action,
                        parameters: action.parameters,
                        result,
                        timestamp: Date.now(),
                        thinking: action.thinking
                    };
                    if (result.screenshot) {
                        screenshots.push(result.screenshot);
                    }
                    this.stateManager.recordStep(stepResult);
                });
                if (this.checkQuickCompletion()) {
                    this.stateManager.markCompleted(true);
                    break;
                }
                await this.smartWait();
            }
            return {
                success: this.stateManager.isCompleted(),
                steps: this.stateManager.getState().history,
                finalUrl: this.page?.url() || '',
                duration: Date.now() - startTime,
                screenshots
            };
        }
        catch (error) {
            core.error(`Agent error: ${error}`);
            return {
                success: false,
                steps: this.stateManager.getState().history,
                finalUrl: this.page?.url() || '',
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
                screenshots
            };
        }
    }
    async parallelInit() {
        return await this.orchestrator.parallelInitialization({
            domIndexTask: async () => {
                if (this.domCache && (Date.now() - this.domCacheTime) < this.DOM_CACHE_TTL) {
                    return this.domCache;
                }
                const dom = await this.domIndexer.indexPage(this.page);
                this.domCache = dom;
                this.domCacheTime = Date.now();
                return dom;
            },
            screenshotTask: async () => {
                if (!this.visionMode)
                    return null;
                const dom = await this.getCachedDOM();
                return await this.visionMode.captureAnnotatedScreenshot(dom);
            },
            planningTask: async () => {
                return await this.page.evaluate(() => ({
                    url: window.location.href,
                    title: document.title,
                    hasForm: document.querySelectorAll('form').length > 0,
                    hasPassword: document.querySelectorAll('input[type="password"]').length > 0,
                    buttonCount: document.querySelectorAll('button').length
                }));
            }
        });
    }
    async getNextActionsBatch(initResults) {
        const dom = initResults.dom || await this.getCachedDOM();
        let prompt;
        if (this.options.useVisionMode && initResults.screenshot) {
            prompt = this.visionMode.generateVisionPrompt(initResults.screenshot, this.task);
        }
        else {
            prompt = this.buildBatchPrompt(dom);
        }
        const response = await this.llmProvider.complete(prompt);
        try {
            const parsed = JSON.parse(response.thinking || '[]');
            if (Array.isArray(parsed)) {
                return parsed.slice(0, 3);
            }
            else if (parsed.action) {
                return [{
                        action: parsed.action,
                        parameters: parsed.parameters || {},
                        thinking: parsed.thinking
                    }];
            }
        }
        catch (e) {
            if (response.action) {
                return [{
                        action: response.action,
                        parameters: response.parameters || {},
                        thinking: response.thinking
                    }];
            }
        }
        return [];
    }
    async executeBatch(actions) {
        const results = [];
        for (const action of actions) {
            const canParallelize = this.canParallelizeAction(action.action);
            if (canParallelize && results.length > 0) {
                const [prevResult, currentResult] = await Promise.all([
                    Promise.resolve(results[results.length - 1]),
                    this.executeAction(action.action, action.parameters)
                ]);
                results[results.length - 1] = prevResult;
                results.push(currentResult);
            }
            else {
                const result = await this.executeAction(action.action, action.parameters);
                results.push(result);
                if (this.isInteractiveAction(action.action) && result.success) {
                    await this.page.waitForTimeout(300);
                }
            }
        }
        return results;
    }
    buildBatchPrompt(dom) {
        const recentSteps = this.stateManager.getState().history.slice(-3);
        return `Task: ${this.task}

Current URL: ${this.page.url()}
Page Title: ${dom.title}

Recent actions:
${recentSteps.map(s => `- ${s.action}: ${s.result.success ? '✓' : '✗'}`).join('\n')}

Interactive elements:
${this.domIndexer.getInteractiveSummary(dom).split('\n').slice(0, 20).join('\n')}

Suggest 1-3 next actions to complete the task. Use smart_type and smart_click when possible.
Respond with JSON array:
[
  {"action": "action_name", "parameters": {...}, "thinking": "reason"},
  ...
]

If task is complete, return: [{"action": "task_complete", "parameters": {}}]`;
    }
    async executeAction(actionName, parameters) {
        const handler = this.actionRegistry.getHandler(actionName);
        if (!handler) {
            return { success: false, error: `Unknown action: ${actionName}` };
        }
        const context = {
            page: this.page,
            browser: this.browser,
            context: this.context,
            dom: await this.getCachedDOM(),
            state: this.stateManager.getState()
        };
        try {
            return await handler(parameters, context);
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    async getCachedDOM() {
        if (!this.domCache || (Date.now() - this.domCacheTime) > this.DOM_CACHE_TTL) {
            this.domCache = await this.domIndexer.indexPage(this.page);
            this.domCacheTime = Date.now();
        }
        return this.domCache;
    }
    canParallelizeAction(action) {
        const parallelizable = ['screenshot', 'get_text', 'get_attribute', 'count_elements'];
        return parallelizable.includes(action);
    }
    isInteractiveAction(action) {
        const interactive = ['click', 'type', 'smart_click', 'smart_type', 'press_key', 'select'];
        return interactive.includes(action);
    }
    checkQuickCompletion() {
        const history = this.stateManager.getState().history;
        if (history.length === 0)
            return false;
        const lastActions = history.slice(-3);
        if (lastActions.some(s => s.action === 'task_complete')) {
            return true;
        }
        if (this.task.includes('login') &&
            lastActions.some(s => s.action.includes('click') && s.result.success) &&
            !this.page.url().includes('login')) {
            return true;
        }
        if (lastActions.some(s => s.result.extractedContent || s.action === 'save_to_file')) {
            return true;
        }
        return false;
    }
    async smartWait() {
        const startTime = Date.now();
        const maxWait = 1000;
        try {
            await this.page.waitForLoadState('networkidle', { timeout: maxWait });
        }
        catch {
        }
        const elapsed = Date.now() - startTime;
        if (elapsed < 300) {
            await this.page.waitForTimeout(300 - elapsed);
        }
    }
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}
exports.OptimizedAgent = OptimizedAgent;
