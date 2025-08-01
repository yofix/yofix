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
exports.authActions = void 0;
const DOMIndexer_1 = require("../core/DOMIndexer");
const core = __importStar(require("@actions/core"));
const llm_browser_agent_1 = require("../../modules/llm-browser-agent");
const core_1 = require("../../core");
const domIndexer = new DOMIndexer_1.DOMIndexer();
exports.authActions = [
    {
        definition: {
            name: 'smart_login',
            description: 'Intelligently login to any website by understanding the login form',
            parameters: {
                username: { type: 'string', required: false, description: 'Username or email' },
                email: { type: 'string', required: false, description: 'Email address' },
                password: { type: 'string', required: true, description: 'Password' },
                url: { type: 'string', required: false, description: 'Login page URL (if not already there)' },
                totpSecret: { type: 'string', required: false, description: 'TOTP secret for 2FA' }
            },
            examples: [
                'smart_login email="user@example.com" password="secret123"',
                'smart_login username="johndoe" password="pass123" url="/login"',
                'smart_login email="user@test.com" password="pwd" totpSecret="JBSWY3DPEHPK3PXP"'
            ]
        },
        handler: async (params, context) => {
            const startTime = Date.now();
            try {
                const { page, dom, state } = context;
                if (params.url) {
                    await page.goto(params.url, { waitUntil: 'domcontentloaded' });
                    await domIndexer.indexPage(page);
                }
                const loginElements = analyzeLoginForm(dom, domIndexer);
                if (!loginElements.usernameField && !loginElements.emailField) {
                    return {
                        success: false,
                        error: 'Could not find username/email field',
                        method: 'smart',
                        loginTime: Date.now() - startTime
                    };
                }
                if (!loginElements.passwordField) {
                    return {
                        success: false,
                        error: 'Could not find password field',
                        method: 'smart',
                        loginTime: Date.now() - startTime
                    };
                }
                const usernameValue = params.email || params.username || '';
                const usernameField = loginElements.emailField || loginElements.usernameField;
                if (usernameField) {
                    core.info(`Filling username field at index ${usernameField.index}`);
                    await page.fill(`xpath=${usernameField.xpath}`, usernameValue);
                    await page.waitForTimeout(500);
                }
                core.info(`Filling password field at index ${loginElements.passwordField.index}`);
                await page.fill(`xpath=${loginElements.passwordField.xpath}`, params.password);
                await page.waitForTimeout(500);
                if (loginElements.rememberCheckbox) {
                    await page.click(`xpath=${loginElements.rememberCheckbox.xpath}`);
                }
                if (loginElements.submitButton) {
                    core.info(`Clicking submit button at index ${loginElements.submitButton.index}`);
                    await page.click(`xpath=${loginElements.submitButton.xpath}`);
                }
                else {
                    core.info('No submit button found, pressing Enter');
                    await page.keyboard.press('Enter');
                }
                await Promise.race([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { }),
                    page.waitForTimeout(5000)
                ]);
                if (params.totpSecret) {
                    const needs2FA = await check2FARequired(page);
                    if (needs2FA) {
                        core.info('2FA detected, handling...');
                        await handle2FA(page, params.totpSecret);
                    }
                }
                const success = await verifyLoginSuccess(page, usernameValue);
                if (success) {
                    state.memory.set('auth_credentials', {
                        site: new URL(page.url()).hostname,
                        username: usernameValue,
                        timestamp: Date.now()
                    });
                }
                return {
                    success,
                    method: 'smart',
                    loginTime: Date.now() - startTime,
                    verificationMethod: success ? 'profile-detected' : 'login-form-still-visible',
                    data: {
                        finalUrl: page.url(),
                        usedFields: {
                            username: usernameField?.tag,
                            password: loginElements.passwordField.tag,
                            submit: loginElements.submitButton?.tag
                        }
                    }
                };
            }
            catch (error) {
                await core_1.errorHandler.handleError(error, {
                    severity: core_1.ErrorSeverity.HIGH,
                    category: core_1.ErrorCategory.AUTHENTICATION,
                    userAction: 'Smart login attempt',
                    metadata: {
                        method: 'smart',
                        hasUsername: !!(params.email || params.username),
                        hasUrl: !!params.url,
                        has2FA: !!params.totpSecret
                    },
                    recoverable: true
                });
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Smart login failed',
                    method: 'smart',
                    loginTime: Date.now() - startTime
                };
            }
        }
    },
    {
        definition: {
            name: 'logout',
            description: 'Intelligently logout from the current website',
            parameters: {},
            examples: ['logout']
        },
        handler: async (params, context) => {
            try {
                const { page, dom } = context;
                const logoutElements = findLogoutElements(dom, domIndexer);
                if (logoutElements.length === 0) {
                    const userMenuElements = findUserMenuElements(dom, domIndexer);
                    if (userMenuElements.length > 0) {
                        await page.click(`xpath=${userMenuElements[0].xpath}`);
                        await page.waitForTimeout(1000);
                        const newDom = await domIndexer.indexPage(page);
                        const newLogoutElements = findLogoutElements(newDom, domIndexer);
                        if (newLogoutElements.length > 0) {
                            await page.click(`xpath=${newLogoutElements[0].xpath}`);
                        }
                    }
                }
                else {
                    await page.click(`xpath=${logoutElements[0].xpath}`);
                }
                await Promise.race([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => { }),
                    page.waitForTimeout(3000)
                ]);
                context.state.memory.delete('auth_credentials');
                return {
                    success: true,
                    data: {
                        method: logoutElements.length > 0 ? 'direct' : 'menu-navigation',
                        finalUrl: page.url()
                    }
                };
            }
            catch (error) {
                await core_1.errorHandler.handleError(error, {
                    severity: core_1.ErrorSeverity.MEDIUM,
                    category: core_1.ErrorCategory.AUTHENTICATION,
                    userAction: 'Logout attempt',
                    metadata: {
                        currentUrl: context.page.url()
                    },
                    recoverable: true
                });
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Logout failed'
                };
            }
        }
    },
    {
        definition: {
            name: 'llm_login',
            description: 'Login using LLM to understand any login form (most reliable)',
            parameters: {
                email: { type: 'string', required: true, description: 'Email address' },
                password: { type: 'string', required: true, description: 'Password' },
                loginUrl: { type: 'string', required: false, description: 'Login page URL' }
            },
            examples: [
                'llm_login email="user@example.com" password="secret123"',
                'llm_login email="test@test.com" password="pass" loginUrl="/login"'
            ]
        },
        handler: async (params, context) => {
            const startTime = Date.now();
            try {
                const { page, state } = context;
                const claudeApiKey = process.env.CLAUDE_API_KEY || core.getInput('claude-api-key');
                if (!claudeApiKey) {
                    return {
                        success: false,
                        error: 'Claude API key not available for LLM authentication',
                        method: 'llm',
                        loginTime: Date.now() - startTime
                    };
                }
                core.info('🤖 Using LLM-powered authentication...');
                const success = await (0, llm_browser_agent_1.authenticateWithLLM)(page, params.email, params.password, params.loginUrl, claudeApiKey, core.isDebug());
                if (success) {
                    state.memory.set('auth_credentials', {
                        username: params.email,
                        password: params.password,
                        method: 'llm',
                        timestamp: Date.now()
                    });
                    return {
                        success: true,
                        method: 'llm',
                        loginTime: Date.now() - startTime
                    };
                }
                else {
                    return {
                        success: false,
                        error: 'LLM authentication failed',
                        method: 'llm',
                        loginTime: Date.now() - startTime
                    };
                }
            }
            catch (error) {
                await core_1.errorHandler.handleError(error, {
                    severity: core_1.ErrorSeverity.HIGH,
                    category: core_1.ErrorCategory.AUTHENTICATION,
                    userAction: 'LLM-powered login attempt',
                    metadata: {
                        method: 'llm',
                        hasLoginUrl: !!params.loginUrl,
                        email: params.email.split('@')[1]
                    },
                    recoverable: true
                });
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'LLM login failed',
                    method: 'llm',
                    loginTime: Date.now() - startTime
                };
            }
        }
    },
    {
        definition: {
            name: 'check_auth_status',
            description: 'Check if currently logged in',
            parameters: {},
            examples: ['check_auth_status']
        },
        handler: async (params, context) => {
            try {
                const { page, state } = context;
                const savedAuth = state.memory.get('auth_credentials');
                const isLoggedIn = await verifyLoginSuccess(page, savedAuth?.username);
                return {
                    success: true,
                    data: {
                        loggedIn: isLoggedIn,
                        savedCredentials: !!savedAuth,
                        currentUrl: page.url()
                    }
                };
            }
            catch (error) {
                await core_1.errorHandler.handleError(error, {
                    severity: core_1.ErrorSeverity.LOW,
                    category: core_1.ErrorCategory.AUTHENTICATION,
                    userAction: 'Check authentication status',
                    metadata: {
                        currentUrl: context.page.url()
                    },
                    recoverable: true
                });
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Auth check failed'
                };
            }
        }
    }
];
function analyzeLoginForm(dom, indexer) {
    const elements = {
        usernameField: null,
        emailField: null,
        passwordField: null,
        submitButton: null,
        rememberCheckbox: null
    };
    for (const [id, element] of dom.elements) {
        if (!element.isVisible)
            continue;
        if (element.tag === 'input' &&
            (element.attributes.type === 'email' ||
                element.attributes.name?.includes('email') ||
                element.attributes.placeholder?.toLowerCase().includes('email'))) {
            elements.emailField = element;
        }
        else if (element.tag === 'input' &&
            (element.attributes.type === 'text' || element.attributes.type === 'username') &&
            (element.attributes.name?.includes('user') ||
                element.attributes.placeholder?.toLowerCase().includes('username') ||
                element.attributes['aria-label']?.toLowerCase().includes('username'))) {
            elements.usernameField = element;
        }
        else if (element.tag === 'input' && element.attributes.type === 'password') {
            elements.passwordField = element;
        }
        else if ((element.tag === 'button' || element.attributes.type === 'submit') &&
            (element.text?.toLowerCase().includes('log') ||
                element.text?.toLowerCase().includes('sign') ||
                element.text?.toLowerCase().includes('submit'))) {
            elements.submitButton = element;
        }
        else if (element.tag === 'input' && element.attributes.type === 'checkbox' &&
            (element.attributes.name?.includes('remember') ||
                element.text?.toLowerCase().includes('remember'))) {
            elements.rememberCheckbox = element;
        }
    }
    if (!elements.usernameField && !elements.emailField && elements.passwordField) {
        const passwordIndex = Array.from(dom.elements.values()).findIndex(e => e === elements.passwordField);
        const textInputs = Array.from(dom.elements.values())
            .slice(0, passwordIndex)
            .filter((e) => e.tag === 'input' && (e.attributes.type === 'text' || !e.attributes.type));
        if (textInputs.length > 0) {
            elements.usernameField = textInputs[textInputs.length - 1];
        }
    }
    return elements;
}
async function check2FARequired(page) {
    const content = await page.textContent('body');
    const keywords = ['verification code', 'two-factor', '2fa', 'authenticator', 'verify your identity'];
    return keywords.some(keyword => content.toLowerCase().includes(keyword));
}
async function handle2FA(page, totpSecret) {
    core.info('2FA handling would generate TOTP code here');
    const otpInput = await page.$('input[type="text"][maxlength="6"], input[type="number"][maxlength="6"]');
    if (otpInput) {
        const code = '123456';
        await otpInput.fill(code);
        const submitButton = await page.$('button[type="submit"], button:has-text("Verify")');
        if (submitButton) {
            await submitButton.click();
        }
        else {
            await page.keyboard.press('Enter');
        }
    }
}
async function verifyLoginSuccess(page, username) {
    const url = page.url();
    const content = await page.textContent('body');
    if (url.includes('/login') || url.includes('/signin')) {
        return false;
    }
    const successIndicators = [
        'dashboard', 'home', 'profile', 'account', 'welcome',
        'logout', 'sign out', 'settings'
    ];
    const hasSuccessIndicator = successIndicators.some(indicator => content.toLowerCase().includes(indicator));
    if (username && content.includes(username)) {
        return true;
    }
    const userElements = await page.$$('[class*="user"], [class*="avatar"], [class*="profile"]');
    return hasSuccessIndicator || userElements.length > 0;
}
function findLogoutElements(dom, indexer) {
    const logoutElements = [];
    for (const [id, element] of dom.elements) {
        if (!element.isVisible || !element.isInteractive)
            continue;
        const text = (element.text || '').toLowerCase();
        const href = (element.attributes.href || '').toLowerCase();
        if (text.includes('logout') || text.includes('log out') ||
            text.includes('sign out') || href.includes('logout')) {
            logoutElements.push(element);
        }
    }
    return logoutElements;
}
function findUserMenuElements(dom, indexer) {
    const menuElements = [];
    for (const [id, element] of dom.elements) {
        if (!element.isVisible || !element.isInteractive)
            continue;
        const classes = element.attributes.class || '';
        const role = element.attributes.role || '';
        if (classes.includes('avatar') || classes.includes('user') ||
            classes.includes('profile') || role === 'menu') {
            menuElements.push(element);
        }
    }
    return menuElements;
}
