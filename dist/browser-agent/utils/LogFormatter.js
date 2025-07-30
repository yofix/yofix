"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogFormatter = void 0;
class LogFormatter {
    static formatStepStart(stepNumber, description) {
        this.currentStep = stepNumber;
        console.log(`\n<pre>`);
        console.log(`=== STEP ${stepNumber}: ${description} ===`);
        console.log(`</pre>`);
    }
    static formatStepEnd(success, duration) {
        const status = success ? 'SUCCESS' : 'FAILED';
        console.log(`<pre>Step Result: ${status} (${duration}ms)</pre>\n`);
    }
    static formatAction(action, params, thinking) {
        console.log(`<pre>`);
        console.log(`ACTION: ${action}`);
        if (thinking) {
            console.log(`THINKING: ${thinking}`);
        }
        console.log(`PARAMS: ${JSON.stringify(params, null, 2)}`);
        console.log(`</pre>`);
    }
    static formatActionResult(success, duration, data) {
        const status = success ? 'SUCCESS' : 'FAILED';
        console.log(`<pre>`);
        console.log(`RESULT: ${status} (${duration}ms)`);
        if (data) {
            console.log(`DATA: ${JSON.stringify(data, null, 2)}`);
        }
        console.log(`</pre>`);
    }
    static formatVerification(success, confidence, issues) {
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
    static formatDOMInfo(totalElements, interactiveElements, indexTime) {
        console.log(`<pre>DOM: ${totalElements} elements, ${interactiveElements} interactive (${indexTime}ms)</pre>`);
    }
    static formatTaskPlan(steps, complexity, criteria) {
        console.log(`\n<pre>`);
        console.log(`TASK PLAN: ${steps} steps, ${complexity} complexity`);
        console.log(`SUCCESS CRITERIA:`);
        criteria.forEach((criterion) => {
            console.log(`  - ${criterion}`);
        });
        console.log(`</pre>\n`);
    }
    static formatTaskCompletion(success, score, completeness, confidence) {
        console.log(`\n<pre>`);
        console.log(`TASK ${success ? 'COMPLETED' : 'FAILED'}`);
        console.log(`Overall Score: ${score}%`);
        console.log(`Completeness: ${completeness}%`);
        console.log(`Confidence: ${confidence}%`);
        console.log(`</pre>\n`);
    }
    static formatLLMResponse(response, type) {
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
    static formatError(error, context) {
        console.log(`<pre>`);
        console.log(`ERROR${context ? ` [${context}]` : ''}: ${error}`);
        console.log(`</pre>`);
    }
    static formatDebug(message) {
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
            console.log(`<pre>DEBUG: ${message}</pre>`);
        }
    }
    static formatAgentStart(agentType, task) {
        console.log(`\n<pre>`);
        console.log(`${agentType.toUpperCase()} AGENT STARTING`);
        console.log(`TASK: ${task}`);
        console.log(`</pre>\n`);
    }
    static formatBrowserInit(headless, viewport) {
        console.log(`<pre>`);
        console.log(`BROWSER INITIALIZATION:`);
        console.log(`  Mode: ${headless ? 'HEADLESS' : 'VISIBLE'}`);
        console.log(`  Viewport: ${viewport.width}x${viewport.height}`);
        console.log(`  Status: Ready`);
        console.log(`</pre>`);
    }
    static formatPageIndexing(totalElements, interactiveElements, url) {
        console.log(`<pre>`);
        console.log(`PAGE INDEXING:`);
        console.log(`  URL: ${url}`);
        console.log(`  Total Elements: ${totalElements}`);
        console.log(`  Interactive Elements: ${interactiveElements}`);
        console.log(`  Status: Complete`);
        console.log(`</pre>`);
    }
    static formatLLMRequest(prompt, provider) {
        const truncatedPrompt = prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt;
        console.log(`<pre>`);
        console.log(`LLM REQUEST:`);
        console.log(`  Provider: ${provider}`);
        console.log(`  Prompt: ${truncatedPrompt}`);
        console.log(`  Status: Waiting for response...`);
        console.log(`</pre>`);
    }
    static formatReliabilityScore(score) {
        console.log(`\n<pre>`);
        console.log(`RELIABILITY REPORT:`);
        console.log(`  Overall Score: ${(score.overall * 100).toFixed(1)}%`);
        console.log(`  Task Completeness: ${(score.factors.taskCompleteness * 100).toFixed(1)}%`);
        console.log(`  Verification Confidence: ${(score.factors.verificationConfidence * 100).toFixed(1)}%`);
        if (score.issues && score.issues.length > 0) {
            console.log(`  Issues:`);
            score.issues.forEach((issue) => {
                console.log(`    - ${issue}`);
            });
        }
        console.log(`</pre>\n`);
    }
    static formatElementSelection(candidates) {
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
exports.LogFormatter = LogFormatter;
LogFormatter.indent = 0;
LogFormatter.currentStep = 0;
