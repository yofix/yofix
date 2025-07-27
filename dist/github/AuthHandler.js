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
exports.AuthHandler = void 0;
const core = __importStar(require("@actions/core"));
const AuthMetrics_1 = require("../monitoring/AuthMetrics");
const SmartAuthHandler_1 = require("./SmartAuthHandler");
class AuthHandler {
    constructor(authConfig, options) {
        this.useSmartMode = false;
        this.authConfig = authConfig;
        if (options?.claudeApiKey && (options.forceSmartMode || process.env.YOFIX_SMART_AUTH === 'true')) {
            this.smartHandler = new SmartAuthHandler_1.SmartAuthHandler(authConfig, options.claudeApiKey);
            this.useSmartMode = true;
            core.info('🧠 Smart authentication mode enabled');
        }
    }
    async login(page, baseUrl) {
        if (this.smartHandler && this.useSmartMode) {
            core.info('🤖 Attempting smart AI-powered login...');
            try {
                const result = await this.smartHandler.login(page, baseUrl);
                if (result) {
                    return true;
                }
                core.warning('Smart login failed, falling back to selector-based approach');
            }
            catch (error) {
                core.warning(`Smart login error: ${error}`);
            }
        }
        const startTime = Date.now();
        let selectorsTried = 0;
        try {
            core.info(`Attempting login at ${baseUrl}${this.authConfig.loginUrl}`);
            await page.goto(`${baseUrl}${this.authConfig.loginUrl}`, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            await page.waitForLoadState('domcontentloaded');
            const emailSelectors = [
                'input[type="email"]',
                'input[name="email"]',
                'input[id="email"]',
                'input[placeholder*="email" i]',
                'input[aria-label*="email" i]',
                'input[autocomplete="email"]',
                'input[data-testid*="email" i]',
                'input[name="username"]',
                'input[id="username"]',
                'input[placeholder*="username" i]',
                'input[name="login"]',
                'input[id="login"]',
                'form input[type="text"]:first-of-type',
                '#email-input',
                '.email-input input',
                '[data-test*="email"] input',
                '[data-cy*="email"] input'
            ];
            let emailInput = null;
            for (const selector of emailSelectors) {
                selectorsTried++;
                try {
                    const elements = await page.$$(selector);
                    for (const element of elements) {
                        const isVisible = await element.isVisible();
                        const isEnabled = await element.isEnabled();
                        if (isVisible && isEnabled) {
                            emailInput = element;
                            core.info(`Found email input using selector: ${selector}`);
                            break;
                        }
                    }
                    if (emailInput)
                        break;
                }
                catch (e) {
                }
            }
            if (!emailInput) {
                const labels = await page.$$('label');
                for (const label of labels) {
                    const text = await label.textContent();
                    if (text && text.toLowerCase().includes('email')) {
                        const forAttr = await label.getAttribute('for');
                        if (forAttr) {
                            emailInput = await page.$(`#${forAttr}`);
                            if (emailInput) {
                                core.info(`Found email input via label for="${forAttr}"`);
                                break;
                            }
                        }
                    }
                }
            }
            if (!emailInput) {
                throw new Error('Could not find email input field. Tried ' + emailSelectors.length + ' selectors.');
            }
            const passwordSelectors = [
                'input[type="password"]',
                'input[name="password"]',
                'input[id="password"]',
                'input[placeholder*="password" i]',
                'input[aria-label*="password" i]',
                'input[autocomplete="current-password"]',
                'input[autocomplete="new-password"]',
                'input[data-testid*="password" i]',
                '#password-input',
                '.password-input input',
                '[data-test*="password"] input',
                '[data-cy*="password"] input'
            ];
            let passwordInput = null;
            for (const selector of passwordSelectors) {
                try {
                    const elements = await page.$$(selector);
                    for (const element of elements) {
                        const isVisible = await element.isVisible();
                        const isEnabled = await element.isEnabled();
                        if (isVisible && isEnabled) {
                            passwordInput = element;
                            core.info(`Found password input using selector: ${selector}`);
                            break;
                        }
                    }
                    if (passwordInput)
                        break;
                }
                catch (e) {
                }
            }
            if (!passwordInput) {
                throw new Error('Could not find password input field');
            }
            await emailInput.click();
            await page.waitForTimeout(100);
            await emailInput.fill('');
            await page.waitForTimeout(100);
            await emailInput.fill(this.authConfig.email);
            await page.waitForTimeout(200);
            await passwordInput.click();
            await page.waitForTimeout(100);
            await passwordInput.fill('');
            await page.waitForTimeout(100);
            await passwordInput.fill(this.authConfig.password);
            await page.waitForTimeout(200);
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Login")',
                'button:has-text("Sign in")',
                'button:has-text("Log in")',
                'button:has-text("Continue")',
                'button:has-text("Submit")',
                '*[role="button"]:has-text("Login")',
                '*[role="button"]:has-text("Sign in")',
                'button.login-button',
                'button.signin-button',
                'button.submit-button',
                '#login-button',
                '#signin-button',
                '[data-testid*="login-button"]',
                '[data-testid*="signin-button"]',
                '[data-cy*="login-button"]',
                '[data-cy*="signin-button"]',
                'input[type="password"] ~ button',
                'input[type="password"] ~ * button',
                'form button:not([type="button"])',
                'form input[type="submit"]',
                'form button[type="submit"]'
            ];
            let submitButton = null;
            for (const selector of submitSelectors) {
                try {
                    const elements = await page.locator(selector).all();
                    for (const element of elements) {
                        if (await element.isVisible()) {
                            submitButton = element;
                            core.info(`Found submit button using selector: ${selector}`);
                            break;
                        }
                    }
                    if (submitButton)
                        break;
                }
                catch (e) {
                }
            }
            if (!submitButton) {
                core.info('Submit button not found, trying Enter key');
                await passwordInput.press('Enter');
            }
            else {
                await submitButton.click();
            }
            await Promise.race([
                page.waitForNavigation({
                    waitUntil: 'networkidle',
                    timeout: 30000
                }).catch(() => {
                    core.info('No navigation detected after login, checking for SPA behavior');
                }),
                page.waitForTimeout(5000)
            ]);
            await page.waitForTimeout(2000);
            const isLoggedIn = await this.verifyLogin(page);
            if (isLoggedIn) {
                core.info('Login successful');
                AuthMetrics_1.authMonitor.recordAttempt({
                    success: true,
                    method: 'selector',
                    url: `${baseUrl}${this.authConfig.loginUrl}`,
                    selectorsTried,
                    duration: Date.now() - startTime
                });
                const cookies = await page.context().cookies();
                const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
                const sessionStorage = await page.evaluate(() => JSON.stringify(window.sessionStorage));
                return true;
            }
            else {
                core.warning('Login verification failed');
                AuthMetrics_1.authMonitor.recordAttempt({
                    success: false,
                    method: 'selector',
                    url: `${baseUrl}${this.authConfig.loginUrl}`,
                    errorType: 'Login verification failed',
                    selectorsTried,
                    duration: Date.now() - startTime
                });
                return false;
            }
        }
        catch (error) {
            core.error(`Login failed: ${error}`);
            AuthMetrics_1.authMonitor.recordAttempt({
                success: false,
                method: 'selector',
                url: `${baseUrl}${this.authConfig.loginUrl}`,
                errorType: error instanceof Error ? error.message : 'Unknown error',
                selectorsTried,
                duration: Date.now() - startTime
            });
            try {
                await page.screenshot({
                    path: '/tmp/login-error.png',
                    fullPage: true
                });
                core.info('Login error screenshot saved to /tmp/login-error.png');
            }
            catch (screenshotError) {
                core.warning(`Failed to take error screenshot: ${screenshotError}`);
            }
            return false;
        }
    }
    async verifyLogin(page) {
        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
            const errorSelectors = [
                '.error-message',
                '.alert-danger',
                '[role="alert"]',
                '*:has-text("Invalid")',
                '*:has-text("incorrect")',
                '*:has-text("failed")',
                '.error',
                '.alert',
                '[data-testid*="error"]'
            ];
            for (const selector of errorSelectors) {
                try {
                    const error = await page.locator(selector).first();
                    if (await error.isVisible()) {
                        const errorText = await error.textContent();
                        core.warning(`Login error detected: ${errorText}`);
                        return false;
                    }
                }
                catch (e) {
                }
            }
        }
        if (this.authConfig.successIndicator) {
            try {
                await page.waitForSelector(this.authConfig.successIndicator, {
                    timeout: 5000,
                    state: 'visible'
                });
                return true;
            }
            catch (e) {
                core.warning(`Success indicator not found: ${this.authConfig.successIndicator}`);
            }
        }
        const loggedInSelectors = [
            '[data-testid="user-menu"]',
            '[data-testid="user-avatar"]',
            '.user-avatar',
            '.user-profile',
            '.user-menu',
            '#user-menu',
            'button:has-text("Logout")',
            'button:has-text("Sign out")',
            'button:has-text("Log out")',
            'a:has-text("Logout")',
            'a:has-text("Sign out")',
            'a:has-text("Profile")',
            'a:has-text("Dashboard")',
            'a:has-text("Account")',
            'nav a[href*="dashboard"]',
            'nav a[href*="profile"]',
            '[aria-label*="user menu" i]',
            '[aria-label*="account" i]'
        ];
        for (const selector of loggedInSelectors) {
            try {
                const element = await page.locator(selector).first();
                if (await element.isVisible()) {
                    core.info(`Found logged-in indicator: ${selector}`);
                    return true;
                }
            }
            catch (e) {
            }
        }
        if (!currentUrl.includes('/login') && !currentUrl.includes('/signin')) {
            core.info('Navigation away from login page detected, assuming success');
            return true;
        }
        return false;
    }
    async logout(page) {
        try {
            core.info('Attempting logout');
            const logoutSelectors = [
                'button:has-text("Logout")',
                'button:has-text("Sign out")',
                'button:has-text("Log out")',
                'a:has-text("Logout")',
                'a:has-text("Sign out")',
                '[data-testid="logout-button"]',
                '[data-testid="signout-button"]'
            ];
            let logoutElement = null;
            for (const selector of logoutSelectors) {
                try {
                    logoutElement = await page.locator(selector).first();
                    if (await logoutElement.isVisible())
                        break;
                }
                catch (e) {
                }
            }
            if (logoutElement) {
                await logoutElement.click();
                await page.waitForTimeout(2000);
                core.info('Logout successful');
            }
            else {
                core.warning('Logout button not found');
            }
        }
        catch (error) {
            core.warning(`Logout failed: ${error}`);
        }
    }
    static createFromEnv() {
        const email = process.env.AUTH_EMAIL || process.env.LOGIN_EMAIL;
        const password = process.env.AUTH_PASSWORD || process.env.LOGIN_PASSWORD;
        const loginUrl = process.env.AUTH_LOGIN_URL || '/login/password';
        if (!email || !password) {
            return null;
        }
        return new AuthHandler({
            loginUrl,
            email,
            password,
            successIndicator: process.env.AUTH_SUCCESS_INDICATOR
        });
    }
}
exports.AuthHandler = AuthHandler;
