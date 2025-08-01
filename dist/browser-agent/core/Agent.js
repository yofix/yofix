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
exports.Agent = void 0;
const playwright_1 = require("playwright");
const core = __importStar(require("@actions/core"));
const DOMIndexer_1 = require("./DOMIndexer");
const ActionRegistry_1 = require("./ActionRegistry");
const StateManager_1 = require("./StateManager");
const PromptBuilder_1 = require("../llm/PromptBuilder");
const AnthropicProvider_1 = require("../llm/providers/AnthropicProvider");
const actions_1 = require("../actions");
const TaskPlanner_1 = require("./TaskPlanner");
const ReliabilityScorer_1 = require("./ReliabilityScorer");
const VerificationFeedbackHandler_1 = require("./VerificationFeedbackHandler");
const LogFormatter_1 = require("../utils/LogFormatter");
class Agent {
    constructor(task, options) {
        this.browser = null;
        this.browserContext = null;
        this.page = null;
        this.currentDOM = null;
        this.taskPlan = null;
        this.stepVerifications = [];
        this.currentStep = null;
        this.options = {
            headless: true,
            viewport: { width: 1920, height: 1080 },
            maxSteps: 50,
            timeout: 300000,
            llmProvider: 'anthropic',
            debug: false,
            ...options
        };
        this.domIndexer = new DOMIndexer_1.DOMIndexer();
        this.actionRegistry = new ActionRegistry_1.ActionRegistry();
        this.stateManager = new StateManager_1.StateManager(task);
        this.promptBuilder = new PromptBuilder_1.PromptBuilder();
        const apiKey = this.options.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
        this.llmProvider = this.createLLMProvider(apiKey);
        this.taskPlanner = new TaskPlanner_1.TaskPlanner(this.llmProvider);
        this.reliabilityScorer = new ReliabilityScorer_1.ReliabilityScorer();
        this.feedbackHandler = new VerificationFeedbackHandler_1.VerificationFeedbackHandler(this.llmProvider);
        (0, actions_1.registerBuiltInActions)(this.actionRegistry, this.llmProvider);
        this.setupMiddleware();
    }
    async initialize() {
        LogFormatter_1.LogFormatter.formatAgentStart('Browser', this.stateManager.getState().task);
        this.browser = await playwright_1.chromium.launch({
            headless: this.options.headless,
            args: ['--disable-blink-features=AutomationControlled']
        });
        this.browserContext = await this.browser.newContext({
            viewport: this.options.viewport,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        this.page = await this.browserContext.newPage();
        this.setupPageHandlers();
        LogFormatter_1.LogFormatter.formatBrowserInit(this.options.headless, this.options.viewport);
    }
    async run() {
        if (!this.page) {
            await this.initialize();
        }
        const startTime = Date.now();
        const screenshots = [];
        try {
            const task = this.stateManager.getState().task;
            const actions = this.actionRegistry.getActionDefinitions();
            this.taskPlan = await this.taskPlanner.generatePlan(task, actions);
            LogFormatter_1.LogFormatter.formatTaskPlan(this.taskPlan.estimatedSteps, this.taskPlan.complexity, this.taskPlan.successCriteria);
            let stepCount = 0;
            let planStepIndex = 0;
            while (!this.stateManager.isCompleted() && stepCount < this.options.maxSteps) {
                stepCount++;
                if (planStepIndex < this.taskPlan.steps.length) {
                    this.currentStep = this.taskPlan.steps[planStepIndex];
                    LogFormatter_1.LogFormatter.formatStepStart(stepCount, this.currentStep.description);
                    console.log(`Expected outcome: ${this.currentStep.expectedOutcome}`);
                }
                else {
                    LogFormatter_1.LogFormatter.formatStepStart(stepCount, 'Unplanned step');
                }
                await this.indexCurrentPage();
                const nextAction = await this.getNextAction();
                if (!nextAction || !nextAction.action) {
                    LogFormatter_1.LogFormatter.formatError('No action suggested by LLM');
                    break;
                }
                LogFormatter_1.LogFormatter.formatAction(nextAction.action, nextAction.parameters, nextAction.thinking);
                const startTime = Date.now();
                const result = await this.executeAction(nextAction);
                const duration = Date.now() - startTime;
                LogFormatter_1.LogFormatter.formatActionResult(result.success, duration, result.data);
                const stepResult = {
                    action: nextAction.action,
                    parameters: nextAction.parameters,
                    result,
                    timestamp: Date.now(),
                    thinking: nextAction.thinking
                };
                if (result.screenshot) {
                    stepResult.screenshot = result.screenshot;
                    screenshots.push(result.screenshot);
                }
                this.stateManager.recordStep(stepResult);
                if (this.currentStep && result.success) {
                    console.log(`Verifying step completion...`);
                    const pageContent = await this.extractPageIndicators();
                    const verification = await this.taskPlanner.verifyStep(this.currentStep, this.stateManager.getState(), pageContent);
                    this.stepVerifications.push(verification);
                    LogFormatter_1.LogFormatter.formatVerification(verification.success, Math.round(verification.confidence * 100), verification.issues);
                    if (verification.success) {
                        planStepIndex++;
                    }
                    else {
                        const feedbackAnalysis = await this.feedbackHandler.analyzeFeedback(verification, this.currentStep, this.stateManager.getState(), pageContent);
                        this.feedbackHandler.formatAnalysis(feedbackAnalysis);
                        if (feedbackAnalysis.shouldRetry && feedbackAnalysis.suggestedActions.length > 0) {
                            console.log(`Executing ${feedbackAnalysis.suggestedActions.length} corrective actions...`);
                            const prioritizedActions = feedbackAnalysis.suggestedActions
                                .sort((a, b) => b.priority - a.priority)
                                .slice(0, 3);
                            for (const correctiveAction of prioritizedActions) {
                                console.log(`Corrective Action: ${correctiveAction.action} - ${correctiveAction.reasoning}`);
                                const correctiveResult = await this.executeAction({
                                    action: correctiveAction.action,
                                    parameters: correctiveAction.parameters,
                                    thinking: correctiveAction.reasoning
                                });
                                LogFormatter_1.LogFormatter.formatActionResult(correctiveResult.success, 0, correctiveResult.data);
                                await this.page.waitForTimeout(500);
                            }
                            console.log(`Re-verifying step after corrective actions...`);
                            const updatedPageContent = await this.extractPageIndicators();
                            const reVerification = await this.taskPlanner.verifyStep(this.currentStep, this.stateManager.getState(), updatedPageContent);
                            this.stepVerifications.push(reVerification);
                            if (reVerification.success) {
                                console.log(`Step verification successful after corrective actions!`);
                                planStepIndex++;
                            }
                            else {
                                console.log(`Step still failing after corrective actions, will continue with fallback strategy`);
                                this.handleRepeatedFailures(this.currentStep, this.stepVerifications, planStepIndex);
                            }
                        }
                        else if (feedbackAnalysis.continueWithNextStep) {
                            console.log(`Feedback analysis suggests continuing with next step`);
                            planStepIndex++;
                        }
                        else {
                            planStepIndex = this.handleRepeatedFailures(this.currentStep, this.stepVerifications, planStepIndex);
                        }
                    }
                }
                if (await this.checkTaskCompletion()) {
                    this.stateManager.markCompleted(true);
                    console.log(`Task completed successfully!`);
                    break;
                }
                await this.page.waitForTimeout(1000);
            }
            if (stepCount >= this.options.maxSteps) {
                LogFormatter_1.LogFormatter.formatError(`Reached maximum steps limit: ${this.options.maxSteps}`);
                this.stateManager.markCompleted(false, 'Maximum steps reached');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogFormatter_1.LogFormatter.formatError(`Task failed: ${errorMessage}`);
            this.stateManager.markCompleted(false, errorMessage);
        }
        const state = this.stateManager.getState();
        let reliability;
        if (this.taskPlan) {
            reliability = this.reliabilityScorer.calculateReliability(this.taskPlan, {
                success: state.completed && !state.error,
                steps: state.history,
                finalUrl: state.currentUrl,
                error: state.error,
                duration: Date.now() - startTime,
                screenshots
            }, this.stepVerifications, state);
            LogFormatter_1.LogFormatter.formatReliabilityScore(reliability);
        }
        return {
            success: state.completed && !state.error,
            steps: state.history,
            finalUrl: state.currentUrl,
            error: state.error,
            duration: Date.now() - startTime,
            screenshots,
            reliability
        };
    }
    async indexCurrentPage() {
        if (!this.page)
            throw new Error('Page not initialized');
        const startTime = Date.now();
        this.currentDOM = await this.domIndexer.indexPage(this.page);
        const indexTime = Date.now() - startTime;
        this.stateManager.updateUrl(this.currentDOM.url);
        LogFormatter_1.LogFormatter.formatPageIndexing(this.currentDOM.elements.size, this.currentDOM.interactiveElements.length, this.currentDOM.url);
    }
    async getNextAction() {
        if (!this.currentDOM)
            return null;
        const state = this.stateManager.getState();
        const actions = this.actionRegistry.getActionDefinitions();
        const prompt = this.promptBuilder.buildTaskPrompt(state.task, state, this.currentDOM, actions, this.currentDOM.screenshot);
        try {
            const response = await this.llmProvider.complete(prompt);
            core.debug(`LLM Response: ${JSON.stringify(response)}`);
            if ('completed' in response && response.completed !== undefined) {
                core.debug('Received completion check response instead of action');
                if (!response.completed && response.next_action) {
                    const retryPrompt = prompt + `\n\nPrevious response indicated task not complete. ${response.next_action}\nPlease provide the specific next action to take.`;
                    const retryResponse = await this.llmProvider.complete(retryPrompt);
                    if (retryResponse.action) {
                        core.info(`LLM suggests: ${retryResponse.action}`);
                        if (retryResponse.thinking) {
                            core.info(`Thinking: ${retryResponse.thinking}`);
                        }
                        return retryResponse;
                    }
                }
                return null;
            }
            if (response.action) {
                LogFormatter_1.LogFormatter.formatLLMResponse(response, 'ACTION');
                return response;
            }
            return null;
        }
        catch (error) {
            LogFormatter_1.LogFormatter.formatError(`LLM error: ${error}`);
            return null;
        }
    }
    async executeAction(action) {
        if (!this.page || !this.currentDOM) {
            return { success: false, error: 'Page not initialized' };
        }
        const context = {
            page: this.page,
            browser: this.browser,
            context: this.browserContext,
            dom: this.currentDOM,
            state: this.stateManager.getState()
        };
        const validation = this.actionRegistry.validateParams(action.action, action.parameters);
        if (!validation.valid) {
            return {
                success: false,
                error: `Invalid parameters: ${validation.errors.join(', ')}`
            };
        }
        if (action.parameters.index !== undefined) {
            await this.highlightElement(action.parameters.index);
        }
        const result = await this.actionRegistry.execute(action.action, action.parameters, context);
        if (result.success && this.shouldReindex(action.action)) {
            await this.indexCurrentPage();
        }
        return result;
    }
    async checkCompletion() {
        const state = this.stateManager.getState();
        if (state.history.length % 3 !== 0)
            return false;
        const prompt = this.promptBuilder.buildCompletionCheckPrompt(state.task, state);
        try {
            const response = await this.llmProvider.complete(prompt);
            if (response.completed !== undefined) {
                if (!response.completed && response.reason) {
                    core.debug(`Task not complete: ${response.reason}`);
                }
                return response.completed === true;
            }
            if (response.parameters && typeof response.parameters.completed === 'boolean') {
                return response.parameters.completed;
            }
            if (response.action || response.parameters?.action) {
                return false;
            }
            return false;
        }
        catch (error) {
            core.warning(`Completion check failed: ${error}`);
            return false;
        }
    }
    async highlightElement(index) {
        if (!this.page || !this.currentDOM)
            return;
        try {
            const elementId = `indexed-${index}`;
            const element = this.currentDOM.elements.get(elementId);
            if (element && element.selector) {
                await this.page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    if (el) {
                        const originalOutline = el.style.outline;
                        const originalBoxShadow = el.style.boxShadow;
                        const originalTransition = el.style.transition;
                        el.style.outline = '3px solid #ff0066';
                        el.style.boxShadow = '0 0 10px rgba(255, 0, 102, 0.5)';
                        el.style.transition = 'all 0.3s ease';
                        setTimeout(() => {
                            el.style.outline = originalOutline;
                            el.style.boxShadow = originalBoxShadow;
                            el.style.transition = originalTransition;
                        }, 1000);
                    }
                }, element.selector);
                await this.page.waitForTimeout(300);
            }
        }
        catch (error) {
            core.debug(`Failed to highlight element: ${error}`);
        }
    }
    async extractPageIndicators() {
        if (!this.page)
            return '';
        try {
            const indicators = await this.page.evaluate(() => {
                const items = [];
                items.push(`URL: ${window.location.href}`);
                items.push(`Title: ${document.title}`);
                const h1 = document.querySelector('h1');
                if (h1)
                    items.push(`H1: ${h1.textContent?.trim()}`);
                const forms = document.querySelectorAll('form');
                items.push(`Forms: ${forms.length}`);
                const filledInputs = document.querySelectorAll('input[value]:not([value=""])');
                items.push(`Filled inputs: ${filledInputs.length}`);
                const hasLogin = document.body.textContent?.toLowerCase().includes('login') ||
                    document.body.textContent?.toLowerCase().includes('sign in');
                const hasLogout = document.body.textContent?.toLowerCase().includes('logout') ||
                    document.body.textContent?.toLowerCase().includes('sign out');
                items.push(`Login present: ${hasLogin}, Logout present: ${hasLogout}`);
                const userPatterns = ['welcome', 'hello', 'hi,', 'logged in as'];
                const hasUserInfo = userPatterns.some(pattern => document.body.textContent?.toLowerCase().includes(pattern));
                items.push(`User info present: ${hasUserInfo}`);
                return items.join('\n');
            });
            return indicators;
        }
        catch (error) {
            core.debug(`Failed to extract page indicators: ${error}`);
            return '';
        }
    }
    async checkTaskCompletion() {
        if (!this.taskPlan) {
            return this.checkCompletion();
        }
        const completion = this.taskPlanner.calculateTaskCompletion(this.taskPlan, this.stepVerifications);
        core.debug(`Task completion: ${(completion.completionRate * 100).toFixed(0)}%, confidence: ${(completion.confidence * 100).toFixed(0)}%`);
        if (completion.missingSteps.length > 0) {
            core.debug(`Missing steps: ${completion.missingSteps.join(', ')}`);
        }
        if (completion.completionRate >= 1.0 && completion.confidence >= 0.8) {
            core.info('✅ High confidence task completion detected');
            return true;
        }
        if (completion.completionRate >= 0.8 && completion.confidence >= 0.6) {
            core.info('🔍 Good completion rate, validating with LLM...');
            try {
                const llmCheck = await this.checkCompletion();
                if (llmCheck) {
                    core.info('✅ LLM confirmed task completion');
                    return true;
                }
            }
            catch (error) {
                core.warning(`LLM completion check failed: ${error}`);
                if (completion.completionRate >= 0.9) {
                    core.info('✅ High plan completion rate, proceeding despite LLM check failure');
                    return true;
                }
            }
        }
        if (completion.completionRate >= 0.7 && this.taskPlan.complexity === 'simple') {
            core.info('✅ Reasonable completion for simple task');
            return true;
        }
        const state = this.stateManager.getState();
        if (state.history.length >= this.taskPlan.estimatedSteps * 2) {
            core.warning('⚠️ Maximum step limit reached, forcing completion');
            return true;
        }
        return false;
    }
    shouldReindex(action) {
        const reindexActions = [
            'click', 'go_to', 'go_back', 'go_forward',
            'reload', 'type', 'select', 'press_key'
        ];
        return reindexActions.includes(action);
    }
    setupMiddleware() {
        this.actionRegistry.use(async (context, next) => {
            const result = await next();
            if (this.options.debug) {
                core.debug(`Action completed: ${JSON.stringify(result)}`);
            }
            return result;
        });
        this.actionRegistry.use(async (context, next) => {
            const result = await next();
            if (!result.success && context.page) {
                try {
                    result.screenshot = await context.page.screenshot({ type: 'png' });
                }
                catch (e) {
                }
            }
            return result;
        });
    }
    setupPageHandlers() {
        if (!this.page)
            return;
        if (this.options.debug) {
            this.page.on('console', msg => {
                core.debug(`Browser console: ${msg.text()}`);
            });
        }
        this.page.on('dialog', async (dialog) => {
            core.info(`Dialog detected: ${dialog.message()}`);
            await dialog.accept();
        });
        this.page.on('load', () => {
            core.debug(`Page loaded: ${this.page?.url()}`);
        });
    }
    createLLMProvider(apiKey) {
        switch (this.options.llmProvider) {
            case 'anthropic':
                return new AnthropicProvider_1.AnthropicProvider({
                    apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '',
                    model: this.options.llmModel || 'claude-3-5-sonnet-20241022'
                });
            default:
                throw new Error(`Unknown LLM provider: ${this.options.llmProvider}`);
        }
    }
    handleRepeatedFailures(currentStep, stepVerifications, currentPlanStepIndex) {
        const failedVerifications = stepVerifications.filter(v => v.stepId === currentStep.id && !v.success).length;
        if (failedVerifications >= 2) {
            console.log(`Step ${currentStep.id} failed verification ${failedVerifications} times`);
            if (!currentStep.required) {
                console.log(`Skipping optional step due to repeated verification failures`);
                return currentPlanStepIndex + 1;
            }
            else if (failedVerifications >= 3) {
                console.log(`Forcing progression past required step due to repeated failures`);
                return currentPlanStepIndex + 1;
            }
            else {
                console.log(`Will attempt alternative approach for this step`);
                return currentPlanStepIndex;
            }
        }
        return currentPlanStepIndex;
    }
    async cleanup() {
        this.stateManager.cleanup();
        if (this.page) {
            await this.page.close().catch(() => { });
        }
        if (this.browserContext) {
            await this.browserContext.close().catch(() => { });
        }
        if (this.browser) {
            await this.browser.close().catch(() => { });
        }
        core.info('Browser agent cleaned up');
    }
    getState() {
        return this.stateManager.getState();
    }
    registerAction(definition, handler) {
        this.actionRegistry.register(definition, handler);
    }
    exportState() {
        return this.stateManager.exportState();
    }
    importState(data) {
        this.stateManager.importState(data);
    }
}
exports.Agent = Agent;
