"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowExecutor = void 0;
class WorkflowExecutor {
    constructor(agent, actionRegistry) {
        this.agent = agent;
        this.actionRegistry = actionRegistry;
        this.retryAttempts = 3;
        this.selfHealingEnabled = true;
    }
    async executeWorkflow(workflow, variables = {}) {
        const startTime = Date.now();
        const results = [];
        let success = true;
        console.log(`🎬 Executing workflow: ${workflow.name}`);
        for (let i = 0; i < workflow.steps.length; i++) {
            const step = workflow.steps[i];
            const stepResult = await this.executeStep(step, variables, i + 1);
            results.push(stepResult);
            if (!stepResult.success) {
                console.error(`❌ Step ${i + 1} failed: ${step.action}`);
                if (this.selfHealingEnabled) {
                    const healedResult = await this.attemptSelfHealing(step, variables);
                    if (healedResult.success) {
                        console.log(`✅ Self-healing successful for step ${i + 1}`);
                        results[results.length - 1] = healedResult;
                        continue;
                    }
                }
                success = false;
                break;
            }
            console.log(`✓ Step ${i + 1}/${workflow.steps.length}: ${step.action}`);
        }
        workflow.metadata.lastRun = new Date();
        workflow.metadata.successRate = this.calculateSuccessRate(workflow, success);
        workflow.metadata.averageDuration = this.updateAverageDuration(workflow, Date.now() - startTime);
        return {
            taskDescription: workflow.description,
            success,
            failureReason: success ? undefined : 'Workflow execution failed',
            steps: results,
            duration: Date.now() - startTime,
            retries: 0
        };
    }
    async executeStep(step, variables, stepNumber) {
        const parameters = this.interpolateVariables(step.parameters, variables);
        try {
            const action = this.actionRegistry.getAction(step.action);
            if (!action) {
                throw new Error(`Unknown action: ${step.action}`);
            }
            const result = await action.execute(parameters, this.agent.getContext());
            return {
                step: stepNumber,
                action: step.action,
                actionName: step.action,
                description: `Execute ${step.action}`,
                parameters,
                thought: 'Executing recorded workflow step',
                success: true,
                element: result.element,
                screenshot: result.screenshot
            };
        }
        catch (error) {
            return {
                step: stepNumber,
                action: step.action,
                actionName: step.action,
                description: `Execute ${step.action}`,
                parameters,
                thought: 'Step execution failed',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    async attemptSelfHealing(step, variables) {
        console.log('🔧 Attempting self-healing...');
        if (step.selectors && step.selectors.length > 1) {
            for (const selector of step.selectors) {
                const healedParams = {
                    ...step.parameters,
                    selector,
                    index: undefined
                };
                try {
                    const action = this.actionRegistry.getAction(step.action);
                    if (action) {
                        const result = await action.execute(this.interpolateVariables(healedParams, variables), this.agent.getContext());
                        if (result.success) {
                            return {
                                ...result,
                                thought: `Self-healed using alternative selector: ${selector}`
                            };
                        }
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
        const aiTask = `${step.action} on element that was previously: ${JSON.stringify(step.selectors)}`;
        console.log('🤖 Falling back to AI for:', aiTask);
        const aiResult = await this.agent.run(aiTask);
        return {
            step: -1,
            action: step.action,
            actionName: step.action,
            description: aiTask,
            parameters: step.parameters,
            thought: 'AI-based self-healing attempt',
            success: aiResult.success,
            error: aiResult.failureReason
        };
    }
    interpolateVariables(params, variables) {
        const interpolated = {};
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
                const varName = value.slice(2, -2).trim();
                interpolated[key] = variables[varName] || value;
            }
            else {
                interpolated[key] = value;
            }
        }
        return interpolated;
    }
    calculateSuccessRate(workflow, currentSuccess) {
        const previousRate = workflow.metadata.successRate || 0;
        const runs = Math.floor(previousRate * 100);
        return (runs + (currentSuccess ? 1 : 0)) / (runs + 1);
    }
    updateAverageDuration(workflow, currentDuration) {
        const previous = workflow.metadata.averageDuration || currentDuration;
        return (previous + currentDuration) / 2;
    }
}
exports.WorkflowExecutor = WorkflowExecutor;
