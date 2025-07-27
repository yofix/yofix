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
class AuthHandler {
    constructor(authConfig) {
        this.authConfig = authConfig;
    }
    async login(page, baseUrl) {
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
                'input[aria-label*="email" i]'
            ];
            let emailInput = null;
            for (const selector of emailSelectors) {
                try {
                    emailInput = await page.waitForSelector(selector, { timeout: 5000 });
                    if (emailInput)
                        break;
                }
                catch (e) {
                }
            }
            if (!emailInput) {
                throw new Error('Could not find email input field');
            }
            const passwordSelectors = [
                'input[type="password"]',
                'input[name="password"]',
                'input[id="password"]',
                'input[placeholder*="password" i]',
                'input[aria-label*="password" i]'
            ];
            let passwordInput = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordInput = await page.waitForSelector(selector, { timeout: 5000 });
                    if (passwordInput)
                        break;
                }
                catch (e) {
                }
            }
            if (!passwordInput) {
                throw new Error('Could not find password input field');
            }
            await emailInput.fill(this.authConfig.email);
            await passwordInput.fill(this.authConfig.password);
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Login")',
                'button:has-text("Sign in")',
                'button:has-text("Log in")',
                '*[role="button"]:has-text("Login")',
                '*[role="button"]:has-text("Sign in")'
            ];
            let submitButton = null;
            for (const selector of submitSelectors) {
                try {
                    submitButton = await page.locator(selector).first();
                    if (await submitButton.isVisible())
                        break;
                }
                catch (e) {
                }
            }
            if (!submitButton) {
                throw new Error('Could not find submit button');
            }
            await Promise.all([
                page.waitForNavigation({
                    waitUntil: 'networkidle',
                    timeout: 30000
                }).catch(() => {
                    core.info('No navigation detected after login, checking for SPA behavior');
                }),
                submitButton.click()
            ]);
            await page.waitForTimeout(3000);
            const isLoggedIn = await this.verifyLogin(page);
            if (isLoggedIn) {
                core.info('Login successful');
                const cookies = await page.context().cookies();
                const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
                const sessionStorage = await page.evaluate(() => JSON.stringify(window.sessionStorage));
                return true;
            }
            else {
                core.warning('Login verification failed');
                return false;
            }
        }
        catch (error) {
            core.error(`Login failed: ${error}`);
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
                '*:has-text("incorrect")'
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
            '.user-avatar',
            '.user-profile',
            'button:has-text("Logout")',
            'button:has-text("Sign out")',
            'a:has-text("Profile")',
            'a:has-text("Dashboard")',
            'nav a[href*="dashboard"]'
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
                '[data-testid="logout-button"]'
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
