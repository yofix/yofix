import { Agent } from '../core/Agent';
import { StepResult, TaskContext } from '../types';
import { StateManager } from '../core/StateManager';

export interface WorkflowStep {
  action: string;
  parameters: Record<string, any>;
  selectors?: string[];
  screenshot?: string;
  result: 'success' | 'failure';
  timestamp: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  variables: Record<string, any>;
  metadata: {
    created: Date;
    lastRun?: Date;
    successRate: number;
    averageDuration: number;
  };
}

export class WorkflowRecorder {
  private recording = false;
  private currentWorkflow: Workflow | null = null;
  private recordedSteps: WorkflowStep[] = [];
  
  constructor(
    private agent: Agent,
    private stateManager: StateManager
  ) {}

  startRecording(name: string, description: string): void {
    this.recording = true;
    this.recordedSteps = [];
    this.currentWorkflow = {
      id: `workflow_${Date.now()}`,
      name,
      description,
      steps: [],
      variables: {},
      metadata: {
        created: new Date(),
        successRate: 0,
        averageDuration: 0
      }
    };
  }

  recordStep(result: StepResult, context: TaskContext): void {
    if (!this.recording || !this.currentWorkflow) return;

    const step: WorkflowStep = {
      action: result.actionName,
      parameters: result.parameters || {},
      selectors: this.extractSelectors(result),
      screenshot: result.screenshot,
      result: result.success ? 'success' : 'failure',
      timestamp: Date.now()
    };

    this.recordedSteps.push(step);
    
    // Extract variables from form inputs
    if (result.actionName === 'type' && result.parameters?.text) {
      const varName = `input_${this.recordedSteps.length}`;
      this.currentWorkflow.variables[varName] = {
        type: 'string',
        defaultValue: result.parameters.text,
        description: `Input for ${result.parameters.selector || 'field'}`
      };
      step.parameters.text = `{{${varName}}}`;
    }
  }

  stopRecording(): Workflow | null {
    if (!this.recording || !this.currentWorkflow) return null;

    this.recording = false;
    this.currentWorkflow.steps = this.optimizeSteps(this.recordedSteps);
    
    // Save to virtual filesystem
    const workflowPath = `/workflows/${this.currentWorkflow.id}.json`;
    this.stateManager.saveToFile(
      workflowPath, 
      JSON.stringify(this.currentWorkflow, null, 2)
    );

    const workflow = this.currentWorkflow;
    this.currentWorkflow = null;
    this.recordedSteps = [];
    
    return workflow;
  }

  private extractSelectors(result: StepResult): string[] {
    // Extract element selectors for self-healing
    const selectors: string[] = [];
    
    if (result.element) {
      // Add multiple selector strategies
      if (result.element.id) selectors.push(`#${result.element.id}`);
      if (result.element.className) selectors.push(`.${result.element.className}`);
      if (result.element.textContent) selectors.push(`text="${result.element.textContent}"`);
      if (result.element.index !== undefined) selectors.push(`index=${result.element.index}`);
    }
    
    return selectors;
  }

  private optimizeSteps(steps: WorkflowStep[]): WorkflowStep[] {
    // Remove noise and optimize workflow
    return steps.filter(step => {
      // Filter out redundant actions
      if (step.action === 'wait' && step.parameters?.duration < 500) return false;
      if (step.action === 'hover' && !this.isHoverNecessary(step, steps)) return false;
      return true;
    });
  }

  private isHoverNecessary(hover: WorkflowStep, allSteps: WorkflowStep[]): boolean {
    // Check if hover triggers menu or is followed by click
    const hoverIndex = allSteps.indexOf(hover);
    const nextStep = allSteps[hoverIndex + 1];
    return nextStep?.action === 'click';
  }

  loadWorkflow(workflowId: string): Workflow | null {
    const path = `/workflows/${workflowId}.json`;
    const content = this.stateManager.readFromFile(path);
    return content ? JSON.parse(content) : null;
  }

  listWorkflows(): Workflow[] {
    const files = this.stateManager.listFiles('/workflows');
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => this.loadWorkflow(f.replace('/workflows/', '').replace('.json', '')))
      .filter(w => w !== null) as Workflow[];
  }
}