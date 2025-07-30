import { ActionDefinition, ActionResult, AgentContext } from '../types';
import { ActionHandler } from '../core/ActionRegistry';
import { DOMIndexer } from '../core/DOMIndexer';
import * as core from '@actions/core';

const domIndexer = new DOMIndexer();

export const extractionActions: Array<{ definition: ActionDefinition; handler: ActionHandler }> = [
  {
    definition: {
      name: 'get_text',
      description: 'Extract text content from the page or specific element',
      parameters: {
        index: { type: 'number', required: false, description: 'Element index to extract from' },
        selector: { type: 'string', required: false, description: 'CSS selector for element' },
        all: { type: 'boolean', required: false, description: 'Get all text from page' }
      },
      examples: [
        'get_text index=5',
        'get_text selector=".price"',
        'get_text all=true'
      ]
    },
    handler: async (params: { index?: number; selector?: string; all?: boolean }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        
        if (params.all) {
          const text = await page.textContent('body');
          return {
            success: true,
            extractedContent: text?.trim() || '',
            data: { length: text?.length || 0 }
          };
        }
        
        if (params.index !== undefined) {
          const element = domIndexer.getElementByIndex(dom, params.index);
          if (element) {
            return {
              success: true,
              extractedContent: element.text || '',
              data: { element: element.tag, index: element.index }
            };
          }
        }
        
        if (params.selector) {
          const text = await page.textContent(params.selector);
          return {
            success: true,
            extractedContent: text?.trim() || '',
            data: { selector: params.selector }
          };
        }
        
        return {
          success: false,
          error: 'No extraction target specified'
        };
      } catch (error) {
        return {
          success: false,
          error: `Text extraction failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'get_attribute',
      description: 'Get attribute value from an element',
      parameters: {
        index: { type: 'number', required: true, description: 'Element index' },
        attribute: { type: 'string', required: true, description: 'Attribute name' }
      },
      examples: [
        'get_attribute index=3 attribute="href"',
        'get_attribute index=5 attribute="src"'
      ]
    },
    handler: async (params: { index: number; attribute: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { dom } = context;
        const element = domIndexer.getElementByIndex(dom, params.index);
        
        if (!element) {
          return { success: false, error: `No element at index ${params.index}` };
        }
        
        const value = element.attributes[params.attribute];
        
        return {
          success: true,
          extractedContent: value || '',
          data: { 
            element: element.tag,
            attribute: params.attribute,
            value: value || null
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Attribute extraction failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'screenshot',
      description: 'Take a screenshot of the page or element',
      parameters: {
        index: { type: 'number', required: false, description: 'Element index to screenshot' },
        fullPage: { type: 'boolean', required: false, description: 'Capture full page' }
      },
      examples: [
        'screenshot',
        'screenshot fullPage=true',
        'screenshot index=10'
      ]
    },
    handler: async (params: { index?: number; fullPage?: boolean }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        
        let screenshot: Buffer;
        
        if (params.index !== undefined) {
          const element = domIndexer.getElementByIndex(dom, params.index);
          if (!element) {
            return { success: false, error: `No element at index ${params.index}` };
          }
          
          // Screenshot specific element
          const elementHandle = await page.$(`xpath=${element.xpath}`);
          if (elementHandle) {
            screenshot = await elementHandle.screenshot({ type: 'png' });
          } else {
            return { success: false, error: 'Could not find element for screenshot' };
          }
        } else {
          // Full page or viewport screenshot
          screenshot = await page.screenshot({ 
            fullPage: params.fullPage || false,
            type: 'png'
          });
        }
        
        return {
          success: true,
          screenshot,
          data: { 
            type: params.index ? 'element' : (params.fullPage ? 'fullPage' : 'viewport'),
            size: screenshot.length
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Screenshot failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'get_page_info',
      description: 'Get current page information',
      parameters: {},
      examples: ['get_page_info']
    },
    handler: async (params: {}, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page } = context;
        
        const title = await page.title();
        const url = page.url();
        const viewport = page.viewportSize();
        
        return {
          success: true,
          data: {
            title,
            url,
            viewport,
            timestamp: new Date().toISOString()
          },
          extractedContent: JSON.stringify({ title, url }, null, 2)
        };
      } catch (error) {
        return {
          success: false,
          error: `Page info extraction failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'count_elements',
      description: 'Count elements matching criteria',
      parameters: {
        tag: { type: 'string', required: false, description: 'HTML tag to count' },
        text: { type: 'string', required: false, description: 'Text content to match' },
        interactive: { type: 'boolean', required: false, description: 'Count only interactive elements' }
      },
      examples: [
        'count_elements tag="button"',
        'count_elements text="Add to cart"',
        'count_elements interactive=true'
      ]
    },
    handler: async (params: { tag?: string; text?: string; interactive?: boolean }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { dom } = context;
        let count = 0;
        
        for (const [id, element] of dom.elements) {
          let matches = true;
          
          if (params.tag && element.tag !== params.tag.toLowerCase()) {
            matches = false;
          }
          
          if (params.text && !element.text?.toLowerCase().includes(params.text.toLowerCase())) {
            matches = false;
          }
          
          if (params.interactive && !element.isInteractive) {
            matches = false;
          }
          
          if (matches) count++;
        }
        
        return {
          success: true,
          data: { count, criteria: params },
          extractedContent: count.toString()
        };
      } catch (error) {
        return {
          success: false,
          error: `Count failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'save_to_file',
      description: 'Save extracted content to virtual file system',
      parameters: {
        path: { type: 'string', required: true, description: 'File path to save to' },
        content: { type: 'string', required: true, description: 'Content to save' }
      },
      examples: [
        'save_to_file path="/data/prices.txt" content="$99.99"',
        'save_to_file path="/screenshots/page1.txt" content="Screenshot saved"'
      ]
    },
    handler: async (params: { path: string; content: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        context.state.fileSystem.set(params.path, params.content);
        
        core.info(`Saved ${params.content.length} bytes to ${params.path}`);
        
        return {
          success: true,
          data: { 
            path: params.path,
            size: params.content.length,
            totalFiles: context.state.fileSystem.size
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Save failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'read_from_file',
      description: 'Read content from virtual file system',
      parameters: {
        path: { type: 'string', required: true, description: 'File path to read from' }
      },
      examples: ['read_from_file path="/data/prices.txt"']
    },
    handler: async (params: { path: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const content = context.state.fileSystem.get(params.path);
        
        if (!content) {
          return {
            success: false,
            error: `File not found: ${params.path}`
          };
        }
        
        return {
          success: true,
          extractedContent: content,
          data: { path: params.path, size: content.length }
        };
      } catch (error) {
        return {
          success: false,
          error: `Read failed: ${error}`
        };
      }
    }
  }
];