import { TaskVerification, TaskStep } from './TaskPlanner';
import { AgentState } from '../types';
import { LLMProvider } from '../llm/providers/LLMProvider';
import { LogFormatter } from '../utils/LogFormatter';
import * as core from '@actions/core';

export interface CorrectiveAction {
  action: string;
  parameters: any;
  reasoning: string;
  priority: number;
}

export interface FeedbackAnalysis {
  shouldRetry: boolean;
  suggestedActions: CorrectiveAction[];
  continueWithNextStep: boolean;
  reasoning: string;
}

export class VerificationFeedbackHandler {
  constructor(private llmProvider: LLMProvider) {}

  /**
   * Analyze verification feedback and suggest corrective actions
   */
  async analyzeFeedback(
    verification: TaskVerification,
    currentStep: TaskStep,
    state: AgentState,
    pageContent?: string
  ): Promise<FeedbackAnalysis> {
    if (verification.success) {
      return {
        shouldRetry: false,
        suggestedActions: [],
        continueWithNextStep: true,
        reasoning: 'Step completed successfully, continue to next step'
      };
    }

    LogFormatter.formatDebug('Analyzing verification feedback for corrective actions...');

    try {
      const prompt = this.buildFeedbackAnalysisPrompt(verification, currentStep, state, pageContent);
      const response = await this.llmProvider.complete(prompt);
      
      return this.parseFeedbackResponse(response);
    } catch (error) {
      LogFormatter.formatError(`Feedback analysis failed: ${error}`);
      return this.createFallbackAnalysis(verification, currentStep);
    }
  }

  /**
   * Extract specific actionable insights from verification issues
   */
  extractActionableInsights(verification: TaskVerification): string[] {
    const insights: string[] = [];
    
    if (!verification.issues) return insights;

    for (const issue of verification.issues) {
      const lowerIssue = issue.toLowerCase();
      
      // Login-specific insights
      if (lowerIssue.includes('only email entered') || lowerIssue.includes('password field')) {
        insights.push('NEED_PASSWORD_INPUT: Password field needs to be filled');
      }
      
      if (lowerIssue.includes('form submission') || lowerIssue.includes('not yet performed')) {
        insights.push('NEED_FORM_SUBMIT: Login form needs to be submitted');
      }
      
      if (lowerIssue.includes('not redirected') || lowerIssue.includes('still on login')) {
        insights.push('AWAIT_REDIRECT: Need to wait for page redirect after submission');
      }
      
      // Element interaction insights
      if (lowerIssue.includes('element not found') || lowerIssue.includes('not visible')) {
        insights.push('ELEMENT_MISSING: Target element is not available, may need to wait or scroll');
      }
      
      if (lowerIssue.includes('wrong element') || lowerIssue.includes('incorrect target')) {
        insights.push('WRONG_TARGET: Different element selection strategy needed');
      }
      
      // Page state insights
      if (lowerIssue.includes('page not loaded') || lowerIssue.includes('content not ready')) {
        insights.push('PAGE_NOT_READY: Need additional wait time for page load');
      }
    }
    
    return insights;
  }

  private buildFeedbackAnalysisPrompt(
    verification: TaskVerification,
    currentStep: TaskStep,
    state: AgentState,
    pageContent?: string
  ): string {
    return `
VERIFICATION FEEDBACK ANALYSIS

Current Step: ${currentStep.description}
Expected Outcome: ${currentStep.expectedOutcome}
Step Success: ${verification.success}
Confidence: ${(verification.confidence * 100).toFixed(0)}%

VERIFICATION ISSUES:
${verification.issues?.map(issue => `- ${issue}`).join('\n') || 'None'}

CRITERIA RESULTS:
${verification.criteriaResults?.map(cr => 
  `- ${cr.criteria}: ${cr.met ? 'MET' : 'NOT MET'} (${cr.evidence})`
).join('\n') || 'None'}

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

  private parseFeedbackResponse(response: any): FeedbackAnalysis {
    try {
      // Handle different response formats
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
    } catch (error) {
      LogFormatter.formatError(`Failed to parse feedback response: ${error}`);
      return {
        shouldRetry: false,
        suggestedActions: [],
        continueWithNextStep: true,
        reasoning: 'Failed to parse LLM feedback, continuing with next step'
      };
    }
  }

  private createFallbackAnalysis(
    verification: TaskVerification,
    currentStep: TaskStep
  ): FeedbackAnalysis {
    const insights = this.extractActionableInsights(verification);
    const suggestedActions: CorrectiveAction[] = [];

    // Create basic corrective actions based on insights
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

  /**
   * Format feedback analysis for logging
   */
  formatAnalysis(analysis: FeedbackAnalysis): void {
    console.log(`<pre>`);
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
    console.log(`</pre>`);
  }
}