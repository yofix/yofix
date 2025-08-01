"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMBrowserAgent = void 0;
exports.authenticateWithLLM = authenticateWithLLM;
exports.executeNaturalLanguageTask = executeNaturalLanguageTask;
const sdk_1 = require("@anthropic-ai/sdk");
class LLMBrowserAgent {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.claude = new sdk_1.Anthropic({ apiKey });
    }
    async executeTask(page, task, debug) {
        try {
            if (debug)
                console.log(`🤖 Executing task: ${task}`);
            const snapshot = await this.captureDOMSnapshot(page);
            if (debug)
                console.log(`📸 Captured DOM snapshot with ${snapshot.elements.length} elements`);
            const actions = await this.generateActions(task, snapshot, debug);
            if (debug)
                console.log(`🎯 Generated ${actions.length} actions:`, actions);
            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                if (debug)
                    console.log(`\n⚡ Executing action ${i + 1}/${actions.length}:`, action);
                try {
                    await this.executeAction(page, action);
                    if (debug)
                        console.log(`  ✅ Action completed`);
                }
                catch (error) {
                    if (debug)
                        console.log(`  ❌ Action failed:`, error.message);
                    throw error;
                }
            }
            return true;
        }
        catch (error) {
            if (debug)
                console.error('❌ Task execution failed:', error);
            return false;
        }
    }
    async captureDOMSnapshot(page) {
        const snapshot = await page.evaluate(() => {
            function getCSSPath(el) {
                if (el.id)
                    return `#${el.id}`;
                if (el === document.body)
                    return 'body';
                const siblings = Array.from(el.parentNode?.children || []);
                const index = siblings.indexOf(el) + 1;
                const tag = el.tagName.toLowerCase();
                const path = getCSSPath(el.parentElement);
                return `${path} > ${tag}:nth-child(${index})`;
            }
            const elements = [];
            const interactiveSelectors = [
                'input', 'button', 'a', 'select', 'textarea',
                '[role="button"]', '[role="link"]', '[onclick]',
                'label'
            ];
            interactiveSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0 &&
                        el.offsetParent !== null;
                    const attributes = {};
                    ['id', 'name', 'type', 'placeholder', 'aria-label', 'role', 'href', 'value'].forEach(attr => {
                        const value = el.getAttribute(attr);
                        if (value)
                            attributes[attr] = value;
                    });
                    if (el.className) {
                        attributes.class = typeof el.className === 'string'
                            ? el.className.split(' ').slice(0, 3).join(' ')
                            : '';
                    }
                    elements.push({
                        tag: el.tagName.toLowerCase(),
                        text: (el.textContent || '').trim().substring(0, 100),
                        attributes,
                        visible: isVisible,
                        interactive: true,
                        path: getCSSPath(el)
                    });
                });
            });
            ['h1', 'h2', 'h3', 'label', '.error', '.alert'].forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    const existing = elements.find(e => e.path === getCSSPath(el));
                    if (!existing) {
                        elements.push({
                            tag: el.tagName.toLowerCase(),
                            text: (el.textContent || '').trim().substring(0, 100),
                            attributes: {},
                            visible: true,
                            interactive: false,
                            path: getCSSPath(el)
                        });
                    }
                });
            });
            return {
                url: window.location.href,
                title: document.title,
                elements: elements.filter(el => el.visible)
            };
        });
        return snapshot;
    }
    async generateActions(task, snapshot, debug) {
        const simplifiedElements = snapshot.elements.map(el => {
            const parts = [];
            parts.push(el.tag);
            if (el.attributes.type)
                parts.push(`[type="${el.attributes.type}"]`);
            if (el.attributes.name)
                parts.push(`[name="${el.attributes.name}"]`);
            if (el.attributes.id)
                parts.push(`#${el.attributes.id}`);
            if (el.attributes.placeholder)
                parts.push(`[placeholder="${el.attributes.placeholder}"]`);
            if (el.attributes['aria-label'])
                parts.push(`[aria-label="${el.attributes['aria-label']}"]`);
            if (el.text && el.text.length > 0) {
                parts.push(`"${el.text}"`);
            }
            return parts.join(' ');
        }).join('\n');
        const prompt = `You are an expert web automation agent.

Your goal is to generate a list of DOM-based browser actions to accomplish the user's task using Playwright.  
You are given:

1. A user-defined task
2. A simplified snapshot of the current web page's structure (visible text, DOM elements, attributes)

### Rules:
- Output actions as JSON only, no other text.
- Use Playwright-compatible selectors like \`text=\`, \`input[name=]\`, \`button:has-text()\`, \`[role=]\`, \`[aria-label=]\`.
- Do not guess URLs unless given.
- Each action must include:
  - \`action\`: one of \`click\`, \`fill\`, \`goto\`, \`press\`, \`wait\`
  - \`selector\`: DOM selector (unless \`goto\` or \`wait\`)
  - \`value\`: (for \`fill\` or \`press\` actions)

---

### 📌 Task:
${task}

### 🌐 Page Snapshot:
URL: ${snapshot.url}
Title: ${snapshot.title}

Elements:
${simplifiedElements}

### ✅ Output Format:
\`\`\`json
[
  {
    "action": "fill",
    "selector": "input[name='username']",
    "value": "my-email@example.com"
  },
  {
    "action": "click",
    "selector": "button:has-text('Sign in')"
  }
]
\`\`\``;
        try {
            const response = await this.claude.messages.create({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                messages: [{
                        role: 'user',
                        content: prompt
                    }]
            });
            const content = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const actions = JSON.parse(jsonMatch[1]);
            return actions;
        }
        catch (error) {
            if (debug)
                console.error('Failed to generate actions:', error);
            throw error;
        }
    }
    async executeAction(page, action) {
        switch (action.action) {
            case 'click':
                await page.click(action.selector, { timeout: action.timeout || 10000 });
                break;
            case 'fill':
                await page.fill(action.selector, action.value || '', { timeout: action.timeout || 10000 });
                break;
            case 'goto':
                await page.goto(action.value, { waitUntil: 'networkidle' });
                break;
            case 'press':
                if (action.selector) {
                    await page.press(action.selector, action.value || 'Enter');
                }
                else {
                    await page.keyboard.press(action.value || 'Enter');
                }
                break;
            case 'wait':
                await page.waitForTimeout(action.timeout || parseInt(action.value || '1000'));
                break;
            case 'wait_for':
                await page.waitForSelector(action.selector, { timeout: action.timeout || 30000 });
                break;
            case 'screenshot':
                await page.screenshot({ path: action.value || 'screenshot.png', fullPage: true });
                break;
            default:
                throw new Error(`Unknown action: ${action.action}`);
        }
    }
}
exports.LLMBrowserAgent = LLMBrowserAgent;
async function authenticateWithLLM(page, email, password, loginUrl, apiKey, debug) {
    if (!apiKey) {
        if (debug)
            console.log('⚠️ No Claude API key provided, skipping LLM authentication');
        return false;
    }
    const agent = new LLMBrowserAgent(apiKey);
    if (loginUrl) {
        await page.goto(loginUrl, { waitUntil: 'networkidle' });
    }
    const task = `Log in to this website with the following credentials:
- Email/Username: ${email}
- Password: ${password}

Find the email/username input field, fill it with the email.
Find the password input field, fill it with the password.
Click the submit/login button to complete authentication.`;
    const success = await agent.executeTask(page, task, debug);
    if (success) {
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
        }
        catch {
            await page.waitForTimeout(2000);
        }
        const currentUrl = page.url();
        const stillOnLogin = currentUrl.includes('/login') || currentUrl.includes('/signin');
        return !stillOnLogin;
    }
    return false;
}
async function executeNaturalLanguageTask(page, task, apiKey, debug) {
    const agent = new LLMBrowserAgent(apiKey);
    return await agent.executeTask(page, task, debug);
}
