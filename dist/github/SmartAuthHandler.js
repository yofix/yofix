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
exports.createAuthHandler = createAuthHandler;
const core = __importStar(require("@actions/core"));
const Agent_1 = require("../browser-agent/core/Agent");
const AuthMetrics_1 = require("../monitoring/AuthMetrics");
class SmartAuthHandler {
    constructor(authConfig, claudeApiKey) {
        this.authConfig = authConfig;
        this.claudeApiKey = claudeApiKey;
    }
    async login(page, baseUrl) {
        const startTime = Date.now();
        try {
            let loginUrl = this.authConfig.loginUrl;
            if (loginUrl === 'auto-detect' || !loginUrl) {
                core.info('🔍 Auto-detecting login page...');
                loginUrl = await this.autoDetectLoginUrl(baseUrl);
                core.info(`✅ Detected login URL: ${loginUrl}`);
            }
            core.info(`🤖 Smart login: Using browser-agent for ${baseUrl}${loginUrl}`);
            const browserContext = page.context();
            const browser = browserContext.browser();
            if (!browser) {
                throw new Error('No browser context available');
            }
            const loginTask = `
        1. Navigate to ${baseUrl}${loginUrl}
        2. Use smart_login with email="${this.authConfig.email}" password="${this.authConfig.password}"
        3. Verify login was successful by checking for dashboard or profile elements
      `;
            const agent = new Agent_1.Agent(loginTask, {
                headless: true,
                maxSteps: 10,
                llmProvider: 'anthropic'
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            const result = await agent.run();
            const finalUrl = result.finalUrl;
            const success = result.success && !finalUrl.includes('/login') && !finalUrl.includes('/signin');
            AuthMetrics_1.authMonitor.recordAttempt({
                success,
                method: 'browser-agent',
                url: `${baseUrl}${this.authConfig.loginUrl}`,
                duration: Date.now() - startTime
            });
            if (success) {
                core.info(`✅ Browser-agent login successful. Final URL: ${finalUrl}`);
            }
            else {
                core.warning(`⚠️ Browser-agent login may have failed. Final URL: ${finalUrl}`);
            }
            await agent.cleanup();
            return success;
        }
        catch (error) {
            core.error(`❌ Browser-agent login failed: ${error}`);
            AuthMetrics_1.authMonitor.recordAttempt({
                success: false,
                method: 'browser-agent',
                url: `${baseUrl}${this.authConfig.loginUrl}`,
                errorType: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime
            });
            return false;
        }
    }
    async logout(page) {
        try {
            core.info('🤖 Smart logout: Using browser-agent');
            const browserContext = page.context();
            const browser = browserContext.browser();
            if (!browser) {
                throw new Error('No browser context available');
            }
            const logoutTask = 'Find and click the logout button to sign out of the application';
            const agent = new Agent_1.Agent(logoutTask, {
                headless: true,
                maxSteps: 5,
                llmProvider: 'anthropic'
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            await agent.run();
            await agent.cleanup();
            core.info('✅ Browser-agent logout completed');
        }
        catch (error) {
            core.warning(`⚠️ Browser-agent logout failed: ${error}`);
        }
    }
    async autoDetectLoginUrl(baseUrl) {
        try {
            const detectionTask = `
        Navigate to ${baseUrl} and find the login page:
        
        1. Look for common login indicators:
           - Links with text like "Login", "Sign In", "Log In", "Sign Up"
           - Buttons with login/signin text
           - Navigation items for authentication
           - User account icons or profile links
           
        2. Check common login URLs by visiting them:
           - /login
           - /signin  
           - /auth/login
           - /user/login
           - /account/login
           - /auth
           - /sign-in
           
        3. If you find a login link or button, click on it to get the actual login page URL
        
        4. Look for pages with login forms (username/email and password fields)
        
        5. Save the final login page URL to /detected-login-url.txt
        
        6. If no login is found, save "/login" as fallback to /detected-login-url.txt
        
        Focus on finding the actual login page where users enter credentials.
      `;
            const agent = new Agent_1.Agent(detectionTask, {
                headless: true,
                maxSteps: 15,
                llmProvider: 'anthropic',
                viewport: { width: 1920, height: 1080 }
            });
            process.env.ANTHROPIC_API_KEY = this.claudeApiKey;
            await agent.initialize();
            const result = await agent.run();
            const agentState = agent.getState();
            const detectedUrl = agentState.fileSystem.get('/detected-login-url.txt');
            await agent.cleanup();
            if (detectedUrl) {
                let loginUrl = detectedUrl.trim();
                try {
                    const url = new URL(loginUrl);
                    loginUrl = url.pathname;
                }
                catch (e) {
                    if (!loginUrl.startsWith('/')) {
                        loginUrl = '/' + loginUrl;
                    }
                }
                return loginUrl;
            }
            return '/login';
        }
        catch (error) {
            core.warning(`Login URL auto-detection failed: ${error.message}`);
            return '/login';
        }
    }
}
exports.SmartAuthHandler = SmartAuthHandler;
function createAuthHandler(authConfig, claudeApiKey) {
    return new SmartAuthHandler(authConfig, claudeApiKey);
}
