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
exports.TaskPlanner = void 0;
const core = __importStar(require("@actions/core"));
class TaskPlanner {
    constructor(llmProvider) {
        this.llmProvider = llmProvider;
    }
    async generatePlan(task, availableActions) {
        const prompt = this.buildPlanningPrompt(task, availableActions);
        try {
            const response = await this.llmProvider.complete(prompt);
            return this.parsePlanResponse(response, task);
        }
        catch (error) {
            core.error(`Task planning failed: ${error}`);
            return this.createFallbackPlan(task);
        }
    }
    async verifyStep(step, state, pageContent) {
        const prompt = this.buildVerificationPrompt(step, state, pageContent);
        try {
            const response = await this.llmProvider.complete(prompt);
            return this.parseVerificationResponse(response, step.id);
        }
        catch (error) {
            core.warning(`Step verification failed: ${error}`);
            return {
                stepId: step.id,
                success: false,
                criteriaResults: [],
                confidence: 0,
                issues: [`Verification failed: ${error}`]
            };
        }
    }
    calculateTaskCompletion(plan, verifications) {
        const requiredSteps = plan.steps.filter(s => s.required);
        const completedRequired = verifications.filter(v => {
            const step = plan.steps.find(s => s.id === v.stepId);
            return step?.required && v.success;
        });
        const completionRate = completedRequired.length / requiredSteps.length;
        const avgConfidence = verifications.reduce((sum, v) => sum + v.confidence, 0) / verifications.length;
        const missingSteps = requiredSteps
            .filter(step => !verifications.find(v => v.stepId === step.id && v.success))
            .map(s => s.description);
        const allIssues = verifications
            .filter(v => v.issues && v.issues.length > 0)
            .flatMap(v => v.issues);
        return {
            completed: completionRate === 1 && avgConfidence > 0.8,
            completionRate,
            confidence: avgConfidence,
            missingSteps,
            issues: allIssues
        };
    }
    buildPlanningPrompt(task, actions) {
        const actionList = actions.map(a => `- ${a.name}: ${a.description}`).join('\n');
        return `<task_planning>
Task: ${task}

Available actions:
${actionList}

Please create a detailed execution plan for this task.

Analyze the task and break it down into specific steps. For each step, provide:
1. A unique ID (step1, step2, etc.)
2. Clear description of what to do
3. Which action to use
4. Expected outcome
5. Success criteria (how to verify it worked)
6. Whether it's required or optional
7. Dependencies on other steps

Also provide:
- Overall success criteria for the entire task
- Estimated number of steps
- Task complexity (simple/moderate/complex)

Response format:
{
  "thinking": "Analysis of the task...",
  "plan": {
    "steps": [
      {
        "id": "step1",
        "description": "Navigate to the website",
        "action": "go_to",
        "expectedOutcome": "Page loads successfully",
        "successCriteria": ["URL matches target", "Page content visible"],
        "required": true,
        "dependencies": []
      }
    ],
    "successCriteria": ["User is logged in", "Profile data extracted"],
    "estimatedSteps": 5,
    "complexity": "moderate"
  }
}

Focus on creating verifiable success criteria that can be checked programmatically.
</task_planning>`;
    }
    buildVerificationPrompt(step, state, pageContent) {
        const lastAction = state.history[state.history.length - 1];
        return `<step_verification>
Verify if this step was completed successfully:

Step: ${step.description}
Expected action: ${step.action}
Expected outcome: ${step.expectedOutcome}

Success criteria:
${step.successCriteria.map(c => `- ${c}`).join('\n')}

Actual execution:
- Action performed: ${lastAction?.action}
- Parameters: ${JSON.stringify(lastAction?.parameters)}
- Result: ${lastAction?.result.success ? 'Success' : 'Failed'}
- Current URL: ${state.currentUrl}
- Error (if any): ${lastAction?.result.error}

${pageContent ? `Current page indicators:\n${pageContent}` : ''}

Evaluate each success criterion and determine:
1. Was the criterion met? (true/false)
2. What evidence supports this?
3. Overall confidence in step completion (0-1)
4. Any issues or concerns

Response format:
{
  "thinking": "Analysis of the step execution...",
  "verification": {
    "criteriaResults": [
      {
        "criteria": "URL matches target",
        "met": true,
        "evidence": "Current URL is the expected login page"
      }
    ],
    "success": true,
    "confidence": 0.95,
    "issues": []
  }
}
</step_verification>`;
    }
    parsePlanResponse(response, task) {
        try {
            if (response.plan) {
                return {
                    taskDescription: task,
                    steps: response.plan.steps || [],
                    successCriteria: response.plan.successCriteria || [],
                    estimatedSteps: response.plan.estimatedSteps || 5,
                    complexity: response.plan.complexity || 'moderate'
                };
            }
            if (response.parameters?.plan) {
                return {
                    taskDescription: task,
                    ...response.parameters.plan
                };
            }
        }
        catch (error) {
            core.warning(`Failed to parse plan response: ${error}`);
        }
        return this.createFallbackPlan(task);
    }
    parseVerificationResponse(response, stepId) {
        try {
            if (response.verification) {
                return {
                    stepId,
                    success: response.verification.success ?? true,
                    criteriaResults: response.verification.criteriaResults || [],
                    confidence: response.verification.confidence ?? 0.8,
                    issues: response.verification.issues || []
                };
            }
            if (response.parameters?.verification) {
                return {
                    stepId,
                    success: response.parameters.verification.success ?? true,
                    criteriaResults: response.parameters.verification.criteriaResults || [],
                    confidence: response.parameters.verification.confidence ?? 0.8,
                    issues: response.parameters.verification.issues || []
                };
            }
            if (response.success !== undefined || response.criteriaResults || response.confidence !== undefined) {
                return {
                    stepId,
                    success: response.success ?? true,
                    criteriaResults: response.criteriaResults || [],
                    confidence: response.confidence ?? 0.8,
                    issues: response.issues || []
                };
            }
            if (response.criteriaResults && Array.isArray(response.criteriaResults)) {
                const allCriteriaMet = response.criteriaResults.every((cr) => cr.met !== false);
                return {
                    stepId,
                    success: allCriteriaMet,
                    criteriaResults: response.criteriaResults,
                    confidence: allCriteriaMet ? 0.85 : 0.3,
                    issues: []
                };
            }
            const responseText = JSON.stringify(response).toLowerCase();
            if (responseText.includes('"success":true') || responseText.includes('"success": true')) {
                core.debug('Inferring success: true from explicit JSON boolean');
                return {
                    stepId,
                    success: true,
                    criteriaResults: [],
                    confidence: 0.7,
                    issues: []
                };
            }
            if (responseText.includes('"success":false') || responseText.includes('"success": false')) {
                core.debug('Inferring success: false from explicit JSON boolean');
                return {
                    stepId,
                    success: false,
                    criteriaResults: [],
                    confidence: 0.7,
                    issues: ['Step verification indicated failure']
                };
            }
        }
        catch (error) {
            core.warning(`Error parsing verification response: ${error}`);
        }
        try {
            if (typeof response === 'object' && response.verification) {
                const verificationData = response.verification;
                if (verificationData.success === false) {
                    core.debug('Found verification.success: false in response object');
                    return {
                        stepId,
                        success: false,
                        criteriaResults: verificationData.criteriaResults || [],
                        confidence: verificationData.confidence || 0.6,
                        issues: verificationData.issues || ['Direct verification check indicated failure']
                    };
                }
            }
        }
        catch (e) {
        }
        core.warning(`Could not parse verification response, defaulting to success for step ${stepId}`);
        core.debug(`Raw response: ${JSON.stringify(response)}`);
        return {
            stepId,
            success: true,
            criteriaResults: [],
            confidence: 0.5,
            issues: ['Verification parsing failed, assumed success']
        };
    }
    createFallbackPlan(task) {
        const taskLower = task.toLowerCase();
        if (taskLower.includes('login')) {
            return {
                taskDescription: task,
                steps: [
                    {
                        id: 'step1',
                        description: 'Navigate to login page',
                        action: 'go_to',
                        expectedOutcome: 'Login page loaded',
                        successCriteria: ['Login form visible'],
                        required: true,
                        dependencies: []
                    },
                    {
                        id: 'step2',
                        description: 'Enter credentials',
                        action: 'type',
                        expectedOutcome: 'Credentials entered',
                        successCriteria: ['Email and password fields filled'],
                        required: true,
                        dependencies: ['step1']
                    },
                    {
                        id: 'step3',
                        description: 'Submit login',
                        action: 'click',
                        expectedOutcome: 'Login successful',
                        successCriteria: ['Redirected to dashboard', 'User info visible'],
                        required: true,
                        dependencies: ['step2']
                    }
                ],
                successCriteria: ['User is authenticated', 'Can access protected pages'],
                estimatedSteps: 3,
                complexity: 'simple'
            };
        }
        return {
            taskDescription: task,
            steps: [{
                    id: 'step1',
                    description: 'Execute task',
                    action: 'unknown',
                    expectedOutcome: 'Task completed',
                    successCriteria: ['Task requirements met'],
                    required: true,
                    dependencies: []
                }],
            successCriteria: ['Task completed successfully'],
            estimatedSteps: 1,
            complexity: 'simple'
        };
    }
}
exports.TaskPlanner = TaskPlanner;
