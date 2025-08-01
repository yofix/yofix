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
exports.AIRouteDiscovery = void 0;
const core = __importStar(require("@actions/core"));
const sdk_1 = require("@anthropic-ai/sdk");
const EnhancedContextProvider_1 = require("../../context/EnhancedContextProvider");
class AIRouteDiscovery {
    constructor(claudeApiKey) {
        this.claude = new sdk_1.Anthropic({ apiKey: claudeApiKey });
        this.contextProvider = new EnhancedContextProvider_1.EnhancedContextProvider(claudeApiKey);
    }
    async discoverRoutes(page, baseUrl) {
        core.info('🧠 Using AI to discover navigation routes...');
        try {
            const screenshot = await page.screenshot({ fullPage: true });
            const pageContent = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href], button[onclick], [role="link"], [role="button"]'));
                return links.map(el => ({
                    text: el.textContent?.trim() || '',
                    href: el.getAttribute('href') || '',
                    onclick: el.getAttribute('onclick') || '',
                    role: el.getAttribute('role') || '',
                    class: el.className || '',
                    id: el.id || ''
                }));
            });
            const context = await this.contextProvider.buildContext(process.cwd(), [
                'src/types.ts',
                'action.yml',
                'package.json',
                '.github/workflows/*.yml'
            ]);
            const basePrompt = `Analyze this web application and identify all navigation routes:

Base URL: ${baseUrl}
Current URL: ${page.url()}

Navigation elements found:
${JSON.stringify(pageContent, null, 2)}

Please identify:
1. Main navigation links
2. Sub-navigation routes
3. Interactive elements that navigate to new pages
4. Hidden or dynamic routes that might exist

Return a JSON array of routes (paths only, not full URLs):
["route1", "route2", "route3"]

Focus on routes that would show different content or UI states.`;
            const contextualAnalysis = await this.contextProvider.analyzeWithContext(basePrompt, context);
            const response = await this.claude.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                temperature: 0.2,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `${basePrompt}\n\nCodebase context:\n${contextualAnalysis}`
                            },
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/png',
                                    data: screenshot.toString('base64')
                                }
                            }
                        ]
                    }
                ]
            });
            const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
            const routeMatch = responseText.match(/\[[\s\S]*?\]/);
            if (routeMatch) {
                const routes = JSON.parse(routeMatch[0]);
                core.info(`AI discovered ${routes.length} routes: ${routes.join(', ')}`);
                return routes;
            }
        }
        catch (error) {
            core.warning(`AI route discovery failed: ${error}`);
        }
        return ['/'];
    }
    async analyzePageInteractions(page) {
        try {
            const screenshot = await page.screenshot({ fullPage: false, type: 'png' });
            const context = await this.contextProvider.buildContext(process.cwd(), [
                'src/bot/types.ts',
                'src/automation/*.ts'
            ]);
            const basePrompt = `Analyze this page and suggest user interactions to test:

Look for:
- Buttons to click
- Forms to fill
- Dropdowns to select
- Links to navigate
- Interactive elements

Return natural language commands like:
["Click on the login button", "Fill the email field with test@example.com", "Navigate to settings"]

Format as JSON array of commands.`;
            const contextualPrompt = this.contextProvider.createContextualPrompt(basePrompt, context);
            const response = await this.claude.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                temperature: 0.3,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: contextualPrompt
                            },
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/png',
                                    data: screenshot.toString('base64')
                                }
                            }
                        ]
                    }
                ]
            });
            const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
            const commandMatch = responseText.match(/\[[\s\S]*?\]/);
            if (commandMatch) {
                return JSON.parse(commandMatch[0]);
            }
        }
        catch (error) {
            core.warning(`AI interaction analysis failed: ${error}`);
        }
        return [];
    }
}
exports.AIRouteDiscovery = AIRouteDiscovery;
