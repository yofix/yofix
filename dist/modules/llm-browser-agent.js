"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMBrowserAgent = void 0;
exports.authenticateWithLLM = authenticateWithLLM;
exports.executeNaturalLanguageTask = executeNaturalLanguageTask;
const sdk_1 = require("@anthropic-ai/sdk");
const config_1 = __importDefault(require("../config"));
const ErrorHandlerFactory_1 = require("../core/error/ErrorHandlerFactory");
const core_1 = require("../core");
const logger = (0, ErrorHandlerFactory_1.createModuleLogger)({
    module: 'LLMBrowserAgent',
    defaultCategory: core_1.ErrorCategory.AI
});
const tryCatch = (0, ErrorHandlerFactory_1.createTryCatch)(logger);
class LLMBrowserAgent {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.claude = new sdk_1.Anthropic({ apiKey });
    }
    async executeTask(page, task, debug) {
        const log = (0, ErrorHandlerFactory_1.createModuleLogger)({
            module: 'LLMBrowserAgent',
            debug,
            defaultCategory: core_1.ErrorCategory.AI
        });
        try {
            log.debug(`🤖 Executing task: ${task}`);
            const snapshot = await this.captureDOMSnapshot(page);
            log.debug(`📸 Captured DOM snapshot with ${snapshot.elements.length} elements`);
            const actions = await this.generateActions(task, snapshot, debug);
            log.debug(`🎯 Generated ${actions.length} actions:`, actions);
            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                log.debug(`\n⚡ Executing action ${i + 1}/${actions.length}:`, action);
                try {
                    await this.executeAction(page, action);
                    log.debug(`  ✅ Action completed`);
                }
                catch (error) {
                    await log.error(error, {
                        userAction: 'Execute browser action',
                        severity: core_1.ErrorSeverity.MEDIUM,
                        metadata: { action, index: i, totalActions: actions.length }
                    });
                    throw error;
                }
            }
            return true;
        }
        catch (error) {
            await log.error(error, {
                userAction: 'Execute LLM browser task',
                severity: core_1.ErrorSeverity.HIGH,
                metadata: { task, url: page.url() }
            });
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

Your task is to generate Playwright browser actions to accomplish the user's goal.

IMPORTANT: Return ONLY a JSON array of actions. No explanations, no markdown, just the JSON array.

Task: ${task}

Current page: ${snapshot.url}
Page title: ${snapshot.title}

Available elements:
${simplifiedElements}

Valid actions:
- fill: Fill an input field (requires: selector, value)
- click: Click an element (requires: selector)
- press: Press a key (requires: selector or just value for global key press)
- wait: Wait for a duration (requires: value in milliseconds)
- goto: Navigate to URL (requires: value as URL)

Example response format:
[
  {"action": "fill", "selector": "input[name='email']", "value": "user@example.com"},
  {"action": "fill", "selector": "input[type='password']", "value": "password123"},
  {"action": "click", "selector": "button[type='submit']"}
]

Generate the actions needed to: ${task}`;
        try {
            const response = await this.claude.messages.create({
                model: config_1.default.get('ai.claude.models.navigation'),
                max_tokens: config_1.default.get('ai.claude.maxTokens.navigation'),
                messages: [{
                        role: 'user',
                        content: prompt
                    }]
            });
            const content = response.content[0].type === 'text' ? response.content[0].text : '';
            let actions = [];
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                try {
                    actions = JSON.parse(jsonMatch[1]);
                }
                catch (e) {
                    logger.debug('Failed to parse JSON from code block:', e);
                }
            }
            if (actions.length === 0) {
                try {
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        actions = parsed;
                    }
                    else if (parsed.actions && Array.isArray(parsed.actions)) {
                        actions = parsed.actions;
                    }
                }
                catch (e) {
                    const arrayMatch = content.match(/\[[\s\S]*?\]/);
                    if (arrayMatch) {
                        try {
                            actions = JSON.parse(arrayMatch[0]);
                        }
                        catch (e2) {
                            logger.debug('Failed to parse JSON array:', e2);
                        }
                    }
                }
            }
            if (actions.length === 0) {
                throw new Error('No valid actions found in LLM response');
            }
            return actions;
        }
        catch (error) {
            await logger.error(error, {
                userAction: 'Generate browser actions from LLM',
                severity: core_1.ErrorSeverity.HIGH,
                metadata: { task, url: snapshot.url, elementCount: snapshot.elements.length }
            });
            throw error;
        }
    }
    async executeAction(page, action) {
        switch (action.action) {
            case 'click':
                await page.click(action.selector, { timeout: action.timeout || config_1.default.get('auth.selectorTimeout') });
                break;
            case 'fill':
                await page.fill(action.selector, action.value || '', { timeout: action.timeout || config_1.default.get('auth.selectorTimeout') });
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
                await page.waitForSelector(action.selector, { timeout: action.timeout || config_1.default.get('browser.defaultTimeout') });
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
    const log = (0, ErrorHandlerFactory_1.createModuleLogger)({
        module: 'LLMBrowserAgent.authenticate',
        debug,
        defaultCategory: core_1.ErrorCategory.AUTHENTICATION
    });
    if (!apiKey) {
        log.warn('⚠️ No Claude API key provided, skipping LLM authentication');
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
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: config_1.default.get('testing.defaultWaitTime') * 2.5 });
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
