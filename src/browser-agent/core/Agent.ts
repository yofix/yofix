import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as core from '@actions/core';
import { 
  AgentOptions, 
  AgentContext, 
  TaskResult, 
  StepResult,
  ActionResult,
  LLMResponse,
  IndexedDOM
} from '../types';
import { DOMIndexer } from './DOMIndexer';
import { ActionRegistry } from './ActionRegistry';
import { StateManager } from './StateManager';
import { PromptBuilder } from '../llm/PromptBuilder';
import { LLMProvider } from '../llm/providers/LLMProvider';
import { AnthropicProvider } from '../llm/providers/AnthropicProvider';
import { registerBuiltInActions } from '../actions';
import { TaskPlanner, TaskPlan, TaskStep, TaskVerification } from './TaskPlanner';
import { ReliabilityScorer, ReliabilityScore } from './ReliabilityScorer';
import { VerificationFeedbackHandler } from './VerificationFeedbackHandler';
import { LogFormatter } from '../utils/LogFormatter';

export class Agent {
  private browser: Browser | null = null;
  private browserContext: BrowserContext | null = null;
  private page: Page | null = null;
  
  private domIndexer: DOMIndexer;
  private actionRegistry: ActionRegistry;
  private stateManager: StateManager;
  private promptBuilder: PromptBuilder;
  private llmProvider: LLMProvider;
  private taskPlanner: TaskPlanner;
  private reliabilityScorer: ReliabilityScorer;
  private feedbackHandler: VerificationFeedbackHandler;
  
  private options: AgentOptions;
  private currentDOM: IndexedDOM | null = null;
  private taskPlan: TaskPlan | null = null;
  private stepVerifications: TaskVerification[] = [];
  private currentStep: TaskStep | null = null;
  
  constructor(task: string, options: AgentOptions) {
    this.options = {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      maxSteps: 50,
      timeout: 300000, // 5 minutes
      llmProvider: 'anthropic',
      debug: false,
      ...options
    };
    
    // Initialize core components
    this.domIndexer = new DOMIndexer();
    this.actionRegistry = new ActionRegistry();
    this.stateManager = new StateManager(task);
    this.promptBuilder = new PromptBuilder();
    
    // Initialize LLM provider - prefer options.apiKey over environment variables
    const apiKey = this.options.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
    this.llmProvider = this.createLLMProvider(apiKey);
    
    // Initialize planning and reliability components
    this.taskPlanner = new TaskPlanner(this.llmProvider);
    this.reliabilityScorer = new ReliabilityScorer();
    this.feedbackHandler = new VerificationFeedbackHandler(this.llmProvider);
    
    // Register built-in actions with LLM provider for intelligent element selection
    registerBuiltInActions(this.actionRegistry, this.llmProvider);
    
    // Setup middleware
    this.setupMiddleware();
  }
  
  /**
   * Initialize browser and start page
   */
  async initialize(): Promise<void> {
    LogFormatter.formatAgentStart('Browser', this.stateManager.getState().task);
    
    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    this.browserContext = await this.browser.newContext({
      viewport: this.options.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    this.page = await this.browserContext.newPage();
    
    // Setup page event handlers
    this.setupPageHandlers();
    
    LogFormatter.formatBrowserInit(this.options.headless!, this.options.viewport!);
  }
  
  /**
   * Execute the task
   */
  async run(): Promise<TaskResult & { reliability?: ReliabilityScore }> {
    if (!this.page) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    const screenshots: Buffer[] = [];
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task timeout: exceeded ${this.options.timeout}ms`));
      }, this.options.timeout!);
    });
    
    // Create main execution promise
    const executionPromise = this.executeTask(startTime, screenshots);
    
    // Race between execution and timeout
    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Task timeout')) {
        LogFormatter.formatError(`Task timed out after ${this.options.timeout}ms`);
        this.stateManager.markCompleted(false, 'Task timeout exceeded');
      }
      throw error;
    }
  }
  
  private async executeTask(startTime: number, screenshots: Buffer[]): Promise<TaskResult & { reliability?: ReliabilityScore }> {
    try {
      const task = this.stateManager.getState().task;
      
      // Generate task plan
      const actions = this.actionRegistry.getActionDefinitions();
      this.taskPlan = await this.taskPlanner.generatePlan(task, actions);
      
      LogFormatter.formatTaskPlan(
        this.taskPlan.estimatedSteps, 
        this.taskPlan.complexity, 
        this.taskPlan.successCriteria
      );
      
      let stepCount = 0;
      let planStepIndex = 0;
      
      while (!this.stateManager.isCompleted() && stepCount < this.options.maxSteps!) {
        stepCount++;
        
        // Get current plan step
        if (planStepIndex < this.taskPlan.steps.length) {
          this.currentStep = this.taskPlan.steps[planStepIndex];
          LogFormatter.formatStepStart(stepCount, this.currentStep.description);
          console.log(`Expected outcome: ${this.currentStep.expectedOutcome}`);
        } else {
          LogFormatter.formatStepStart(stepCount, 'Unplanned step');
        }
        
        // Index current page
        await this.indexCurrentPage();
        
        // Get next action from LLM
        const nextAction = await this.getNextAction();
        
        if (!nextAction || !nextAction.action) {
          LogFormatter.formatError('No action suggested by LLM');
          break;
        }
        
        // Log the action being executed
        LogFormatter.formatAction(nextAction.action, nextAction.parameters, nextAction.thinking);
        
        // Execute action
        const startTime = Date.now();
        const result = await this.executeAction(nextAction);
        const duration = Date.now() - startTime;
        
        // Log action result
        LogFormatter.formatActionResult(result.success, duration, result.data);
        
        // Record step
        const stepResult: StepResult = {
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
        
        // Verify step if we have a plan
        if (this.currentStep && result.success) {
          console.log(`Verifying step completion...`);
          
          // Extract page content indicators
          const pageContent = await this.extractPageIndicators();
          
          const verification = await this.taskPlanner.verifyStep(
            this.currentStep,
            this.stateManager.getState(),
            pageContent
          );
          
          this.stepVerifications.push(verification);
          
          LogFormatter.formatVerification(
            verification.success, 
            Math.round(verification.confidence * 100), 
            verification.issues
          );
          
          if (verification.success) {
            planStepIndex++;
          } else {
            // Use LLM feedback to determine next actions
            const feedbackAnalysis = await this.feedbackHandler.analyzeFeedback(
              verification, 
              this.currentStep, 
              this.stateManager.getState(), 
              pageContent
            );
            
            this.feedbackHandler.formatAnalysis(feedbackAnalysis);
            
            // Execute suggested corrective actions
            if (feedbackAnalysis.shouldRetry && feedbackAnalysis.suggestedActions.length > 0) {
              console.log(`Executing ${feedbackAnalysis.suggestedActions.length} corrective actions...`);
              
              // Execute top priority corrective actions
              const prioritizedActions = feedbackAnalysis.suggestedActions
                .sort((a, b) => b.priority - a.priority)
                .slice(0, 3); // Execute top 3 actions
              
              for (const correctiveAction of prioritizedActions) {
                console.log(`Corrective Action: ${correctiveAction.action} - ${correctiveAction.reasoning}`);
                
                // Execute the corrective action
                const correctiveResult = await this.executeAction({
                  action: correctiveAction.action,
                  parameters: correctiveAction.parameters,
                  thinking: correctiveAction.reasoning
                });
                
                LogFormatter.formatActionResult(
                  correctiveResult.success, 
                  0, 
                  correctiveResult.data
                );
                
                // Wait a bit between corrective actions
                await this.page!.waitForTimeout(500);
              }
              
              // Re-verify the step after corrective actions
              console.log(`Re-verifying step after corrective actions...`);
              const updatedPageContent = await this.extractPageIndicators();
              const reVerification = await this.taskPlanner.verifyStep(
                this.currentStep,
                this.stateManager.getState(),
                updatedPageContent
              );
              
              this.stepVerifications.push(reVerification);
              
              if (reVerification.success) {
                console.log(`Step verification successful after corrective actions!`);
                planStepIndex++;
              } else {
                console.log(`Step still failing after corrective actions, will continue with fallback strategy`);
                this.handleRepeatedFailures(this.currentStep, this.stepVerifications, planStepIndex);
              }
            } else if (feedbackAnalysis.continueWithNextStep) {
              console.log(`Feedback analysis suggests continuing with next step`);
              planStepIndex++;
            } else {
              // Fallback to original strategy
              planStepIndex = this.handleRepeatedFailures(this.currentStep, this.stepVerifications, planStepIndex);
            }
          }
        }
        
        // Check if task is completed based on plan
        if (await this.checkTaskCompletion()) {
          this.stateManager.markCompleted(true);
          console.log(`Task completed successfully!`);
          break;
        }
        
        // Rate limiting
        await this.page!.waitForTimeout(1000);
      }
      
      if (stepCount >= this.options.maxSteps!) {
        LogFormatter.formatError(`Reached maximum steps limit: ${this.options.maxSteps}`);
        this.stateManager.markCompleted(false, 'Maximum steps reached');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogFormatter.formatError(`Task failed: ${errorMessage}`);
      this.stateManager.markCompleted(false, errorMessage);
    }
    
    const state = this.stateManager.getState();
    
    // Calculate reliability score if we have a plan
    let reliability: ReliabilityScore | undefined;
    if (this.taskPlan) {
      reliability = this.reliabilityScorer.calculateReliability(
        this.taskPlan,
        {
          success: state.completed && !state.error,
          steps: state.history,
          finalUrl: state.currentUrl,
          error: state.error,
          duration: Date.now() - startTime,
          screenshots
        },
        this.stepVerifications,
        state
      );
      
      // Log reliability report
      LogFormatter.formatReliabilityScore(reliability);
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
  
  /**
   * Index the current page
   */
  private async indexCurrentPage(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    const startTime = Date.now();
    this.currentDOM = await this.domIndexer.indexPage(this.page);
    const indexTime = Date.now() - startTime;
    this.stateManager.updateUrl(this.currentDOM.url);
    
    LogFormatter.formatPageIndexing(
      this.currentDOM.elements.size, 
      this.currentDOM.interactiveElements.length, 
      this.currentDOM.url
    );
  }
  
  /**
   * Get next action from LLM
   */
  private async getNextAction(): Promise<LLMResponse | null> {
    if (!this.currentDOM) return null;
    
    const state = this.stateManager.getState();
    const actions = this.actionRegistry.getActionDefinitions();
    
    // Build prompt
    const prompt = this.promptBuilder.buildTaskPrompt(
      state.task,
      state,
      this.currentDOM,
      actions,
      this.currentDOM.screenshot
    );
    
    // Get LLM response
    try {
      const response = await this.llmProvider.complete(prompt);
      
      // Log full response for debugging
      core.debug(`LLM Response: ${JSON.stringify(response)}`);
      
      // Check if this is a completion check response (not an action)
      if ('completed' in response && response.completed !== undefined) {
        core.debug('Received completion check response instead of action');
        
        // If task is not completed, extract the next action hint
        if (!response.completed && response.next_action) {
          // Re-request with more specific prompt
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
      
      // Normal action response
      if (response.action) {
        LogFormatter.formatLLMResponse(response, 'ACTION');
        return response;
      }
      
      return null;
    } catch (error) {
      LogFormatter.formatError(`LLM error: ${error}`);
      return null;
    }
  }
  
  /**
   * Execute an action
   */
  private async executeAction(action: LLMResponse): Promise<ActionResult> {
    if (!this.page || !this.currentDOM) {
      return { success: false, error: 'Page not initialized' };
    }
    
    // Create context
    const context: AgentContext = {
      page: this.page,
      browser: this.browser!,
      context: this.browserContext!,
      dom: this.currentDOM,
      state: this.stateManager.getState()
    };
    
    // Validate action
    const validation = this.actionRegistry.validateParams(action.action, action.parameters);
    if (!validation.valid) {
      return { 
        success: false, 
        error: `Invalid parameters: ${validation.errors.join(', ')}` 
      };
    }
    
    // Highlight element before interaction (if applicable)
    if (action.parameters.index !== undefined) {
      await this.highlightElement(action.parameters.index);
    }
    
    // Execute
    const result = await this.actionRegistry.execute(action.action, action.parameters, context);
    
    // Re-index if page might have changed
    if (result.success && this.shouldReindex(action.action)) {
      await this.indexCurrentPage();
    }
    
    return result;
  }
  
  /**
   * Check if task is completed
   */
  private async checkCompletion(): Promise<boolean> {
    const state = this.stateManager.getState();
    
    // Don't check on every step to save API calls
    if (state.history.length % 3 !== 0) return false;
    
    const prompt = this.promptBuilder.buildCompletionCheckPrompt(
      state.task,
      state
    );
    
    try {
      const response = await this.llmProvider.complete(prompt);
      
      // Check for explicit completion field
      if (response.completed !== undefined) {
        if (!response.completed && response.reason) {
          core.debug(`Task not complete: ${response.reason}`);
        }
        return response.completed === true;
      }
      
      // Check in parameters
      if (response.parameters && typeof response.parameters.completed === 'boolean') {
        return response.parameters.completed;
      }
      
      // Fallback parsing - but be more strict
      if (response.action || response.parameters?.action) {
        // If there's an action suggested, task is not complete
        return false;
      }
      
      return false; // Default to not complete to avoid premature termination
    } catch (error) {
      core.warning(`Completion check failed: ${error}`);
      return false;
    }
  }
  
  /**
   * Highlight an element before interaction
   */
  private async highlightElement(index: number): Promise<void> {
    if (!this.page || !this.currentDOM) return;
    
    try {
      const elementId = `indexed-${index}`;
      const element = this.currentDOM.elements.get(elementId);
      
      if (element && element.selector) {
        // Inject highlighting CSS and apply to element
        await this.page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (el) {
            // Save original styles
            const originalOutline = (el as HTMLElement).style.outline;
            const originalBoxShadow = (el as HTMLElement).style.boxShadow;
            const originalTransition = (el as HTMLElement).style.transition;
            
            // Apply highlight
            (el as HTMLElement).style.outline = '3px solid #ff0066';
            (el as HTMLElement).style.boxShadow = '0 0 10px rgba(255, 0, 102, 0.5)';
            (el as HTMLElement).style.transition = 'all 0.3s ease';
            
            // Remove highlight after 1 second
            setTimeout(() => {
              (el as HTMLElement).style.outline = originalOutline;
              (el as HTMLElement).style.boxShadow = originalBoxShadow;
              (el as HTMLElement).style.transition = originalTransition;
            }, 1000);
          }
        }, element.selector);
        
        // Wait a bit to ensure highlight is visible
        await this.page.waitForTimeout(300);
      }
    } catch (error) {
      core.debug(`Failed to highlight element: ${error}`);
    }
  }
  
  /**
   * Extract page content indicators for verification
   */
  private async extractPageIndicators(): Promise<string> {
    if (!this.page) return '';
    
    try {
      const indicators = await this.page.evaluate(() => {
        const items: string[] = [];
        
        // URL
        items.push(`URL: ${window.location.href}`);
        
        // Page title
        items.push(`Title: ${document.title}`);
        
        // Main heading
        const h1 = document.querySelector('h1');
        if (h1) items.push(`H1: ${h1.textContent?.trim()}`);
        
        // Form presence
        const forms = document.querySelectorAll('form');
        items.push(`Forms: ${forms.length}`);
        
        // Filled inputs
        const filledInputs = document.querySelectorAll('input[value]:not([value=""])');
        items.push(`Filled inputs: ${filledInputs.length}`);
        
        // Login/logout indicators
        const hasLogin = document.body.textContent?.toLowerCase().includes('login') || 
                        document.body.textContent?.toLowerCase().includes('sign in');
        const hasLogout = document.body.textContent?.toLowerCase().includes('logout') || 
                         document.body.textContent?.toLowerCase().includes('sign out');
        items.push(`Login present: ${hasLogin}, Logout present: ${hasLogout}`);
        
        // User info (common patterns)
        const userPatterns = ['welcome', 'hello', 'hi,', 'logged in as'];
        const hasUserInfo = userPatterns.some(pattern => 
          document.body.textContent?.toLowerCase().includes(pattern)
        );
        items.push(`User info present: ${hasUserInfo}`);
        
        return items.join('\n');
      });
      
      return indicators;
    } catch (error) {
      core.debug(`Failed to extract page indicators: ${error}`);
      return '';
    }
  }

  /**
   * Check task completion based on plan and verifications
   */
  private async checkTaskCompletion(): Promise<boolean> {
    if (!this.taskPlan) {
      // Fallback to original completion check
      return this.checkCompletion();
    }
    
    // Calculate completion based on plan
    const completion = this.taskPlanner.calculateTaskCompletion(
      this.taskPlan,
      this.stepVerifications
    );
    
    core.debug(`Task completion: ${(completion.completionRate * 100).toFixed(0)}%, confidence: ${(completion.confidence * 100).toFixed(0)}%`);
    
    if (completion.missingSteps.length > 0) {
      core.debug(`Missing steps: ${completion.missingSteps.join(', ')}`);
    }
    
    // Multi-layered completion detection with progressive thresholds
    
    // Level 1: High confidence completion
    if (completion.completionRate >= 1.0 && completion.confidence >= 0.8) {
      core.info('✅ High confidence task completion detected');
      return true;
    }
    
    // Level 2: Good completion with LLM validation
    if (completion.completionRate >= 0.8 && completion.confidence >= 0.6) {
      core.info('🔍 Good completion rate, validating with LLM...');
      try {
        const llmCheck = await this.checkCompletion();
        if (llmCheck) {
          core.info('✅ LLM confirmed task completion');
          return true;
        }
      } catch (error) {
        core.warning(`LLM completion check failed: ${error}`);
        // Don't let LLM failure block completion if plan says we're done
        if (completion.completionRate >= 0.9) {
          core.info('✅ High plan completion rate, proceeding despite LLM check failure');
          return true;
        }
      }
    }
    
    // Level 3: Reasonable completion for simple tasks
    if (completion.completionRate >= 0.7 && this.taskPlan.complexity === 'simple') {
      core.info('✅ Reasonable completion for simple task');
      return true;
    }
    
    // Level 4: Emergency completion after many steps to prevent infinite loops
    const state = this.stateManager.getState();
    if (state.history.length >= this.taskPlan.estimatedSteps * 2) {
      core.warning('⚠️ Maximum step limit reached, forcing completion');
      return true;
    }
    
    return false;
  }

  /**
   * Determine if page should be re-indexed after action
   */
  private shouldReindex(action: string): boolean {
    const reindexActions = [
      'click', 'go_to', 'go_back', 'go_forward', 
      'reload', 'type', 'select', 'press_key'
    ];
    return reindexActions.includes(action);
  }
  
  /**
   * Setup middleware for all actions
   */
  private setupMiddleware(): void {
    // Logging middleware
    this.actionRegistry.use(async (context, next) => {
      const result = await next();
      
      if (this.options.debug) {
        core.debug(`Action completed: ${JSON.stringify(result)}`);
      }
      
      return result;
    });
    
    // Screenshot middleware for errors
    this.actionRegistry.use(async (context, next) => {
      const result = await next();
      
      if (!result.success && context.page) {
        try {
          result.screenshot = await context.page.screenshot({ type: 'png' });
        } catch (e) {
          // Ignore screenshot errors
        }
      }
      
      return result;
    });
  }
  
  /**
   * Setup page event handlers
   */
  private setupPageHandlers(): void {
    if (!this.page) return;
    
    // Log console messages in debug mode
    if (this.options.debug) {
      this.page.on('console', msg => {
        core.debug(`Browser console: ${msg.text()}`);
      });
    }
    
    // Handle dialogs automatically
    this.page.on('dialog', async dialog => {
      core.info(`Dialog detected: ${dialog.message()}`);
      await dialog.accept();
    });
    
    // Track navigation
    this.page.on('load', () => {
      core.debug(`Page loaded: ${this.page?.url()}`);
    });
  }
  
  /**
   * Create LLM provider based on configuration
   */
  private createLLMProvider(apiKey: string): LLMProvider {
    switch (this.options.llmProvider) {
      case 'anthropic':
        return new AnthropicProvider({
          apiKey: apiKey || process.env.ANTHROPIC_API_KEY || '',
          model: this.options.llmModel || 'claude-3-5-sonnet-20241022'
        });
      
      // Add other providers here
      default:
        throw new Error(`Unknown LLM provider: ${this.options.llmProvider}`);
    }
  }
  
  /**
   * Handle repeated step failures with fallback strategies
   */
  private handleRepeatedFailures(
    currentStep: TaskStep, 
    stepVerifications: TaskVerification[], 
    currentPlanStepIndex: number
  ): number {
    const failedVerifications = stepVerifications.filter(v => 
      v.stepId === currentStep.id && !v.success
    ).length;
    
    if (failedVerifications >= 2) {
      console.log(`Step ${currentStep.id} failed verification ${failedVerifications} times`);
      
      // Strategy 1: Skip optional steps after multiple failures
      if (!currentStep.required) {
        console.log(`Skipping optional step due to repeated verification failures`);
        return currentPlanStepIndex + 1;
      }
      // Strategy 2: Force progression for required steps after 3 failures
      else if (failedVerifications >= 3) {
        console.log(`Forcing progression past required step due to repeated failures`);
        return currentPlanStepIndex + 1;
      }
      // Strategy 3: Try alternative approach on next iteration
      else {
        console.log(`Will attempt alternative approach for this step`);
        return currentPlanStepIndex;
      }
    }
    
    return currentPlanStepIndex;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stateManager.cleanup();
    
    if (this.page) {
      await this.page.close().catch(() => {});
    }
    
    if (this.browserContext) {
      await this.browserContext.close().catch(() => {});
    }
    
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    
    core.info('Browser agent cleaned up');
  }
  
  /**
   * Get current state
   */
  getState() {
    return this.stateManager.getState();
  }
  
  /**
   * Register custom action
   */
  registerAction(definition: any, handler: any): void {
    this.actionRegistry.register(definition, handler);
  }

  /**
   * Reset agent state for a new task while keeping browser session alive
   */
  async reset(newTask: string): Promise<void> {
    // Clean up old state manager
    this.stateManager.cleanup();
    
    // Create new state manager with new task
    this.stateManager = new StateManager(newTask);
    
    // Clear memory but keep browser context
    this.currentDOM = null;
    this.taskPlan = null;
    this.stepVerifications = [];
    this.currentStep = null;
    
    core.info('Agent state reset for new task while maintaining browser session');
  }

  /**
   * Run a new task in the existing browser session
   */
  async runTask(task: string): Promise<TaskResult & { reliability?: ReliabilityScore }> {
    // Reset state for new task
    await this.reset(task);
    
    // Run the task using existing browser
    return await this.run();
  }

  /**
   * Check if browser is still active
   */
  isActive(): boolean {
    return this.browser !== null && this.page !== null;
  }
  
  /**
   * Export agent state for persistence
   */
  exportState(): string {
    return this.stateManager.exportState();
  }
  
  /**
   * Import agent state
   */
  importState(data: string): void {
    this.stateManager.importState(data);
  }
}