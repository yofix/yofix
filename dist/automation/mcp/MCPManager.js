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
exports.MCPManager = void 0;
const core = __importStar(require("@actions/core"));
const BrowserSecuritySandbox_1 = require("../security/BrowserSecuritySandbox");
class MCPManager {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.actions = [];
        this.state = {
            url: '',
            title: '',
            elements: new Map(),
            viewport: { width: 1920, height: 1080 },
            cookies: [],
            localStorage: {},
            sessionStorage: {},
            console: [],
            network: []
        };
        this.securitySandbox = new BrowserSecuritySandbox_1.BrowserSecuritySandbox();
    }
    async initialize(options) {
        const { chromium } = await Promise.resolve().then(() => __importStar(require('playwright')));
        this.browser = await chromium.launch({
            headless: options?.headless ?? true,
            args: options?.browserArgs || [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        });
        this.context = await this.browser.newContext({
            viewport: options?.viewport || { width: 1920, height: 1080 },
            userAgent: options?.userAgent || 'YoFix MCP Browser/1.0',
            permissions: [],
            geolocation: undefined,
            storageState: undefined,
            ...options?.contextOptions
        });
        this.page = await this.context.newPage();
        this.setupEventListeners();
        core.info('MCP browser initialized');
    }
    async executeCommand(command) {
        try {
            const action = await this.parseCommand(command);
            return await this.executeAction(action);
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
                state: this.state
            };
        }
    }
    async executeAction(action) {
        if (!this.page) {
            throw new Error('Browser not initialized');
        }
        const validation = await this.securitySandbox.validateAction(action);
        if (!validation.valid) {
            return {
                success: false,
                error: `Security validation failed: ${validation.error}`,
                state: this.state
            };
        }
        this.actions.push(action);
        try {
            switch (action.type) {
                case 'navigate':
                    await this.navigate(action.params.url);
                    break;
                case 'click':
                    await this.click(action.params.selector);
                    break;
                case 'type':
                    await this.type(action.params.selector, action.params.text);
                    break;
                case 'hover':
                    await this.hover(action.params.selector);
                    break;
                case 'scroll':
                    await this.scroll(action.params);
                    break;
                case 'screenshot':
                    return await this.screenshot(action.params);
                case 'extract':
                    return await this.extract(action.params);
                case 'wait':
                    await this.wait(action.params);
                    break;
                case 'evaluate':
                    return await this.evaluate(action.params.script);
                case 'select':
                    await this.select(action.params.selector, action.params.value);
                    break;
                case 'upload':
                    await this.upload(action.params.selector, action.params.files);
                    break;
                default:
                    throw new Error(`Unknown action type: ${action.type}`);
            }
            await this.updateState();
            return {
                success: true,
                data: undefined,
                state: this.state
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
                state: this.state
            };
        }
    }
    async parseCommand(command) {
        const lowerCommand = command.toLowerCase();
        if (lowerCommand.includes('go to') || lowerCommand.includes('navigate to')) {
            const urlMatch = command.match(/(?:go to|navigate to)\s+(.+)/i);
            if (urlMatch) {
                return {
                    type: 'navigate',
                    params: { url: urlMatch[1].trim() }
                };
            }
        }
        if (lowerCommand.includes('click')) {
            const patterns = [
                /click (?:on |the )?(.+)/i,
                /click (.+) button/i,
                /press (.+)/i
            ];
            for (const pattern of patterns) {
                const match = command.match(pattern);
                if (match) {
                    const selector = await this.findSelector(match[1].trim());
                    return {
                        type: 'click',
                        params: { selector }
                    };
                }
            }
        }
        if (lowerCommand.includes('type') || lowerCommand.includes('enter') || lowerCommand.includes('fill')) {
            const patterns = [
                /(?:type|enter) ["'](.+)["'] (?:in|into) (.+)/i,
                /fill (.+) with ["'](.+)["']/i
            ];
            for (const pattern of patterns) {
                const match = command.match(pattern);
                if (match) {
                    const text = match[1];
                    const selector = await this.findSelector(match[2].trim());
                    return {
                        type: 'type',
                        params: { selector, text }
                    };
                }
            }
        }
        if (lowerCommand.includes('screenshot') || lowerCommand.includes('capture')) {
            const fullPage = lowerCommand.includes('full');
            return {
                type: 'screenshot',
                params: { fullPage }
            };
        }
        if (lowerCommand.includes('scroll')) {
            if (lowerCommand.includes('down')) {
                return {
                    type: 'scroll',
                    params: { direction: 'down', amount: 500 }
                };
            }
            else if (lowerCommand.includes('up')) {
                return {
                    type: 'scroll',
                    params: { direction: 'up', amount: 500 }
                };
            }
            else if (lowerCommand.includes('to bottom')) {
                return {
                    type: 'scroll',
                    params: { direction: 'bottom' }
                };
            }
        }
        if (lowerCommand.includes('wait')) {
            const timeMatch = command.match(/wait (?:for )?(\d+)/i);
            if (timeMatch) {
                return {
                    type: 'wait',
                    params: { timeout: parseInt(timeMatch[1]) * 1000 }
                };
            }
            const selectorMatch = command.match(/wait (?:for|until) (.+)/i);
            if (selectorMatch) {
                const selector = await this.findSelector(selectorMatch[1].trim());
                return {
                    type: 'wait',
                    params: { selector }
                };
            }
        }
        throw new Error(`Could not parse command: ${command}`);
    }
    async findSelector(description) {
        if (!this.page)
            throw new Error('Page not initialized');
        if (description.startsWith('.') || description.startsWith('#') || description.includes('[')) {
            return description;
        }
        const textSelector = `text=${description}`;
        const hasText = await this.page.locator(textSelector).count() > 0;
        if (hasText) {
            return textSelector;
        }
        const placeholderSelector = `[placeholder*="${description}"]`;
        const hasPlaceholder = await this.page.locator(placeholderSelector).count() > 0;
        if (hasPlaceholder) {
            return placeholderSelector;
        }
        const ariaSelector = `[aria-label*="${description}"]`;
        const hasAria = await this.page.locator(ariaSelector).count() > 0;
        if (hasAria) {
            return ariaSelector;
        }
        const titleSelector = `[title*="${description}"]`;
        const hasTitle = await this.page.locator(titleSelector).count() > 0;
        if (hasTitle) {
            return titleSelector;
        }
        return await this.findSelectorWithAI(description);
    }
    async findSelectorWithAI(description) {
        if (!this.page)
            throw new Error('Page not initialized');
        try {
            const screenshot = await this.page.screenshot({ fullPage: false });
            const claudeApiKey = process.env.INPUT_CLAUDE_API_KEY;
            if (!claudeApiKey) {
                throw new Error('Claude API key not available for AI selector finding');
            }
            const { VisualAnalyzer } = await Promise.resolve().then(() => __importStar(require('../../core/analysis/VisualAnalyzer')));
            const analyzer = new VisualAnalyzer(claudeApiKey);
            const prompt = `Analyze this screenshot and find an element matching: "${description}"
      
      Look for:
      - Buttons, links, or clickable elements with matching text
      - Input fields with matching labels or placeholders
      - Elements with matching aria-labels or titles
      
      Return a CSS selector that uniquely identifies this element.
      Format: { "selector": "css-selector-here" }`;
            const response = await analyzer.analyzeScreenshot(screenshot, prompt);
            const match = response.match(/\{\s*"selector"\s*:\s*"([^"]+)"\s*\}/);
            if (match && match[1]) {
                const selector = match[1];
                const count = await this.page.locator(selector).count();
                if (count > 0) {
                    core.info(`AI found selector: ${selector} for "${description}"`);
                    return selector;
                }
            }
        }
        catch (error) {
            core.warning(`AI selector finding failed: ${error}`);
        }
        throw new Error(`Could not find element matching: ${description}`);
    }
    async navigate(url) {
        if (!this.page)
            throw new Error('Page not initialized');
        if (!url.startsWith('http')) {
            if (this.state.url) {
                const base = new URL(this.state.url);
                url = new URL(url, base).toString();
            }
            else {
                url = `https://${url}`;
            }
        }
        await this.page.goto(url, { waitUntil: 'networkidle' });
    }
    async click(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.click(selector);
    }
    async type(selector, text) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.fill(selector, text);
    }
    async hover(selector) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.hover(selector);
    }
    async scroll(params) {
        if (!this.page)
            throw new Error('Page not initialized');
        if (params.direction === 'bottom') {
            await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }
        else if (params.direction === 'top') {
            await this.page.evaluate(() => window.scrollTo(0, 0));
        }
        else {
            const amount = params.amount || 500;
            const direction = params.direction === 'up' ? -amount : amount;
            await this.page.evaluate((y) => window.scrollBy(0, y), direction);
        }
    }
    async screenshot(params) {
        if (!this.page)
            throw new Error('Page not initialized');
        const screenshot = await this.page.screenshot({
            fullPage: params.fullPage || false
        });
        return {
            success: true,
            data: {
                type: 'screenshot',
                buffer: screenshot,
                timestamp: Date.now()
            },
            state: this.state
        };
    }
    async extract(params) {
        if (!this.page)
            throw new Error('Page not initialized');
        const data = await this.page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (!element)
                return null;
            return {
                text: element.textContent,
                html: element.innerHTML,
                attributes: Array.from(element.attributes).reduce((acc, attr) => {
                    acc[attr.name] = attr.value;
                    return acc;
                }, {})
            };
        }, params.selector);
        return {
            success: true,
            data,
            state: this.state
        };
    }
    async wait(params) {
        if (!this.page)
            throw new Error('Page not initialized');
        if (params.selector) {
            await this.page.waitForSelector(params.selector, {
                timeout: params.timeout || 30000
            });
        }
        else if (params.timeout) {
            await this.page.waitForTimeout(params.timeout);
        }
    }
    async evaluate(script) {
        if (!this.page)
            throw new Error('Page not initialized');
        const safeScript = this.securitySandbox.createSafeContext().replace('// Your code here', script);
        const result = await this.page.evaluate(safeScript);
        return {
            success: true,
            data: result,
            state: this.state
        };
    }
    async select(selector, value) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.selectOption(selector, value);
    }
    async upload(selector, files) {
        if (!this.page)
            throw new Error('Page not initialized');
        await this.page.setInputFiles(selector, files);
    }
    async updateState() {
        if (!this.page)
            throw new Error('Page not initialized');
        this.state.url = this.page.url();
        this.state.title = await this.page.title();
        const viewport = this.page.viewportSize();
        if (viewport) {
            this.state.viewport = viewport;
        }
        const elements = await this.page.evaluate(() => {
            const els = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
            return Array.from(els).map(el => ({
                tag: el.tagName.toLowerCase(),
                text: el.textContent?.trim() || '',
                type: el.type || '',
                placeholder: el.placeholder || '',
                href: el.href || '',
                id: el.id || '',
                class: el.className || ''
            }));
        });
        this.state.elements.clear();
        elements.forEach((el, index) => {
            const elementInfo = {
                selector: `element-${index}`,
                text: el.text,
                attributes: {
                    tag: el.tag,
                    type: el.type,
                    placeholder: el.placeholder,
                    href: el.href,
                    id: el.id,
                    class: el.class
                },
                visible: true,
                clickable: ['button', 'a', 'input'].includes(el.tag)
            };
            this.state.elements.set(`element-${index}`, elementInfo);
        });
    }
    setupEventListeners() {
        if (!this.page)
            return;
        this.page.on('console', msg => {
            const msgType = msg.type();
            const type = msgType === 'error' ? 'error' :
                msgType === 'warning' ? 'warning' :
                    msgType === 'info' ? 'info' : 'log';
            this.state.console.push({
                type,
                text: msg.text(),
                timestamp: Date.now()
            });
        });
        this.page.on('request', request => {
            this.state.network.push({
                url: request.url(),
                method: request.method(),
                headers: request.headers(),
                timestamp: Date.now(),
                type: 'request'
            });
        });
        this.page.on('response', response => {
            const existingRequest = this.state.network.find(r => r.url === response.url() && !r.status);
            if (existingRequest) {
                existingRequest.status = response.status();
                existingRequest.responseHeaders = response.headers();
            }
            else {
                this.state.network.push({
                    url: response.url(),
                    method: response.request().method(),
                    status: response.status(),
                    headers: response.request().headers(),
                    responseHeaders: response.headers(),
                    timestamp: Date.now(),
                    type: 'response'
                });
            }
        });
    }
    async getActionData(action) {
        return null;
    }
    getState() {
        return { ...this.state };
    }
    getHistory() {
        return [...this.actions];
    }
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }
}
exports.MCPManager = MCPManager;
