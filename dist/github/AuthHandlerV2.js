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
exports.AuthHandlerV2 = void 0;
exports.createAuthHandler = createAuthHandler;
const core = __importStar(require("@actions/core"));
const SmartAuthHandler_1 = require("./SmartAuthHandler");
class AuthHandlerV2 {
    constructor(authConfig, claudeApiKey) {
        this.authConfig = authConfig;
        this.useSmartMode = !!claudeApiKey;
        if (claudeApiKey) {
            this.smartHandler = new SmartAuthHandler_1.SmartAuthHandler(authConfig, claudeApiKey);
        }
    }
    async login(page, baseUrl) {
        if (this.smartHandler) {
            core.info('🤖 Attempting smart login with AI...');
            try {
                const result = await this.smartHandler.login(page, baseUrl);
                if (result) {
                    core.info('✅ Smart login successful!');
                    return true;
                }
            }
            catch (error) {
                core.warning(`Smart login failed, falling back to selectors: ${error}`);
            }
        }
        core.info('📝 Using selector-based login...');
        return await this.selectorBasedLogin(page, baseUrl);
    }
    async selectorBasedLogin(page, baseUrl) {
        try {
            await page.goto(`${baseUrl}${this.authConfig.loginUrl}`, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            const emailInput = await this.findInput(page, [
                'input[type="email"]',
                'input[name="email"]',
                'input[name="username"]',
                '#email',
                '#username'
            ]);
            if (!emailInput) {
                throw new Error('Could not find email input');
            }
            const passwordInput = await this.findInput(page, [
                'input[type="password"]',
                'input[name="password"]',
                '#password'
            ]);
            if (!passwordInput) {
                throw new Error('Could not find password input');
            }
            await emailInput.fill(this.authConfig.email);
            await passwordInput.fill(this.authConfig.password);
            const submitted = await this.submitForm(page, passwordInput);
            if (!submitted) {
                throw new Error('Could not submit form');
            }
            await page.waitForTimeout(3000);
            return await this.isLoggedIn(page);
        }
        catch (error) {
            core.error(`Selector-based login failed: ${error}`);
            return false;
        }
    }
    async findInput(page, selectors) {
        for (const selector of selectors) {
            try {
                const element = await page.$(selector);
                if (element && await element.isVisible() && await element.isEnabled()) {
                    return element;
                }
            }
            catch (e) {
                continue;
            }
        }
        return null;
    }
    async submitForm(page, lastInput) {
        const submitButton = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
        if (submitButton && await submitButton.isVisible()) {
            await submitButton.click();
            return true;
        }
        await lastInput.press('Enter');
        return true;
    }
    async isLoggedIn(page) {
        const url = page.url();
        if (!url.includes('/login') && !url.includes('/signin')) {
            return true;
        }
        const loggedInElement = await page.$('[data-testid="user-menu"], .user-avatar, button:has-text("Logout")');
        return !!loggedInElement;
    }
}
exports.AuthHandlerV2 = AuthHandlerV2;
function createAuthHandler(authConfig, claudeApiKey, forceSmartMode) {
    if (forceSmartMode && claudeApiKey) {
        return new SmartAuthHandler_1.SmartAuthHandler(authConfig, claudeApiKey);
    }
    return new AuthHandlerV2(authConfig, claudeApiKey);
}
