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
exports.navigateActions = void 0;
const core = __importStar(require("@actions/core"));
exports.navigateActions = [
    {
        definition: {
            name: 'go_to',
            description: 'Navigate to a specific URL',
            parameters: {
                url: { type: 'string', required: true, description: 'The URL to navigate to' }
            },
            examples: [
                'go_to url="https://example.com"',
                'go_to url="/dashboard"'
            ]
        },
        handler: async (params, context) => {
            try {
                const { page } = context;
                const url = params.url;
                const targetUrl = url.startsWith('http') ? url : new URL(url, page.url()).href;
                core.info(`Navigating to: ${targetUrl}`);
                await page.goto(targetUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
                });
                context.state.currentUrl = page.url();
                return {
                    success: true,
                    data: { finalUrl: page.url() },
                    screenshot: await page.screenshot({ type: 'png' })
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Navigation failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'go_back',
            description: 'Navigate back in browser history',
            parameters: {},
            examples: ['go_back']
        },
        handler: async (params, context) => {
            try {
                const { page } = context;
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
                context.state.currentUrl = page.url();
                return {
                    success: true,
                    data: { url: page.url() },
                    screenshot: await page.screenshot({ type: 'png' })
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Go back failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'go_forward',
            description: 'Navigate forward in browser history',
            parameters: {},
            examples: ['go_forward']
        },
        handler: async (params, context) => {
            try {
                const { page } = context;
                await page.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 });
                context.state.currentUrl = page.url();
                return {
                    success: true,
                    data: { url: page.url() },
                    screenshot: await page.screenshot({ type: 'png' })
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Go forward failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'reload',
            description: 'Reload the current page',
            parameters: {
                hard: { type: 'boolean', required: false, description: 'Force reload ignoring cache' }
            },
            examples: ['reload', 'reload hard=true']
        },
        handler: async (params, context) => {
            try {
                const { page } = context;
                await page.reload({
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                return {
                    success: true,
                    data: { url: page.url() },
                    screenshot: await page.screenshot({ type: 'png' })
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Reload failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'wait',
            description: 'Wait for a specified duration or condition',
            parameters: {
                seconds: { type: 'number', required: false, description: 'Number of seconds to wait' },
                for_element: { type: 'string', required: false, description: 'Wait for element with text' },
                for_url: { type: 'string', required: false, description: 'Wait for URL pattern' }
            },
            examples: [
                'wait seconds=2',
                'wait for_element="Login"',
                'wait for_url="/dashboard"'
            ]
        },
        handler: async (params, context) => {
            try {
                const { page } = context;
                if (params.seconds) {
                    await page.waitForTimeout(params.seconds * 1000);
                    return { success: true, data: { waited: `${params.seconds} seconds` } };
                }
                if (params.for_element) {
                    await page.waitForSelector(`text="${params.for_element}"`, { timeout: 30000 });
                    return { success: true, data: { found: params.for_element } };
                }
                if (params.for_url) {
                    await page.waitForURL(url => url.href.includes(params.for_url), { timeout: 30000 });
                    return { success: true, data: { url: page.url() } };
                }
                return {
                    success: false,
                    error: 'No wait condition specified'
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Wait failed: ${error}`
                };
            }
        }
    },
    {
        definition: {
            name: 'search_google',
            description: 'Search Google for a query',
            parameters: {
                query: { type: 'string', required: true, description: 'The search query' }
            },
            examples: ['search_google query="YoFix visual testing"']
        },
        handler: async (params, context) => {
            try {
                const { page } = context;
                await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
                await page.fill('input[name="q"]', params.query);
                await page.keyboard.press('Enter');
                await page.waitForSelector('#search', { timeout: 10000 });
                context.state.currentUrl = page.url();
                return {
                    success: true,
                    data: { query: params.query, resultsUrl: page.url() },
                    screenshot: await page.screenshot({ type: 'png' })
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: `Google search failed: ${error}`
                };
            }
        }
    }
];
