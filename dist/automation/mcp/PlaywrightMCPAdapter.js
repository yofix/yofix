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
exports.PlaywrightMCPAdapter = void 0;
exports.createMCPManager = createMCPManager;
const core = __importStar(require("@actions/core"));
const MCPManager_1 = require("./MCPManager");
let Client;
let StdioClientTransport;
try {
    Client = require('@modelcontextprotocol/sdk/client/index.js').Client;
    StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport;
}
catch (error) {
    core.warning('MCP SDK not installed. Install @modelcontextprotocol/sdk to use PlaywrightMCPAdapter');
}
class PlaywrightMCPAdapter extends MCPManager_1.MCPManager {
    constructor() {
        super();
        this.client = null;
        this.transport = null;
        this.sessionId = null;
    }
    async initialize(options) {
        try {
            this.transport = new StdioClientTransport({
                command: 'npx',
                args: [
                    '@modelcontextprotocol/server-playwright',
                    '--headless',
                    options?.headless !== false ? 'true' : 'false'
                ],
                env: {
                    ...process.env,
                    DEBUG: process.env.DEBUG || 'mcp:*'
                }
            });
            this.client = new Client({
                name: 'yofix-mcp-client',
                version: '1.0.0'
            }, {
                capabilities: {
                    tools: true,
                    prompts: true
                }
            });
            await this.client.connect(this.transport);
            const tools = await this.client.listTools();
            core.info(`Connected to Playwright MCP server with ${tools.tools.length} tools available`);
            const result = await this.client.callTool({
                name: 'playwright_launch',
                arguments: {
                    browser: 'chromium',
                    headless: options?.headless !== false,
                    viewport: options?.viewport || { width: 1920, height: 1080 }
                }
            });
            if (result.content?.[0]?.text) {
                this.sessionId = JSON.parse(result.content[0].text).sessionId;
                core.info(`Browser session created: ${this.sessionId}`);
            }
        }
        catch (error) {
            core.error(`Failed to initialize Playwright MCP: ${error.message}`);
            throw error;
        }
    }
    async executeAction(action) {
        if (!this.client || !this.sessionId) {
            throw new Error('Playwright MCP not initialized');
        }
        const validation = await this.securitySandbox.validateAction(action);
        if (!validation.valid) {
            return {
                success: false,
                error: `Security validation failed: ${validation.error}`,
                state: this.state
            };
        }
        try {
            let toolName;
            let args = { sessionId: this.sessionId };
            switch (action.type) {
                case 'navigate':
                    toolName = 'playwright_navigate';
                    args.url = action.url;
                    break;
                case 'click':
                    toolName = 'playwright_click';
                    args.selector = action.selector;
                    break;
                case 'type':
                    toolName = 'playwright_fill';
                    args.selector = action.selector;
                    args.text = action.text;
                    break;
                case 'screenshot':
                    toolName = 'playwright_screenshot';
                    args.fullPage = action.fullPage;
                    break;
                case 'wait':
                    toolName = 'playwright_wait';
                    args.selector = action.selector;
                    args.timeout = action.timeout;
                    break;
                case 'evaluate':
                    if (!this.securitySandbox.validateScript(action.script)) {
                        throw new Error('Script validation failed');
                    }
                    toolName = 'playwright_evaluate';
                    args.script = action.script;
                    break;
                default:
                    throw new Error(`Unsupported action type: ${action.type}`);
            }
            const result = await this.client.callTool({
                name: toolName,
                arguments: args
            });
            const success = result.content?.[0]?.text?.includes('success') ?? false;
            const data = result.content?.[0]?.text ?
                JSON.parse(result.content[0].text) : null;
            if (data?.state) {
                this.state = {
                    ...this.state,
                    ...data.state
                };
            }
            return {
                success,
                data,
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
    async executeCommand(command) {
        if (!this.client) {
            throw new Error('Playwright MCP not initialized');
        }
        try {
            const result = await this.client.callTool({
                name: 'playwright_command',
                arguments: {
                    sessionId: this.sessionId,
                    command: command
                }
            });
            const data = result.content?.[0]?.text ?
                JSON.parse(result.content[0].text) : null;
            return {
                success: data?.success ?? false,
                data,
                state: this.state
            };
        }
        catch (error) {
            return super.executeCommand(command);
        }
    }
    getState() {
        return { ...this.state };
    }
    async updateStateFromServer() {
        if (!this.client || !this.sessionId) {
            return;
        }
        try {
            const result = await this.client.callTool({
                name: 'playwright_get_state',
                arguments: { sessionId: this.sessionId }
            });
            if (result.content?.[0]?.text) {
                const state = JSON.parse(result.content[0].text);
                this.state = {
                    ...this.state,
                    ...state
                };
            }
        }
        catch (error) {
            core.warning(`Failed to get browser state: ${error.message}`);
        }
    }
    async cleanup() {
        if (this.client && this.sessionId) {
            try {
                await this.client.callTool({
                    name: 'playwright_close',
                    arguments: { sessionId: this.sessionId }
                });
            }
            catch (error) {
                core.warning(`Failed to close browser session: ${error.message}`);
            }
        }
        if (this.transport) {
            await this.transport.close();
        }
        this.client = null;
        this.transport = null;
        this.sessionId = null;
    }
}
exports.PlaywrightMCPAdapter = PlaywrightMCPAdapter;
function createMCPManager(useOfficialServer = false) {
    if (useOfficialServer) {
        core.info('Using official Playwright MCP server');
        return new PlaywrightMCPAdapter();
    }
    else {
        core.info('Using built-in MCP implementation');
        return new MCPManager_1.MCPManager();
    }
}
