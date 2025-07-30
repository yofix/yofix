import * as core from '@actions/core';

export class LogFormatter {
  private static indent = 0;
  private static currentStep = 0;
  
  static formatStepStart(stepNumber: number, description: string) {
    this.currentStep = stepNumber;
    console.log(`\n<pre>`);
    console.log(`=== STEP ${stepNumber}: ${description} ===`);
    console.log(`</pre>`);
  }
  
  static formatStepEnd(success: boolean, duration: number) {
    const status = success ? 'SUCCESS' : 'FAILED';
    console.log(`<pre>Step Result: ${status} (${duration}ms)</pre>\n`);
  }
  
  static formatAction(action: string, params: any, thinking?: string) {
    console.log(`<pre>`);
    console.log(`ACTION: ${action}`);
    if (thinking) {
      console.log(`THINKING: ${thinking}`);
    }
    console.log(`PARAMS: ${JSON.stringify(params, null, 2)}`);
    console.log(`</pre>`);
  }
  
  static formatActionResult(success: boolean, duration: number, data?: any) {
    const status = success ? 'SUCCESS' : 'FAILED';
    console.log(`<pre>`);
    console.log(`RESULT: ${status} (${duration}ms)`);
    if (data) {
      console.log(`DATA: ${JSON.stringify(data, null, 2)}`);
    }
    console.log(`</pre>`);
  }
  
  static formatVerification(success: boolean, confidence: number, issues?: string[]) {
    console.log(`<pre>`);
    console.log(`VERIFICATION:`);
    console.log(`  SUCCESS: ${success}`);
    console.log(`  CONFIDENCE: ${confidence}%`);
    if (issues && issues.length > 0) {
      console.log(`  ISSUES:`);
      issues.forEach(issue => console.log(`    - ${issue}`));
    }
    console.log(`</pre>`);
  }
  
  static formatDOMInfo(totalElements: number, interactiveElements: number, indexTime: number) {
    console.log(`<pre>DOM: ${totalElements} elements, ${interactiveElements} interactive (${indexTime}ms)</pre>`);
  }
  
  static formatTaskPlan(steps: number, complexity: string, criteria: string[]) {
    console.log(`\n<pre>`);
    console.log(`TASK PLAN: ${steps} steps, ${complexity} complexity`);
    console.log(`SUCCESS CRITERIA:`);
    criteria.forEach((criterion) => {
      console.log(`  - ${criterion}`);
    });
    console.log(`</pre>\n`);
  }
  
  static formatTaskCompletion(success: boolean, score: number, completeness: number, confidence: number) {
    console.log(`\n<pre>`);
    console.log(`TASK ${success ? 'COMPLETED' : 'FAILED'}`);
    console.log(`Overall Score: ${score}%`);
    console.log(`Completeness: ${completeness}%`);
    console.log(`Confidence: ${confidence}%`);
    console.log(`</pre>\n`);
  }
  
  static formatLLMResponse(response: any, type: 'PLANNING' | 'ACTION' | 'VERIFICATION') {
    console.log(`<pre>`);
    console.log(`LLM ${type} RESPONSE:`);
    
    if (response.thinking) {
      console.log(`  THINKING: ${response.thinking}`);
    }
    
    if (response.action) {
      console.log(`  ACTION: ${response.action}`);
      if (response.parameters) {
        console.log(`  PARAMS: ${JSON.stringify(response.parameters, null, 2)}`);
      }
    }
    
    if (response.verification) {
      console.log(`  VERIFICATION: ${response.verification.success ? 'PASS' : 'FAIL'}`);
      console.log(`  CONFIDENCE: ${(response.verification.confidence * 100).toFixed(0)}%`);
    }
    
    console.log(`</pre>`);
  }
  
  static formatError(error: string, context?: string) {
    console.log(`<pre>`);
    console.log(`ERROR${context ? ` [${context}]` : ''}: ${error}`);
    console.log(`</pre>`);
  }
  
  static formatDebug(message: string) {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      console.log(`<pre>DEBUG: ${message}</pre>`);
    }
  }
  
  static formatAgentStart(agentType: string, task: string) {
    console.log(`\n<pre>`);
    console.log(`${agentType.toUpperCase()} AGENT STARTING`);
    console.log(`TASK: ${task}`);
    console.log(`</pre>\n`);
  }
  
  static formatBrowserInit(headless: boolean, viewport: any) {
    console.log(`<pre>`);
    console.log(`BROWSER INITIALIZATION:`);
    console.log(`  Mode: ${headless ? 'HEADLESS' : 'VISIBLE'}`);
    console.log(`  Viewport: ${viewport.width}x${viewport.height}`);
    console.log(`  Status: Ready`);
    console.log(`</pre>`);
  }
  
  static formatPageIndexing(totalElements: number, interactiveElements: number, url: string) {
    console.log(`<pre>`);
    console.log(`PAGE INDEXING:`);
    console.log(`  URL: ${url}`);
    console.log(`  Total Elements: ${totalElements}`);
    console.log(`  Interactive Elements: ${interactiveElements}`);
    console.log(`  Status: Complete`);
    console.log(`</pre>`);
  }
  
  static formatLLMRequest(prompt: string, provider: string) {
    const truncatedPrompt = prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt;
    console.log(`<pre>`);
    console.log(`LLM REQUEST:`);
    console.log(`  Provider: ${provider}`);
    console.log(`  Prompt: ${truncatedPrompt}`);
    console.log(`  Status: Waiting for response...`);
    console.log(`</pre>`);
  }
  
  static formatReliabilityScore(score: any) {
    console.log(`\n<pre>`);
    console.log(`RELIABILITY REPORT:`);
    console.log(`  Overall Score: ${(score.overall * 100).toFixed(1)}%`);
    console.log(`  Task Completeness: ${(score.factors.taskCompleteness * 100).toFixed(1)}%`);
    console.log(`  Verification Confidence: ${(score.factors.verificationConfidence * 100).toFixed(1)}%`);
    if (score.issues && score.issues.length > 0) {
      console.log(`  Issues:`);
      score.issues.forEach((issue: string) => {
        console.log(`    - ${issue}`);
      });
    }
    console.log(`</pre>\n`);
  }
  
  static formatElementSelection(candidates: Array<{element: any, score: number, reasons: string[]}>) {
    console.log(`<pre>`);
    console.log(`ELEMENT SELECTION:`);
    console.log(`TOP CANDIDATES:`);
    
    candidates.slice(0, 3).forEach((candidate, index) => {
      const rank = ['#1', '#2', '#3'][index] || `#${index + 1}`;
      console.log(`  ${rank} [${candidate.element.index}] "${candidate.element.text?.substring(0, 50) || ''}" (Score: ${candidate.score})`);
      console.log(`      Reasons: ${candidate.reasons.join(', ')}`);
    });
    
    console.log(`</pre>`);
  }
}