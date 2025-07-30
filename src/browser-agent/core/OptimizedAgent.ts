import { Page, Browser, BrowserContext } from 'playwright';
import { AgentOptions, TaskResult, AgentState, StepResult, IndexedDOM, LLMResponse } from '../types';
import { ActionRegistry } from './ActionRegistry';
import { DOMIndexer } from './DOMIndexer';
import { VisionMode, AnnotatedScreenshot } from './VisionMode';
import { BrowserTaskOrchestrator } from './ParallelOrchestrator';
import { PromptBuilder } from '../llm/PromptBuilder';
import { StateManager } from './StateManager';
import { registerBuiltInActions } from '../actions';
import { AnthropicProvider } from '../llm/providers/AnthropicProvider';
import * as core from '@actions/core';

interface BatchAction {
  action: string;
  parameters: any;
  thinking?: string;
}

/**
 * Optimized agent with parallel operations and vision mode
 */
export class OptimizedAgent {
  private task: string;
  private options: AgentOptions;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private actionRegistry: ActionRegistry;
  private domIndexer: DOMIndexer;
  private visionMode?: VisionMode;
  private orchestrator: BrowserTaskOrchestrator;
  private promptBuilder: PromptBuilder;
  private stateManager: StateManager;
  private llmProvider: AnthropicProvider;
  
  // Caching
  private domCache?: IndexedDOM;
  private domCacheTime: number = 0;
  private readonly DOM_CACHE_TTL = 2000; // 2 seconds
  
  constructor(task: string, options: AgentOptions = {}) {
    this.task = task;
    this.options = {
      headless: options.headless ?? true,
      maxSteps: options.maxSteps ?? 15,
      llmProvider: options.llmProvider ?? 'anthropic',
      viewport: options.viewport ?? { width: 1280, height: 720 },
      useVisionMode: options.useVisionMode ?? false,
      ...options
    };
    
    this.actionRegistry = new ActionRegistry();
    this.domIndexer = new DOMIndexer();
    this.orchestrator = new BrowserTaskOrchestrator(3); // Max 3 parallel tasks
    this.promptBuilder = new PromptBuilder();
    this.stateManager = new StateManager(task);
    
    this.llmProvider = new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-sonnet-20240229'
    });
  }
  
  async initialize(): Promise<void> {
    // Register actions
    registerBuiltInActions(this.actionRegistry);
    
    // Launch browser
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
      this.visionMode = new VisionMode(this.page);
    }
  }
  
  async run(): Promise<TaskResult> {
    const startTime = Date.now();
    const screenshots: Buffer[] = [];
    
    try {
      let batchCount = 0;
      
      while (batchCount < Math.ceil(this.options.maxSteps / 3) && !this.stateManager.isCompleted()) {
        batchCount++;
        
        // Parallel initialization for this batch
        const initResults = await this.parallelInit();
        
        // Get next batch of actions
        const actions = await this.getNextActionsBatch(initResults);
        
        if (!actions || actions.length === 0) {
          core.debug('No more actions suggested');
          break;
        }
        
        // Execute actions in controlled parallel/sequential manner
        const results = await this.executeBatch(actions);
        
        // Record results
        results.forEach((result, index) => {
          const action = actions[index];
          const stepResult: StepResult = {
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
        
        // Check completion
        if (this.checkQuickCompletion()) {
          this.stateManager.markCompleted(true);
          break;
        }
        
        // Dynamic wait based on page state
        await this.smartWait();
      }
      
      return {
        success: this.stateManager.isCompleted(),
        steps: this.stateManager.getState().history,
        finalUrl: this.page?.url() || '',
        duration: Date.now() - startTime,
        screenshots
      };
      
    } catch (error) {
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
  
  /**
   * Parallel initialization for each batch
   */
  private async parallelInit(): Promise<{
    dom?: IndexedDOM;
    screenshot?: AnnotatedScreenshot;
    pageState?: any;
  }> {
    return await this.orchestrator.parallelInitialization({
      domIndexTask: async () => {
        // Use cached DOM if fresh
        if (this.domCache && (Date.now() - this.domCacheTime) < this.DOM_CACHE_TTL) {
          return this.domCache;
        }
        
        const dom = await this.domIndexer.indexPage(this.page!);
        this.domCache = dom;
        this.domCacheTime = Date.now();
        return dom;
      },
      
      screenshotTask: async () => {
        if (!this.visionMode) return null;
        const dom = await this.getCachedDOM();
        return await this.visionMode.captureAnnotatedScreenshot(dom);
      },
      
      planningTask: async () => {
        // Lightweight page state check instead of heavy planning
        return await this.page!.evaluate(() => ({
          url: window.location.href,
          title: document.title,
          hasForm: document.querySelectorAll('form').length > 0,
          hasPassword: document.querySelectorAll('input[type="password"]').length > 0,
          buttonCount: document.querySelectorAll('button').length
        }));
      }
    });
  }
  
  /**
   * Get next batch of actions from LLM
   */
  private async getNextActionsBatch(initResults: any): Promise<BatchAction[]> {
    const dom = initResults.dom || await this.getCachedDOM();
    let prompt: string;
    
    if (this.options.useVisionMode && initResults.screenshot) {
      // Vision mode prompt
      prompt = this.visionMode!.generateVisionPrompt(initResults.screenshot, this.task);
    } else {
      // Standard prompt - simplified
      prompt = this.buildBatchPrompt(dom);
    }
    
    const response = await this.llmProvider.complete(prompt);
    
    // Parse batch response
    try {
      const parsed = JSON.parse(response.thinking || '[]');
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 3); // Max 3 actions per batch
      } else if (parsed.action) {
        // Single action response
        return [{
          action: parsed.action,
          parameters: parsed.parameters || {},
          thinking: parsed.thinking
        }];
      }
    } catch (e) {
      // Fallback to single action
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
  
  /**
   * Execute batch of actions with smart parallelization
   */
  private async executeBatch(actions: BatchAction[]): Promise<any[]> {
    const results: any[] = [];
    
    for (const action of actions) {
      // Some actions can be parallelized, others must be sequential
      const canParallelize = this.canParallelizeAction(action.action);
      
      if (canParallelize && results.length > 0) {
        // Execute in parallel with previous
        const [prevResult, currentResult] = await Promise.all([
          Promise.resolve(results[results.length - 1]),
          this.executeAction(action.action, action.parameters)
        ]);
        results[results.length - 1] = prevResult;
        results.push(currentResult);
      } else {
        // Execute sequentially
        const result = await this.executeAction(action.action, action.parameters);
        results.push(result);
        
        // Only wait for interactive actions
        if (this.isInteractiveAction(action.action) && result.success) {
          await this.page!.waitForTimeout(300); // Minimal wait
        }
      }
    }
    
    return results;
  }
  
  private buildBatchPrompt(dom: IndexedDOM): string {
    const recentSteps = this.stateManager.getState().history.slice(-3);
    
    return `Task: ${this.task}

Current URL: ${this.page!.url()}
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
  
  private async executeAction(actionName: string, parameters: any): Promise<any> {
    const handler = this.actionRegistry.getHandler(actionName);
    if (!handler) {
      return { success: false, error: `Unknown action: ${actionName}` };
    }
    
    const context = {
      page: this.page!,
      browser: this.browser!,
      context: this.context!,
      dom: await this.getCachedDOM(),
      state: this.stateManager.getState()
    };
    
    try {
      return await handler(parameters, context);
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  private async getCachedDOM(): Promise<IndexedDOM> {
    if (!this.domCache || (Date.now() - this.domCacheTime) > this.DOM_CACHE_TTL) {
      this.domCache = await this.domIndexer.indexPage(this.page!);
      this.domCacheTime = Date.now();
    }
    return this.domCache!;
  }
  
  private canParallelizeAction(action: string): boolean {
    // Non-interactive actions can be parallelized
    const parallelizable = ['screenshot', 'get_text', 'get_attribute', 'count_elements'];
    return parallelizable.includes(action);
  }
  
  private isInteractiveAction(action: string): boolean {
    const interactive = ['click', 'type', 'smart_click', 'smart_type', 'press_key', 'select'];
    return interactive.includes(action);
  }
  
  private checkQuickCompletion(): boolean {
    const history = this.stateManager.getState().history;
    if (history.length === 0) return false;
    
    // Quick checks for common completion patterns
    const lastActions = history.slice(-3);
    
    // Task explicitly marked complete
    if (lastActions.some(s => s.action === 'task_complete')) {
      return true;
    }
    
    // Login success pattern
    if (this.task.includes('login') && 
        lastActions.some(s => s.action.includes('click') && s.result.success) &&
        !this.page!.url().includes('login')) {
      return true;
    }
    
    // Data extraction pattern
    if (lastActions.some(s => s.result.extractedContent || s.action === 'save_to_file')) {
      return true;
    }
    
    return false;
  }
  
  private async smartWait(): Promise<void> {
    // Dynamic wait based on page activity
    const startTime = Date.now();
    const maxWait = 1000;
    
    try {
      // Wait for network idle or timeout
      await this.page!.waitForLoadState('networkidle', { timeout: maxWait });
    } catch {
      // Timeout is fine, we have a max wait
    }
    
    const elapsed = Date.now() - startTime;
    if (elapsed < 300) {
      // Ensure minimum wait for UI updates
      await this.page!.waitForTimeout(300 - elapsed);
    }
  }
  
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
  }
}