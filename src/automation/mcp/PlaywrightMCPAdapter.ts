import * as core from '@actions/core';
import { BrowserSecuritySandbox } from '../security/BrowserSecuritySandbox';
import { MCPManager } from './MCPManager';
import { MCPAction, MCPResult, MCPState } from './types';

// Optional MCP SDK imports - these are optional dependencies
let Client: any;
let StdioClientTransport: any;

try {
  Client = require('@modelcontextprotocol/sdk/client/index.js').Client;
  StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport;
} catch (error) {
  // MCP SDK not installed - this adapter will not be available
  core.warning('MCP SDK not installed. Install @modelcontextprotocol/sdk to use PlaywrightMCPAdapter');
}

/**
 * Adapter to use official Playwright MCP server with YoFix
 * Provides compatibility layer between YoFix and @modelcontextprotocol/server-playwright
 */
export class PlaywrightMCPAdapter extends MCPManager {
  private client: any = null; // Client type from MCP SDK
  private transport: any = null; // StdioClientTransport type from MCP SDK
  private sessionId: string | null = null;

  constructor() {
    super();
    // Use the inherited securitySandbox from MCPManager
  }

  /**
   * Initialize connection to Playwright MCP server
   */
  async initialize(options?: any): Promise<void> {
    try {
      // Start the Playwright MCP server
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

      this.client = new Client(
        {
          name: 'yofix-mcp-client',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: true,
            prompts: true
          }
        }
      );

      await this.client.connect(this.transport);
      
      // List available tools to verify connection
      const tools = await this.client.listTools();
      core.info(`Connected to Playwright MCP server with ${tools.tools.length} tools available`);

      // Create a new browser session
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
    } catch (error) {
      core.error(`Failed to initialize Playwright MCP: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute action using Playwright MCP server
   */
  async executeAction(action: MCPAction): Promise<MCPResult> {
    if (!this.client || !this.sessionId) {
      throw new Error('Playwright MCP not initialized');
    }

    // Validate action with security sandbox
    const validation = await this.securitySandbox.validateAction(action);
    if (!validation.valid) {
      return {
        success: false,
        error: `Security validation failed: ${validation.error}`,
        state: this.state
      };
    }

    try {
      let toolName: string;
      let args: any = { sessionId: this.sessionId };

      // Map YoFix actions to Playwright MCP tools
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
          // Security check for evaluate
          if (!this.securitySandbox.validateScript(action.script)) {
            throw new Error('Script validation failed');
          }
          toolName = 'playwright_evaluate';
          args.script = action.script;
          break;
          
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      // Call the tool
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      // Parse result
      const success = result.content?.[0]?.text?.includes('success') ?? false;
      const data = result.content?.[0]?.text ? 
        JSON.parse(result.content[0].text) : null;

      // Update state
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
    } catch (error) {
      return {
        success: false,
        error: error.message,
        state: this.state
      };
    }
  }

  /**
   * Execute natural language command via MCP
   */
  async executeCommand(command: string): Promise<MCPResult> {
    if (!this.client) {
      throw new Error('Playwright MCP not initialized');
    }

    try {
      // Use MCP's natural language processing if available
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
    } catch (error) {
      // Fallback to our parser
      return super.executeCommand(command);
    }
  }

  /**
   * Get browser state
   */
  getState(): MCPState {
    // For async state updates, we return the cached state
    // The state is updated through other async operations
    return { ...this.state };
  }

  /**
   * Update state from MCP server (async helper)
   */
  private async updateStateFromServer(): Promise<void> {
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
    } catch (error) {
      core.warning(`Failed to get browser state: ${error.message}`);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.client && this.sessionId) {
      try {
        await this.client.callTool({
          name: 'playwright_close',
          arguments: { sessionId: this.sessionId }
        });
      } catch (error) {
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

/**
 * Factory to create MCP manager based on configuration
 */
export function createMCPManager(useOfficialServer: boolean = false): MCPManager {
  if (useOfficialServer) {
    core.info('Using official Playwright MCP server');
    return new PlaywrightMCPAdapter();
  } else {
    core.info('Using built-in MCP implementation');
    return new MCPManager();
  }
}