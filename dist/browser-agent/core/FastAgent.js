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
exports.FastAgent = void 0;
const LLMClient_1 = require("../llm/LLMClient");
const ActionRegistry_1 = require("./ActionRegistry");
const DOMIndexer_1 = require("./DOMIndexer");
const PromptBuilder_1 = require("../llm/PromptBuilder");
const actions_1 = require("../actions");
const core = __importStar(require("@actions/core"));
class FastAgent {
    constructor(task, options = {}) {
        this.lastDomIndexTime = 0;
        this.task = task;
        this.options = {
            headless: options.headless ?? true,
            maxSteps: options.maxSteps ?? 15,
            llmProvider: options.llmProvider ?? 'anthropic',
            viewport: options.viewport ?? { width: 1280, height: 720 },
            ...options
        };
        this.llmClient = new LLMClient_1.LLMClient({
            provider: this.options.llmProvider,
            apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || ''
        });
        this.actionRegistry = new ActionRegistry_1.ActionRegistry();
        this.domIndexer = new DOMIndexer_1.DOMIndexer();
        this.promptBuilder = new PromptBuilder_1.PromptBuilder();
        this.state = {
            task,
            currentUrl: '',
            history: [],
            memory: new Map(),
            fileSystem: new Map(),
            completed: false
        };
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
    }
    async run() {
        const startTime = Date.now();
        const screenshots = [];
        try {
            let stepCount = 0;
            while (stepCount < this.options.maxSteps && !this.state.completed) {
                stepCount++;
                const dom = await this.getOrUpdateDOM();
                const prompt = this.buildSimplePrompt(dom);
                const actions = await this.llmClient.getNextActions(prompt);
                if (!actions || actions.length === 0) {
                    core.debug('No more actions suggested by LLM');
                    break;
                }
                for (const action of actions) {
                    core.info(`\n🎯 Action: ${action.action}`);
                    const result = await this.executeAction(action.action, action.parameters);
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
                    this.state.history.push(stepResult);
                    if (action.action === 'task_complete' || this.isTaskComplete()) {
                        this.state.completed = true;
                        break;
                    }
                    if (result.success) {
                        await this.page.waitForTimeout(500);
                    }
                }
            }
            return {
                success: this.state.completed,
                steps: this.state.history,
                finalUrl: this.page?.url() || '',
                duration: Date.now() - startTime,
                screenshots
            };
        }
        catch (error) {
            core.error(`Agent error: ${error}`);
            return {
                success: false,
                steps: this.state.history,
                finalUrl: this.page?.url() || '',
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
                screenshots
            };
        }
    }
    async getOrUpdateDOM() {
        const now = Date.now();
        if (this.cachedDom && (now - this.lastDomIndexTime) < 2000) {
            return this.cachedDom;
        }
        this.cachedDom = await this.domIndexer.indexPage(this.page);
        this.lastDomIndexTime = now;
        return this.cachedDom;
    }
    buildSimplePrompt(dom) {
        const recentSteps = this.state.history.slice(-3);
        return `Task: ${this.task}

Current URL: ${this.page.url()}
Page Title: ${dom.title}

Recent actions:
${recentSteps.map(s => `- ${s.action}: ${JSON.stringify(s.parameters)}`).join('\n')}

Interactive elements:
${this.domIndexer.getInteractiveSummary(dom)}

Available actions: ${Array.from(this.actionRegistry.getAllActions().keys()).join(', ')}

What actions should I take next? Respond with 1-3 actions in JSON:
[
  {"action": "action_name", "parameters": {...}, "thinking": "brief reason"},
  ...
]

If the task is complete, use: {"action": "task_complete", "parameters": {}}`;
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
            dom: await this.getOrUpdateDOM(),
            state: this.state
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
    isTaskComplete() {
        const lastSteps = this.state.history.slice(-3);
        if (lastSteps.some(s => s.result.extractedContent || s.action === 'save_to_file')) {
            return true;
        }
        if (this.task.includes('login') &&
            lastSteps.some(s => s.action === 'press_key' || s.action.includes('click')) &&
            !this.page.url().includes('login')) {
            return true;
        }
        return false;
    }
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}
exports.FastAgent = FastAgent;
