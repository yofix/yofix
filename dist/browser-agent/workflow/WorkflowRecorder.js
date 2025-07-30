"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowRecorder = void 0;
class WorkflowRecorder {
    constructor(agent, stateManager) {
        this.agent = agent;
        this.stateManager = stateManager;
        this.recording = false;
        this.currentWorkflow = null;
        this.recordedSteps = [];
    }
    startRecording(name, description) {
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
    recordStep(result, context) {
        if (!this.recording || !this.currentWorkflow)
            return;
        const step = {
            action: result.actionName,
            parameters: result.parameters || {},
            selectors: this.extractSelectors(result),
            screenshot: result.screenshot,
            result: result.success ? 'success' : 'failure',
            timestamp: Date.now()
        };
        this.recordedSteps.push(step);
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
    stopRecording() {
        if (!this.recording || !this.currentWorkflow)
            return null;
        this.recording = false;
        this.currentWorkflow.steps = this.optimizeSteps(this.recordedSteps);
        const workflowPath = `/workflows/${this.currentWorkflow.id}.json`;
        this.stateManager.saveToFile(workflowPath, JSON.stringify(this.currentWorkflow, null, 2));
        const workflow = this.currentWorkflow;
        this.currentWorkflow = null;
        this.recordedSteps = [];
        return workflow;
    }
    extractSelectors(result) {
        const selectors = [];
        if (result.element) {
            if (result.element.id)
                selectors.push(`#${result.element.id}`);
            if (result.element.className)
                selectors.push(`.${result.element.className}`);
            if (result.element.textContent)
                selectors.push(`text="${result.element.textContent}"`);
            if (result.element.index !== undefined)
                selectors.push(`index=${result.element.index}`);
        }
        return selectors;
    }
    optimizeSteps(steps) {
        return steps.filter(step => {
            if (step.action === 'wait' && step.parameters?.duration < 500)
                return false;
            if (step.action === 'hover' && !this.isHoverNecessary(step, steps))
                return false;
            return true;
        });
    }
    isHoverNecessary(hover, allSteps) {
        const hoverIndex = allSteps.indexOf(hover);
        const nextStep = allSteps[hoverIndex + 1];
        return nextStep?.action === 'click';
    }
    loadWorkflow(workflowId) {
        const path = `/workflows/${workflowId}.json`;
        const content = this.stateManager.readFromFile(path);
        return content ? JSON.parse(content) : null;
    }
    listWorkflows() {
        const files = this.stateManager.listFiles('/workflows');
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => this.loadWorkflow(f.replace('/workflows/', '').replace('.json', '')))
            .filter(w => w !== null);
    }
}
exports.WorkflowRecorder = WorkflowRecorder;
