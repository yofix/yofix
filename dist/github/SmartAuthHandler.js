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
exports.SmartAuthHandler = void 0;
const core = __importStar(require("@actions/core"));
const VisualAnalyzer_1 = require("../core/analysis/VisualAnalyzer");
const AuthMetrics_1 = require("../monitoring/AuthMetrics");
const EnhancedContextProvider_1 = require("../context/EnhancedContextProvider");
class SmartAuthHandler {
    constructor(authConfig, claudeApiKey) {
        this.authConfig = authConfig;
        this.visualAnalyzer = new VisualAnalyzer_1.VisualAnalyzer(claudeApiKey, '');
        this.contextProvider = new EnhancedContextProvider_1.EnhancedContextProvider(claudeApiKey);
    }
    async login(page, baseUrl) {
        const startTime = Date.now();
        try {
            core.info(`🤖 Smart login: Navigating to ${baseUrl}${this.authConfig.loginUrl}`);
            await page.goto(`${baseUrl}${this.authConfig.loginUrl}`, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            const screenshot = await page.screenshot({
                fullPage: false,
                type: 'png'
            });
            const formAnalysis = await this.analyzeLoginForm(screenshot);
            if (!formAnalysis.success) {
                throw new Error(`Could not understand login form: ${formAnalysis.error}`);
            }
            if (formAnalysis.emailSelector) {
                core.info(`AI found email field: ${formAnalysis.emailSelector}`);
                await page.fill(formAnalysis.emailSelector, this.authConfig.email);
            }
            else {
                throw new Error('Could not find email/username field');
            }
            if (formAnalysis.passwordSelector) {
                core.info(`AI found password field: ${formAnalysis.passwordSelector}`);
                await page.fill(formAnalysis.passwordSelector, this.authConfig.password);
            }
            else {
                throw new Error('Could not find password field');
            }
            if (formAnalysis.submitSelector) {
                core.info(`AI found submit button: ${formAnalysis.submitSelector}`);
                await page.click(formAnalysis.submitSelector);
            }
            else if (formAnalysis.submitMethod === 'enter') {
                core.info('AI suggests pressing Enter to submit');
                await page.keyboard.press('Enter');
            }
            else {
                throw new Error('Could not find submit method');
            }
            await this.waitForLoginCompletion(page);
            const success = await this.verifyLoginWithAI(page);
            AuthMetrics_1.authMonitor.recordAttempt({
                success,
                method: 'smart',
                url: `${baseUrl}${this.authConfig.loginUrl}`,
                duration: Date.now() - startTime
            });
            return success;
        }
        catch (error) {
            core.error(`Smart login failed: ${error}`);
            try {
                const debugScreenshot = await page.screenshot({
                    fullPage: true,
                    type: 'png'
                });
                const debugAnalysis = await this.analyzeLoginError(debugScreenshot);
                core.info(`AI error analysis: ${debugAnalysis}`);
            }
            catch (e) {
                core.warning(`Could not analyze error: ${e}`);
            }
            AuthMetrics_1.authMonitor.recordAttempt({
                success: false,
                method: 'smart',
                url: `${baseUrl}${this.authConfig.loginUrl}`,
                errorType: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime
            });
            return false;
        }
    }
    async analyzeLoginForm(screenshot) {
        const context = await this.contextProvider.buildContext(process.cwd(), [
            'src/github/AuthHandler.ts',
            'src/types.ts',
            '.github/workflows/*.yml'
        ]);
        const basePrompt = `
      Analyze this login form screenshot and identify:
      1. The email/username input field
      2. The password input field
      3. The submit/login button
      
      For each element found, provide the most specific CSS selector possible.
      Consider these patterns:
      - Input fields might have type="email", type="text", or type="password"
      - Look for labels, placeholders, or nearby text that indicates the field purpose
      - Submit buttons might say "Login", "Sign in", "Continue", etc.
      
      Return a JSON object with:
      {
        "emailSelector": "selector for email/username field",
        "passwordSelector": "selector for password field",
        "submitSelector": "selector for submit button",
        "submitMethod": "click" or "enter" if no button found
      }
      
      If you cannot find any field, set it to null.
    `;
        const analysis = await this.contextProvider.analyzeWithContext(basePrompt, context);
        try {
            const visualAnalysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, basePrompt);
            const result = this.parseAIResponse(visualAnalysis || analysis);
            return await this.validateSelectors(result);
        }
        catch (error) {
            return {
                success: false,
                error: `Form analysis failed: ${error}`
            };
        }
    }
    parseAIResponse(aiResponse) {
        try {
            if (typeof aiResponse === 'string') {
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
            return aiResponse;
        }
        catch (error) {
            core.warning(`Could not parse AI response: ${error}`);
            return {
                emailSelector: 'input[type="email"], input[type="text"]',
                passwordSelector: 'input[type="password"]',
                submitSelector: 'button[type="submit"], button',
                submitMethod: 'click'
            };
        }
    }
    async validateSelectors(selectors) {
        return {
            success: true,
            ...selectors
        };
    }
    async waitForLoginCompletion(page) {
        await Promise.race([
            page.waitForNavigation({
                waitUntil: 'networkidle',
                timeout: 30000
            }).catch(() => {
                core.info('No navigation detected, checking for SPA behavior');
            }),
            page.waitForTimeout(5000)
        ]);
        await page.waitForTimeout(2000);
    }
    async verifyLoginWithAI(page) {
        const screenshot = await page.screenshot({ fullPage: false, type: 'png' });
        const context = await this.contextProvider.buildContext(process.cwd(), [
            'src/types.ts',
            'src/bot/types.ts'
        ]);
        const basePrompt = `
      Analyze this screenshot to determine if the user is logged in.
      
      Look for indicators such as:
      - User profile/avatar elements
      - Logout/Sign out buttons
      - Dashboard or authenticated content
      - Welcome messages with user info
      - Navigation changes indicating authenticated state
      
      Also check for login failure indicators:
      - Error messages
      - "Invalid credentials" or similar text
      - Still on login page with form visible
      
      Return: { "loggedIn": true/false, "confidence": 0-100, "reason": "explanation" }
    `;
        try {
            const analysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, basePrompt);
            const result = this.parseAIResponse(analysis);
            core.info(`AI login verification: ${JSON.stringify(result)}`);
            return result.loggedIn === true && result.confidence > 70;
        }
        catch (error) {
            core.warning(`AI verification failed: ${error}`);
            const currentUrl = page.url();
            return !currentUrl.includes('/login') && !currentUrl.includes('/signin');
        }
    }
    async analyzeLoginError(screenshot) {
        const prompt = `
      Analyze this login error screenshot and explain:
      1. What went wrong with the login attempt
      2. Any visible error messages
      3. Suggestions for fixing the issue
      
      Be concise and specific.
    `;
        try {
            const analysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, prompt);
            return typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
        }
        catch (error) {
            return `Could not analyze error: ${error}`;
        }
    }
    async logout(page) {
        try {
            const screenshot = await page.screenshot({ fullPage: false, type: 'png' });
            const prompt = `
        Find the logout/sign out button in this screenshot.
        Return the CSS selector for the logout element.
      `;
            const analysis = await this.visualAnalyzer.analyzeScreenshot(screenshot, prompt);
            const result = this.parseAIResponse(analysis);
            if (result.logoutSelector) {
                await page.click(result.logoutSelector);
                await page.waitForTimeout(2000);
                core.info('Smart logout successful');
            }
            else {
                core.warning('Could not find logout button');
            }
        }
        catch (error) {
            core.warning(`Smart logout failed: ${error}`);
        }
    }
}
exports.SmartAuthHandler = SmartAuthHandler;
