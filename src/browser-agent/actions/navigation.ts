import { ActionDefinition, ActionResult, AgentContext } from '../types';
import { ActionHandler } from '../core/ActionRegistry';
import * as core from '@actions/core';

export const navigateActions: Array<{ definition: ActionDefinition; handler: ActionHandler }> = [
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
    handler: async (params: { url: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page } = context;
        const url = params.url;
        
        // Handle relative URLs
        const targetUrl = url.startsWith('http') ? url : new URL(url, page.url()).href;
        
        core.info(`Navigating to: ${targetUrl}`);
        await page.goto(targetUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000 
        });
        
        // Wait for initial content
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
          // Ignore timeout, page might still be loading
        });
        
        // Update state
        context.state.currentUrl = page.url();
        
        return {
          success: true,
          data: { finalUrl: page.url() },
          screenshot: await page.screenshot({ type: 'png' })
        };
      } catch (error) {
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
    handler: async (params: {}, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page } = context;
        
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
        context.state.currentUrl = page.url();
        
        return {
          success: true,
          data: { url: page.url() },
          screenshot: await page.screenshot({ type: 'png' })
        };
      } catch (error) {
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
    handler: async (params: {}, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page } = context;
        
        await page.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 });
        context.state.currentUrl = page.url();
        
        return {
          success: true,
          data: { url: page.url() },
          screenshot: await page.screenshot({ type: 'png' })
        };
      } catch (error) {
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
    handler: async (params: { hard?: boolean }, context: AgentContext): Promise<ActionResult> => {
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
      } catch (error) {
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
    handler: async (params: { seconds?: number; for_element?: string; for_url?: string }, context: AgentContext): Promise<ActionResult> => {
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
          await page.waitForURL(url => url.href.includes(params.for_url!), { timeout: 30000 });
          return { success: true, data: { url: page.url() } };
        }
        
        return {
          success: false,
          error: 'No wait condition specified'
        };
      } catch (error) {
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
    handler: async (params: { query: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page } = context;
        
        // Navigate to Google
        await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
        
        // Find search box and type query
        await page.fill('input[name="q"]', params.query);
        await page.keyboard.press('Enter');
        
        // Wait for results
        await page.waitForSelector('#search', { timeout: 10000 });
        
        context.state.currentUrl = page.url();
        
        return {
          success: true,
          data: { query: params.query, resultsUrl: page.url() },
          screenshot: await page.screenshot({ type: 'png' })
        };
      } catch (error) {
        return {
          success: false,
          error: `Google search failed: ${error}`
        };
      }
    }
  }
];