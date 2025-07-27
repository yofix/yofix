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
exports.MCPCommandHandler = void 0;
const core = __importStar(require("@actions/core"));
const MCPManager_1 = require("./MCPManager");
const NaturalLanguageParser_1 = require("./NaturalLanguageParser");
const VisualAnalyzer_1 = require("../../core/analysis/VisualAnalyzer");
class MCPCommandHandler {
    constructor(claudeApiKey) {
        this.sessionActive = false;
        this.mcpManager = new MCPManager_1.MCPManager();
        this.nlParser = new NaturalLanguageParser_1.NaturalLanguageParser();
        this.visualAnalyzer = new VisualAnalyzer_1.VisualAnalyzer(claudeApiKey, '');
    }
    async executeBrowserCommand(command, options) {
        try {
            if (!this.sessionActive) {
                await this.mcpManager.initialize({
                    viewport: options?.viewport,
                    headless: true
                });
                this.sessionActive = true;
                if (options?.previewUrl) {
                    await this.mcpManager.executeAction({
                        type: 'navigate',
                        params: { url: options.previewUrl }
                    });
                }
            }
            const actions = await this.nlParser.parse(command);
            if (actions.length === 0) {
                return {
                    success: false,
                    message: `Could not understand command: "${command}"`,
                    data: null
                };
            }
            const results = [];
            for (const action of actions) {
                core.info(`Executing MCP action: ${action.type}`);
                const result = await this.mcpManager.executeAction(action);
                results.push(result);
                if (!result.success) {
                    return {
                        success: false,
                        message: `Failed to ${action.type}: ${result.error}`,
                        data: results
                    };
                }
            }
            const summary = this.generateExecutionSummary(actions, results);
            return {
                success: true,
                message: summary,
                data: {
                    actions: actions,
                    results: results,
                    state: this.mcpManager.getState()
                }
            };
        }
        catch (error) {
            core.error(`MCP command error: ${error}`);
            return {
                success: false,
                message: `Browser automation error: ${error.message}`,
                data: null
            };
        }
    }
    async executeVisualCommand(command) {
        try {
            const screenshotResult = await this.mcpManager.executeAction({
                type: 'screenshot',
                params: { fullPage: false }
            });
            if (!screenshotResult.success || !screenshotResult.data) {
                throw new Error('Failed to capture screenshot');
            }
            const issues = await this.analyzeScreenshot(screenshotResult.data.buffer, command);
            return {
                success: true,
                message: this.formatVisualResults(issues),
                issues: issues,
                screenshot: screenshotResult.data
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Visual verification failed: ${error.message}`,
                issues: [],
                screenshot: null
            };
        }
    }
    async executeTestScenario(scenario) {
        const results = [];
        let allPassed = true;
        try {
            await this.mcpManager.initialize({
                viewport: scenario.viewport,
                headless: true
            });
            this.sessionActive = true;
            if (scenario.startUrl) {
                await this.mcpManager.executeAction({
                    type: 'navigate',
                    params: { url: scenario.startUrl }
                });
            }
            for (const step of scenario.steps) {
                core.info(`Executing test step: ${step.description}`);
                const stepResult = await this.executeTestStep(step);
                results.push(stepResult);
                if (!stepResult.passed) {
                    allPassed = false;
                    if (scenario.stopOnFailure) {
                        break;
                    }
                }
            }
            const report = this.generateTestReport(scenario, results);
            return {
                success: allPassed,
                message: report,
                passed: allPassed,
                results: results,
                duration: this.calculateDuration(results)
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Test scenario failed: ${error.message}`,
                passed: false,
                results: results,
                duration: 0
            };
        }
    }
    async executeTestStep(step) {
        const startTime = Date.now();
        try {
            const actions = await this.nlParser.parse(step.action);
            for (const action of actions) {
                const result = await this.mcpManager.executeAction(action);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }
            if (step.assertion) {
                const assertionResult = await this.verifyAssertion(step.assertion);
                if (!assertionResult.passed) {
                    return {
                        step: step.description,
                        passed: false,
                        error: assertionResult.error,
                        duration: Date.now() - startTime
                    };
                }
            }
            return {
                step: step.description,
                passed: true,
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            return {
                step: step.description,
                passed: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }
    async verifyAssertion(assertion) {
        try {
            const state = this.mcpManager.getState();
            switch (assertion.type) {
                case 'url':
                    const currentUrl = state.url;
                    const expected = assertion.expected;
                    if (!currentUrl.includes(expected)) {
                        return {
                            passed: false,
                            error: `Expected URL to contain "${expected}", but got "${currentUrl}"`
                        };
                    }
                    break;
                case 'visible':
                    const visibleResult = await this.mcpManager.executeAction({
                        type: 'evaluate',
                        params: {
                            script: `
                const element = document.querySelector('${assertion.selector}');
                element && element.offsetParent !== null;
              `
                        }
                    });
                    if (!visibleResult.data) {
                        return {
                            passed: false,
                            error: `Element "${assertion.selector}" is not visible`
                        };
                    }
                    break;
                case 'text':
                    const textResult = await this.mcpManager.executeAction({
                        type: 'evaluate',
                        params: {
                            script: `
                const element = document.querySelector('${assertion.selector}');
                element ? element.textContent : null;
              `
                        }
                    });
                    if (!textResult.data || !textResult.data.includes(assertion.expected)) {
                        return {
                            passed: false,
                            error: `Expected text "${assertion.expected}" not found in element "${assertion.selector}"`
                        };
                    }
                    break;
                case 'custom':
                    if (assertion.script) {
                        const customResult = await this.mcpManager.executeAction({
                            type: 'evaluate',
                            params: { script: assertion.script }
                        });
                        if (!customResult.data) {
                            return {
                                passed: false,
                                error: `Custom assertion failed: ${assertion.description}`
                            };
                        }
                    }
                    break;
            }
            return { passed: true };
        }
        catch (error) {
            return {
                passed: false,
                error: `Assertion error: ${error.message}`
            };
        }
    }
    async analyzeScreenshot(buffer, context) {
        return [];
    }
    generateExecutionSummary(actions, results) {
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        let summary = `## 🤖 Browser Automation Complete\n\n`;
        summary += `Executed ${actions.length} action(s): `;
        summary += `✅ ${successful} successful`;
        if (failed > 0) {
            summary += `, ❌ ${failed} failed`;
        }
        summary += '\n\n### Actions Performed:\n';
        actions.forEach((action, index) => {
            const result = results[index];
            const status = result.success ? '✅' : '❌';
            summary += `${index + 1}. ${status} ${this.describeAction(action)}\n`;
        });
        return summary;
    }
    describeAction(action) {
        switch (action.type) {
            case 'navigate':
                return `Navigate to ${action.params.url}`;
            case 'click':
                return `Click on ${action.params.selector}`;
            case 'type':
                return `Type "${action.params.text}" in ${action.params.selector}`;
            case 'scroll':
                return `Scroll ${action.params.direction} ${action.params.amount || ''}`;
            case 'wait':
                return action.params.selector ?
                    `Wait for ${action.params.selector}` :
                    `Wait ${action.params.timeout}ms`;
            case 'screenshot':
                return `Take screenshot${action.params.fullPage ? ' (full page)' : ''}`;
            case 'hover':
                return `Hover over ${action.params.selector}`;
            default:
                return `${action.type} action`;
        }
    }
    formatVisualResults(issues) {
        if (issues.length === 0) {
            return '✅ No visual issues detected';
        }
        let message = `## 🔍 Visual Issues Found\n\n`;
        message += `Detected ${issues.length} visual issue(s):\n\n`;
        issues.forEach((issue, index) => {
            message += `**${index + 1}. ${issue.type}** (${issue.severity})\n`;
            message += `   ${issue.description}\n`;
            if (issue.location.selector) {
                message += `   Element: \`${issue.location.selector}\`\n`;
            }
            message += '\n';
        });
        return message;
    }
    generateTestReport(scenario, results) {
        const passed = results.filter(r => r.passed).length;
        const failed = results.length - passed;
        const totalDuration = this.calculateDuration(results);
        let report = `## 🧪 Test Scenario: ${scenario.name}\n\n`;
        report += `**Status:** ${failed === 0 ? '✅ PASSED' : '❌ FAILED'}\n`;
        report += `**Duration:** ${totalDuration}ms\n`;
        report += `**Steps:** ${passed}/${results.length} passed\n\n`;
        if (results.length > 0) {
            report += '### Test Steps:\n';
            results.forEach((result, index) => {
                const status = result.passed ? '✅' : '❌';
                report += `${index + 1}. ${status} ${result.step} (${result.duration}ms)\n`;
                if (result.error) {
                    report += `   ⚠️ Error: ${result.error}\n`;
                }
            });
        }
        return report;
    }
    calculateDuration(results) {
        return results.reduce((total, result) => total + result.duration, 0);
    }
    async closeSession() {
        if (this.sessionActive) {
            await this.mcpManager.close();
            this.sessionActive = false;
        }
    }
}
exports.MCPCommandHandler = MCPCommandHandler;
