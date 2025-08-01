"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationFeedbackHandler = void 0;
const LogFormatter_1 = require("../utils/LogFormatter");
class VerificationFeedbackHandler {
    constructor(llmProvider) {
        this.llmProvider = llmProvider;
    }
    async analyzeFeedback(verification, currentStep, state, pageContent) {
        if (verification.success) {
            return {
                shouldRetry: false,
                suggestedActions: [],
                continueWithNextStep: true,
                reasoning: 'Step completed successfully, continue to next step'
            };
        }
        LogFormatter_1.LogFormatter.formatDebug('Analyzing verification feedback for corrective actions...');
        try {
            const prompt = this.buildFeedbackAnalysisPrompt(verification, currentStep, state, pageContent);
            const response = await this.llmProvider.complete(prompt);
            return this.parseFeedbackResponse(response);
        }
        catch (error) {
            LogFormatter_1.LogFormatter.formatError(`Feedback analysis failed: ${error}`);
            return this.createFallbackAnalysis(verification, currentStep);
        }
    }
    extractActionableInsights(verification) {
        const insights = [];
        if (!verification.issues)
            return insights;
        for (const issue of verification.issues) {
            const lowerIssue = issue.toLowerCase();
            if (lowerIssue.includes('only email entered') || lowerIssue.includes('password field')) {
                insights.push('NEED_PASSWORD_INPUT: Password field needs to be filled');
            }
            if (lowerIssue.includes('form submission') || lowerIssue.includes('not yet performed')) {
                insights.push('NEED_FORM_SUBMIT: Login form needs to be submitted');
            }
            if (lowerIssue.includes('not redirected') || lowerIssue.includes('still on login')) {
                insights.push('AWAIT_REDIRECT: Need to wait for page redirect after submission');
            }
            if (lowerIssue.includes('element not found') || lowerIssue.includes('not visible')) {
                insights.push('ELEMENT_MISSING: Target element is not available, may need to wait or scroll');
            }
            if (lowerIssue.includes('wrong element') || lowerIssue.includes('incorrect target')) {
                insights.push('WRONG_TARGET: Different element selection strategy needed');
            }
            if (lowerIssue.includes('page not loaded') || lowerIssue.includes('content not ready')) {
                insights.push('PAGE_NOT_READY: Need additional wait time for page load');
            }
        }
        return insights;
    }
    buildFeedbackAnalysisPrompt(verification, currentStep, state, pageContent) {
        return `
VERIFICATION FEEDBACK ANALYSIS

Current Step: ${currentStep.description}
Expected Outcome: ${currentStep.expectedOutcome}
Step Success: ${verification.success}
Confidence: ${(verification.confidence * 100).toFixed(0)}%

VERIFICATION ISSUES:
${verification.issues?.map(issue => `- ${issue}`).join('\n') || 'None'}

CRITERIA RESULTS:
${verification.criteriaResults?.map(cr => `- ${cr.criteria}: ${cr.met ? 'MET' : 'NOT MET'} (${cr.evidence})`).join('\n') || 'None'}

CURRENT PAGE STATE:
${pageContent || 'No page content available'}

RECENT ACTIONS:
${state.history.slice(-3).map(h => `- ${h.action}: ${JSON.stringify(h.parameters)}`).join('\n')}

Based on this verification feedback, provide corrective action analysis:

1. Should we retry the current step or move forward?
2. What specific actions would fix the identified issues?
3. What is the reasoning behind your recommendations?

Respond in JSON format:
{
  "shouldRetry": boolean,
  "continueWithNextStep": boolean,
  "reasoning": "detailed explanation",
  "suggestedActions": [
    {
      "action": "action_name",
      "parameters": {...},
      "reasoning": "why this action",
      "priority": 1-10
    }
  ]
}
    `.trim();
    }
    parseFeedbackResponse(response) {
        try {
            let analysisData = response;
            if (response.analysis) {
                analysisData = response.analysis;
            }
            if (typeof response === 'string') {
                analysisData = JSON.parse(response);
            }
            return {
                shouldRetry: analysisData.shouldRetry || false,
                suggestedActions: analysisData.suggestedActions || [],
                continueWithNextStep: analysisData.continueWithNextStep || false,
                reasoning: analysisData.reasoning || 'No reasoning provided'
            };
        }
        catch (error) {
            LogFormatter_1.LogFormatter.formatError(`Failed to parse feedback response: ${error}`);
            return {
                shouldRetry: false,
                suggestedActions: [],
                continueWithNextStep: true,
                reasoning: 'Failed to parse LLM feedback, continuing with next step'
            };
        }
    }
    createFallbackAnalysis(verification, currentStep) {
        const insights = this.extractActionableInsights(verification);
        const suggestedActions = [];
        for (const insight of insights) {
            if (insight.startsWith('NEED_PASSWORD_INPUT')) {
                suggestedActions.push({
                    action: 'smart_type',
                    parameters: { field: 'password', text: '[password_value]' },
                    reasoning: 'Password field needs to be filled based on verification feedback',
                    priority: 8
                });
            }
            if (insight.startsWith('NEED_FORM_SUBMIT')) {
                suggestedActions.push({
                    action: 'smart_click',
                    parameters: { target: 'submit' },
                    reasoning: 'Form needs to be submitted based on verification feedback',
                    priority: 9
                });
            }
            if (insight.startsWith('AWAIT_REDIRECT')) {
                suggestedActions.push({
                    action: 'wait',
                    parameters: { seconds: 3 },
                    reasoning: 'Need to wait for page redirect after form submission',
                    priority: 7
                });
            }
        }
        return {
            shouldRetry: suggestedActions.length > 0,
            suggestedActions,
            continueWithNextStep: suggestedActions.length === 0,
            reasoning: `Fallback analysis based on ${insights.length} identified issues`
        };
    }
    formatAnalysis(analysis) {
        console.log(``);
        console.log(`FEEDBACK ANALYSIS:`);
        console.log(`  Should Retry: ${analysis.shouldRetry}`);
        console.log(`  Continue Next Step: ${analysis.continueWithNextStep}`);
        console.log(`  Reasoning: ${analysis.reasoning}`);
        if (analysis.suggestedActions.length > 0) {
            console.log(`  SUGGESTED ACTIONS:`);
            analysis.suggestedActions
                .sort((a, b) => b.priority - a.priority)
                .forEach((action, index) => {
                console.log(`    ${index + 1}. ${action.action} (Priority: ${action.priority})`);
                console.log(`       Parameters: ${JSON.stringify(action.parameters)}`);
                console.log(`       Reasoning: ${action.reasoning}`);
            });
        }
        console.log(``);
    }
}
exports.VerificationFeedbackHandler = VerificationFeedbackHandler;
