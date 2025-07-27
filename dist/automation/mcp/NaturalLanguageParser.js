"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NaturalLanguageParser = void 0;
class NaturalLanguageParser {
    constructor() {
        this.commandPatterns = new Map();
        this.routeCache = new Map();
        this.initializePatterns();
    }
    initializePatterns() {
        this.commandPatterns.set('navigate', [
            /(?:go to|navigate to|open|visit)\s+(.+)/i,
            /check\s+(?:the\s+)?(.+?)(?:\s+page)?$/i,
            /look at\s+(?:the\s+)?(.+?)(?:\s+page)?$/i
        ]);
        this.commandPatterns.set('click', [
            /click\s+(?:on\s+)?(?:the\s+)?(.+)/i,
            /press\s+(?:the\s+)?(.+?)(?:\s+button)?$/i,
            /tap\s+(?:on\s+)?(?:the\s+)?(.+)/i,
            /select\s+(?:the\s+)?(.+)/i
        ]);
        this.commandPatterns.set('type', [
            /(?:type|enter|input)\s+["'](.+?)["']\s+(?:in|into)\s+(?:the\s+)?(.+)/i,
            /fill\s+(?:in\s+)?(?:the\s+)?(.+?)\s+with\s+["'](.+?)["']/i,
            /set\s+(?:the\s+)?(.+?)\s+to\s+["'](.+?)["']/i
        ]);
        this.commandPatterns.set('scroll', [
            /scroll\s+(?:down|up)\s*(?:by\s+)?(\d+)?(?:\s*pixels)?/i,
            /scroll\s+to\s+(?:the\s+)?(?:bottom|top|end|beginning)/i,
            /scroll\s+to\s+(?:the\s+)?(.+)/i
        ]);
        this.commandPatterns.set('visual', [
            /(?:check|verify|ensure)\s+(?:that\s+)?(?:the\s+)?(.+?)\s+(?:looks|appears)\s+(.+)/i,
            /(?:the\s+)?(.+?)\s+should\s+(?:be\s+)?(.+)/i,
            /(?:check|verify)\s+visual\s+(?:appearance|layout|design)/i
        ]);
        this.commandPatterns.set('wait', [
            /wait\s+(?:for\s+)?(\d+)\s*(?:seconds?|ms|milliseconds?)?/i,
            /wait\s+(?:for|until)\s+(?:the\s+)?(.+?)\s+(?:appears|loads|is visible)/i,
            /pause\s+(?:for\s+)?(\d+)/i
        ]);
        this.commandPatterns.set('hover', [
            /hover\s+(?:over|on)\s+(?:the\s+)?(.+)/i,
            /move\s+(?:mouse\s+)?(?:to|over)\s+(?:the\s+)?(.+)/i
        ]);
        this.commandPatterns.set('screenshot', [
            /(?:take|capture)\s+(?:a\s+)?screenshot/i,
            /screenshot\s+(?:the\s+)?(.+)/i,
            /capture\s+(?:the\s+)?(?:current\s+)?(?:page|screen|view)/i
        ]);
        this.commandPatterns.set('form', [
            /fill\s+(?:out|in)\s+(?:the\s+)?form/i,
            /submit\s+(?:the\s+)?form/i,
            /complete\s+(?:the\s+)?(.+?)\s+form/i
        ]);
        this.commandPatterns.set('login', [
            /log\s*in\s+(?:with\s+)?(?:email\s+)?["']?(.+?)["']?\s+(?:and\s+)?(?:password\s+)?["']?(.+?)["']?/i,
            /sign\s*in\s+(?:as\s+)?["']?(.+?)["']?/i,
            /authenticate\s+(?:with\s+)?["']?(.+?)["']?/i
        ]);
    }
    async parse(command) {
        const actions = [];
        const normalizedCommand = command.trim().toLowerCase();
        const segments = this.splitCompoundCommand(command);
        for (const segment of segments) {
            const action = await this.parseSegment(segment);
            if (action) {
                actions.push(action);
            }
        }
        if (actions.length === 0) {
            const inferredAction = await this.inferFromContext(command);
            if (inferredAction) {
                actions.push(inferredAction);
            }
        }
        return actions;
    }
    async parseSegment(segment) {
        const trimmedSegment = segment.trim();
        const navAction = this.matchPattern('navigate', trimmedSegment);
        if (navAction) {
            return {
                type: 'navigate',
                params: { url: this.resolveUrl(navAction.groups[1]) }
            };
        }
        const clickAction = this.matchPattern('click', trimmedSegment);
        if (clickAction) {
            return {
                type: 'click',
                params: { selector: await this.findSelector(clickAction.groups[1]) }
            };
        }
        const typeAction = this.matchPattern('type', trimmedSegment);
        if (typeAction) {
            const text = typeAction.groups[1] || typeAction.groups[2];
            const target = typeAction.groups[2] || typeAction.groups[1];
            return {
                type: 'type',
                params: {
                    selector: await this.findSelector(target),
                    text: text
                }
            };
        }
        const scrollAction = this.matchPattern('scroll', trimmedSegment);
        if (scrollAction) {
            return this.parseScrollAction(trimmedSegment);
        }
        const waitAction = this.matchPattern('wait', trimmedSegment);
        if (waitAction) {
            return this.parseWaitAction(waitAction);
        }
        const hoverAction = this.matchPattern('hover', trimmedSegment);
        if (hoverAction) {
            return {
                type: 'hover',
                params: { selector: await this.findSelector(hoverAction.groups[1]) }
            };
        }
        const screenshotAction = this.matchPattern('screenshot', trimmedSegment);
        if (screenshotAction) {
            return {
                type: 'screenshot',
                params: { fullPage: trimmedSegment.includes('full') }
            };
        }
        const formAction = this.matchPattern('form', trimmedSegment);
        if (formAction) {
            return this.parseFormAction(trimmedSegment);
        }
        const loginAction = this.matchPattern('login', trimmedSegment);
        if (loginAction) {
            return this.parseLoginAction(loginAction);
        }
        const visualAction = this.matchPattern('visual', trimmedSegment);
        if (visualAction) {
            return this.parseVisualAction(trimmedSegment);
        }
        return null;
    }
    matchPattern(type, command) {
        const patterns = this.commandPatterns.get(type);
        if (!patterns)
            return null;
        for (const pattern of patterns) {
            const match = command.match(pattern);
            if (match) {
                return { groups: match.slice(1) };
            }
        }
        return null;
    }
    splitCompoundCommand(command) {
        const separators = /(?:\s+(?:and|then|after that|next|finally)\s+)/i;
        const segments = command.split(separators);
        const finalSegments = [];
        for (const segment of segments) {
            const subSegments = segment.split(/[.;,]\s*/);
            finalSegments.push(...subSegments.filter(s => s.trim()));
        }
        return finalSegments;
    }
    parseScrollAction(command) {
        const downMatch = command.match(/down(?:\s+by\s+)?(\d+)?/i);
        const upMatch = command.match(/up(?:\s+by\s+)?(\d+)?/i);
        const bottomMatch = command.match(/bottom|end/i);
        const topMatch = command.match(/top|beginning/i);
        if (bottomMatch) {
            return {
                type: 'scroll',
                params: { direction: 'bottom' }
            };
        }
        else if (topMatch) {
            return {
                type: 'scroll',
                params: { direction: 'top' }
            };
        }
        else if (downMatch) {
            return {
                type: 'scroll',
                params: {
                    direction: 'down',
                    amount: downMatch[1] ? parseInt(downMatch[1]) : 500
                }
            };
        }
        else if (upMatch) {
            return {
                type: 'scroll',
                params: {
                    direction: 'up',
                    amount: upMatch[1] ? parseInt(upMatch[1]) : 500
                }
            };
        }
        return {
            type: 'scroll',
            params: { direction: 'down', amount: 500 }
        };
    }
    parseWaitAction(match) {
        const timeMatch = match.groups[0];
        if (timeMatch && /^\d+$/.test(timeMatch)) {
            const value = parseInt(timeMatch);
            const timeout = value < 100 ? value * 1000 : value;
            return {
                type: 'wait',
                params: { timeout }
            };
        }
        return {
            type: 'wait',
            params: { selector: match.groups[0] || match.groups[1] }
        };
    }
    parseFormAction(command) {
        if (command.includes('submit')) {
            return {
                type: 'click',
                params: { selector: 'button[type="submit"], input[type="submit"]' }
            };
        }
        return {
            type: 'evaluate',
            params: {
                script: `
          // Auto-fill form fields with test data
          document.querySelectorAll('input[type="text"]').forEach(input => {
            if (!input.value) input.value = 'Test Value';
          });
          document.querySelectorAll('input[type="email"]').forEach(input => {
            if (!input.value) input.value = 'test@example.com';
          });
          document.querySelectorAll('input[type="tel"]').forEach(input => {
            if (!input.value) input.value = '555-0123';
          });
          document.querySelectorAll('textarea').forEach(textarea => {
            if (!textarea.value) textarea.value = 'Test description';
          });
        `
            }
        };
    }
    parseLoginAction(match) {
        const email = match.groups[0];
        const password = match.groups[1] || 'password123';
        return {
            type: 'evaluate',
            params: {
                script: `
          // Fill login form
          const emailInput = document.querySelector('input[type="email"], input[name*="email"], input[name*="username"]');
          const passwordInput = document.querySelector('input[type="password"]');
          
          if (emailInput) emailInput.value = '${email}';
          if (passwordInput) passwordInput.value = '${password}';
          
          // Try to submit
          const submitButton = document.querySelector('button[type="submit"], button:contains("Login"), button:contains("Sign In")');
          if (submitButton) submitButton.click();
        `
            }
        };
    }
    parseVisualAction(command) {
        return {
            type: 'screenshot',
            params: {
                fullPage: false,
                visual: true,
                description: command
            }
        };
    }
    async inferFromContext(command) {
        const lowerCommand = command.toLowerCase();
        if (lowerCommand.includes('button') || lowerCommand.includes('submit')) {
            const buttonText = this.extractQuotedText(command) || command;
            return {
                type: 'click',
                params: { selector: `button:contains("${buttonText}")` }
            };
        }
        if (lowerCommand.includes('field') || lowerCommand.includes('input')) {
            const fieldName = this.extractQuotedText(command) || 'input';
            return {
                type: 'click',
                params: { selector: `input[name*="${fieldName}"], input[placeholder*="${fieldName}"]` }
            };
        }
        if (lowerCommand.includes('menu') || lowerCommand.includes('nav')) {
            return {
                type: 'click',
                params: { selector: 'nav, [role="navigation"], .menu, .nav' }
            };
        }
        return null;
    }
    async findSelector(description) {
        const desc = description.trim().toLowerCase();
        const elementMap = {
            'submit button': 'button[type="submit"], input[type="submit"]',
            'login button': 'button:contains("Login"), button:contains("Sign In")',
            'signup button': 'button:contains("Sign Up"), button:contains("Register")',
            'close button': 'button[aria-label="Close"], .close, button:contains("Close")',
            'menu': 'nav, [role="navigation"], .menu',
            'header': 'header, [role="banner"], .header',
            'footer': 'footer, [role="contentinfo"], .footer',
            'sidebar': 'aside, [role="complementary"], .sidebar',
            'search': 'input[type="search"], input[placeholder*="Search"]',
            'email field': 'input[type="email"], input[name*="email"]',
            'password field': 'input[type="password"]',
            'name field': 'input[name*="name"], input[placeholder*="Name"]'
        };
        for (const [key, selector] of Object.entries(elementMap)) {
            if (desc.includes(key)) {
                return selector;
            }
        }
        if (desc.startsWith('#') || desc.startsWith('.') || desc.includes('[')) {
            return description;
        }
        const quotedText = this.extractQuotedText(description);
        if (quotedText) {
            return `text="${quotedText}"`;
        }
        return `text="${description}"`;
    }
    resolveUrl(urlOrPath) {
        const normalized = urlOrPath.trim();
        if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
            return normalized;
        }
        if (this.routeCache.has(normalized)) {
            return this.routeCache.get(normalized);
        }
        const pageMap = {
            'home': '/',
            'homepage': '/',
            'dashboard': '/dashboard',
            'profile': '/profile',
            'settings': '/settings',
            'login': '/login',
            'signup': '/signup',
            'register': '/register',
            'about': '/about',
            'contact': '/contact'
        };
        const lowerNormalized = normalized.toLowerCase();
        for (const [key, path] of Object.entries(pageMap)) {
            if (lowerNormalized.includes(key)) {
                return path;
            }
        }
        if (normalized.startsWith('/')) {
            return normalized;
        }
        return `/${normalized}`;
    }
    extractQuotedText(text) {
        const match = text.match(/["']([^"']+)["']/);
        return match ? match[1] : null;
    }
    updateRouteCache(routes) {
        this.routeCache = new Map([...this.routeCache, ...routes]);
    }
}
exports.NaturalLanguageParser = NaturalLanguageParser;
