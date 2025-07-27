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
exports.BrowserUseAdapter = void 0;
exports.runYoFixWithBrowserUse = runYoFixWithBrowserUse;
const child_process_1 = require("child_process");
const core = __importStar(require("@actions/core"));
class BrowserUseAdapter {
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        const pythonScript = `
import asyncio
import json
import sys
from browser_use import Agent, Browser
from anthropic import AsyncAnthropic

class YoFixBrowserUse:
    def __init__(self, api_key):
        self.client = AsyncAnthropic(api_key=api_key)
        
    async def execute_task(self, task_description):
        agent = Agent(
            task=task_description,
            llm=self.client,
            browser=Browser(headless=${this.config.headless})
        )
        result = await agent.run()
        return json.dumps(result)

# Service loop
async def main():
    service = YoFixBrowserUse("${this.config.claudeApiKey}")
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        task = json.loads(line)
        result = await service.execute_task(task['description'])
        print(result)
        sys.stdout.flush()

asyncio.run(main())
`;
        this.pythonProcess = (0, child_process_1.spawn)('python', ['-c', pythonScript]);
    }
    async login(url, email, password) {
        const task = `
      Navigate to ${url} and login with:
      - Email: ${email}
      - Password: ${password}
      
      Handle any login flow type (OAuth, multi-step, captcha).
      Return success status.
    `;
        const result = await this.executeTask(task);
        return result.includes('success');
    }
    async testVisualRegression(url, routeName) {
        const task = `
      Analyze the page at ${url} for visual issues:
      
      1. Check for overlapping elements
      2. Verify text is not cut off or overflowing
      3. Ensure images are loading properly
      4. Test responsive behavior by resizing
      5. Look for contrast and accessibility issues
      6. Take screenshots of any problems found
      
      For each issue found:
      - Describe the problem clearly
      - Rate severity (critical/warning/info)
      - Suggest a fix if possible
      - Include a screenshot
      
      Return structured JSON with all findings.
    `;
        const result = await this.executeTask(task);
        return this.parseVisualResult(result);
    }
    async compareWithBaseline(currentUrl, baselineScreenshot) {
        const task = `
      Compare the current page at ${currentUrl} with the baseline screenshot.
      
      Identify:
      1. Layout changes
      2. Style differences
      3. Missing or new elements
      4. Text changes
      5. Color/theme variations
      
      Categorize changes as:
      - Intentional improvements
      - Potential regressions
      - Neutral changes
      
      Provide detailed analysis with annotated screenshots.
    `;
        return await this.executeTask(task);
    }
    async generateFix(issue, pageContext) {
        const task = `
      Given this visual issue: ${issue}
      On a page with context: ${pageContext}
      
      Generate a code fix that:
      1. Solves the visual problem
      2. Maintains existing functionality
      3. Follows the project's code style
      4. Is framework-appropriate (React/Vue/etc)
      
      Return the fix as code with explanation.
    `;
        return await this.executeTask(task);
    }
    async executeTask(taskDescription) {
        return new Promise((resolve, reject) => {
            this.pythonProcess.stdin.write(JSON.stringify({ description: taskDescription }) + '\n');
            this.pythonProcess.stdout.once('data', (data) => {
                try {
                    const result = JSON.parse(data.toString());
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
        });
    }
    parseVisualResult(result) {
        return {
            success: !result.issues || result.issues.length === 0,
            issues: result.issues || [],
            screenshots: result.screenshots || {}
        };
    }
    async cleanup() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
        }
    }
}
exports.BrowserUseAdapter = BrowserUseAdapter;
async function runYoFixWithBrowserUse(config) {
    const adapter = new BrowserUseAdapter({
        claudeApiKey: config.claudeApiKey,
        headless: true
    });
    await adapter.initialize();
    try {
        if (config.auth) {
            await adapter.login(config.previewUrl, config.auth.email, config.auth.password);
        }
        for (const route of config.routes) {
            const url = `${config.previewUrl}${route}`;
            const result = await adapter.testVisualRegression(url, route);
            if (!result.success) {
                core.warning(`Found ${result.issues.length} issues on ${route}`);
                for (const issue of result.issues) {
                    if (issue.severity === 'critical') {
                        const fix = await adapter.generateFix(issue.description, route);
                        core.info(`Suggested fix: ${fix}`);
                    }
                }
            }
        }
    }
    finally {
        await adapter.cleanup();
    }
}
