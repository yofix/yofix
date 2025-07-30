import { ActionDefinition, ActionResult, AgentContext, DOMElement } from '../types';
import { ActionHandler } from '../core/ActionRegistry';
import { DOMIndexer } from '../core/DOMIndexer';
import { ContextAwareElementFinder } from '../core/ContextAwareElementFinder';
import { LogFormatter } from '../utils/LogFormatter';
import * as core from '@actions/core';

const domIndexer = new DOMIndexer();

export function getInteractionActions(llmProvider?: any): Array<{ definition: ActionDefinition; handler: ActionHandler }> {
  const elementFinder = new ContextAwareElementFinder(llmProvider);
  
  return [
  {
    definition: {
      name: 'smart_click',
      description: 'Intelligently find and click elements using context-aware detection',
      parameters: {
        target: { type: 'string', required: true, description: 'What to click (e.g., "submit", "login button", "next")' },
        context: { type: 'string', required: false, description: 'Additional context (e.g., "after filling password")' }
      },
      examples: [
        'smart_click target="submit button"',
        'smart_click target="login" context="after password field"',
        'smart_click target="sign in"'
      ]
    },
    handler: async (params: { target: string; context?: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        
        // Use LLM-based element classification for intelligent selection
        if (params.target.match(/submit|login|sign.*in|continue|buy|add.*cart|help|support/i)) {
          // Try LLM-based classification first for better accuracy
          const taskContext = context.state.task || `click ${params.target}`;
          
          // Get screenshot for visual context (if available)
          let screenshot: Buffer | undefined;
          try {
            screenshot = await page.screenshot({ type: 'png' });
          } catch (e) {
            core.debug('Could not capture screenshot for element classification');
          }
          
          const result = await elementFinder.findElementWithLLMClassification(dom, taskContext, screenshot);
          
          if (result && result.confidence > 50) {
            console.log(`<pre>Smart click: Found ${params.target} with ${result.confidence}% confidence</pre>`);
            console.log(`<pre>Element: [${result.element.index}] ${result.element.tag} "${result.element.text}"</pre>`);
            
            // Highlight before clicking
            await domIndexer.highlightElement(page, result.element.id, 1000);
            
            // Click using best strategy
            if (result.element.boundingBox && result.element.boundingBox.width > 0) {
              const x = result.element.boundingBox.x + result.element.boundingBox.width / 2;
              const y = result.element.boundingBox.y + result.element.boundingBox.height / 2;
              await page.mouse.click(x, y);
            } else {
              await page.click(`xpath=${result.element.xpath}`, { timeout: 5000 });
            }
            
            await page.waitForTimeout(500);
            
            return {
              success: true,
              data: {
                clicked: result.element.tag,
                text: result.element.text,
                confidence: result.confidence,
                reasons: result.reasons
              },
              elementIndex: result.element.index,
              screenshot: await page.screenshot({ type: 'png' })
            };
          }
        }
        
        // Fallback to text-based search
        const elements = domIndexer.findElementsByText(dom, params.target);
        if (elements.length > 0) {
          const element = elements.find(e => e.isVisible && e.isInteractive) || elements[0];
          
          await page.click(`xpath=${element.xpath}`, { timeout: 5000 });
          
          return {
            success: true,
            data: { clicked: element.tag, text: element.text },
            elementIndex: element.index
          };
        }
        
        return { 
          success: false, 
          error: `Could not find element matching "${params.target}"` 
        };
        
      } catch (error) {
        return {
          success: false,
          error: `Smart click failed: ${error}`
        };
      }
    }
  },
  {
    definition: {
      name: 'click',
      description: 'Click on an element by index or text',
      parameters: {
        index: { type: 'number', required: false, description: 'Element index from DOM' },
        text: { type: 'string', required: false, description: 'Text content of element to click' },
        selector: { type: 'string', required: false, description: 'CSS selector (fallback)' }
      },
      examples: [
        'click index=5',
        'click text="Submit"',
        'click text="Sign in"'
      ]
    },
    handler: async (params: { index?: number; text?: string; selector?: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        let element: DOMElement | undefined;
        
        // Find element by index
        if (params.index !== undefined) {
          element = domIndexer.getElementByIndex(dom, params.index);
          if (!element) {
            return { success: false, error: `No element found at index ${params.index}` };
          }
        }
        // Find element by text
        else if (params.text) {
          const elements = domIndexer.findElementsByText(dom, params.text);
          if (elements.length === 0) {
            return { success: false, error: `No element found with text "${params.text}"` };
          }
          // Prefer visible, interactive elements
          element = elements.find(e => e.isVisible && e.isInteractive) || elements[0];
        }
        // Fallback to selector
        else if (params.selector) {
          await page.click(params.selector, { timeout: 5000 });
          return {
            success: true,
            data: { clicked: params.selector },
            screenshot: await page.screenshot({ type: 'png' })
          };
        } else {
          return { success: false, error: 'No element identifier provided' };
        }
        
        // Click the element
        if (element) {
          console.log(`<pre>Clicking element: ${element.tag} with text "${element.text?.substring(0, 50)}"</pre>`);
          
          // Try multiple strategies
          try {
            // Strategy 1: Click by coordinates
            if (element.boundingBox && element.boundingBox.width > 0 && element.boundingBox.height > 0) {
              const x = element.boundingBox.x + element.boundingBox.width / 2;
              const y = element.boundingBox.y + element.boundingBox.height / 2;
              await page.mouse.click(x, y);
            } else {
              // Strategy 2: Use xpath
              await page.click(`xpath=${element.xpath}`, { timeout: 5000 });
            }
            
            // Wait for any navigation or DOM changes
            await page.waitForTimeout(500);
            
            return {
              success: true,
              data: { 
                clicked: element.tag,
                text: element.text,
                index: element.index
              },
              elementIndex: element.index,
              screenshot: await page.screenshot({ type: 'png' })
            };
          } catch (clickError) {
            // Strategy 3: Force click with JavaScript
            await page.evaluate((xpath) => {
              const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
              if (element) element.click();
            }, element.xpath);
            
            return {
              success: true,
              data: { clicked: element.tag, method: 'javascript' },
              elementIndex: element.index
            };
          }
        }
        
        return { success: false, error: 'Could not click element' };
      } catch (error) {
        return {
          success: false,
          error: `Click failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'smart_type',
      description: 'Intelligently find and fill form fields using semantic understanding',
      parameters: {
        field: { type: 'string', required: true, description: 'Field type (email, password, username) or description' },
        text: { type: 'string', required: true, description: 'Text to type' },
        clear: { type: 'boolean', required: false, description: 'Clear field before typing' }
      },
      examples: [
        'smart_type field="email" text="user@example.com"',
        'smart_type field="password" text="secret123"',
        'smart_type field="username" text="johndoe"'
      ]
    },
    handler: async (params: { field: string; text: string; clear?: boolean }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        let element: DOMElement | undefined;
        
        // Try context-aware field finding for common field types
        const fieldType = params.field.toLowerCase();
        if (fieldType.match(/email|password|username/)) {
          const result = await elementFinder.findFormField(dom, fieldType as any);
          if (result && result.confidence > 60) {
            element = result.element;
            console.log(`<pre>Smart type: Found ${fieldType} field with ${result.confidence}% confidence</pre>`);
          }
        }
        
        // Fallback to text/placeholder search
        if (!element) {
          const elements = domIndexer.findElementsByText(dom, params.field);
          const inputElements = Array.from(dom.elements.values()).filter(e => {
            return (e.tag === 'input' || e.tag === 'textarea') &&
                   (e.attributes.placeholder?.toLowerCase().includes(params.field.toLowerCase()) ||
                    e.attributes['aria-label']?.toLowerCase().includes(params.field.toLowerCase()));
          });
          
          element = inputElements[0] || elements.find(e => e.tag === 'input' || e.tag === 'textarea');
        }
        
        if (!element) {
          return { success: false, error: `No input field found matching "${params.field}"` };
        }
        
        // Clear field if requested
        if (params.clear) {
          await page.fill(`xpath=${element.xpath}`, '');
        }
        
        // Type the text
        await page.fill(`xpath=${element.xpath}`, params.text);
        
        return {
          success: true,
          data: { 
            typed: params.text,
            field: element.attributes.placeholder || element.attributes.name || params.field,
            index: element.index
          },
          elementIndex: element.index
        };
      } catch (error) {
        return {
          success: false,
          error: `Smart type failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'type',
      description: 'Type text into an input field',
      parameters: {
        index: { type: 'number', required: false, description: 'Element index from DOM' },
        text: { type: 'string', required: true, description: 'Text to type' },
        field: { type: 'string', required: false, description: 'Field identifier (placeholder, label)' },
        clear: { type: 'boolean', required: false, description: 'Clear field before typing' }
      },
      examples: [
        'type index=2 text="john@example.com"',
        'type field="Email" text="user@test.com" clear=true',
        'type field="Password" text="secret123"'
      ]
    },
    handler: async (params: { index?: number; text: string; field?: string; clear?: boolean }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        let element: DOMElement | undefined;
        
        // Find element by index
        if (params.index !== undefined) {
          element = domIndexer.getElementByIndex(dom, params.index);
        }
        // Find by field identifier
        else if (params.field) {
          const elements = domIndexer.findElementsByText(dom, params.field);
          // Also check placeholders and labels
          const inputElements = Array.from(dom.elements.values()).filter(e => {
            return (e.tag === 'input' || e.tag === 'textarea') &&
                   (e.attributes.placeholder?.toLowerCase().includes(params.field!.toLowerCase()) ||
                    e.attributes['aria-label']?.toLowerCase().includes(params.field!.toLowerCase()));
          });
          
          element = inputElements[0] || elements.find(e => e.tag === 'input' || e.tag === 'textarea');
        }
        
        if (!element) {
          return { success: false, error: `No input field found` };
        }
        
        // Clear field if requested
        if (params.clear) {
          await page.fill(`xpath=${element.xpath}`, '');
        }
        
        // Type the text
        await page.fill(`xpath=${element.xpath}`, params.text);
        
        return {
          success: true,
          data: { 
            typed: params.text,
            field: element.attributes.placeholder || element.attributes.name || element.tag,
            index: element.index
          },
          elementIndex: element.index
        };
      } catch (error) {
        return {
          success: false,
          error: `Type failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'select',
      description: 'Select an option from a dropdown',
      parameters: {
        index: { type: 'number', required: false, description: 'Element index from DOM' },
        option: { type: 'string', required: true, description: 'Option to select' },
        field: { type: 'string', required: false, description: 'Dropdown identifier' }
      },
      examples: [
        'select index=3 option="United States"',
        'select field="Country" option="Canada"'
      ]
    },
    handler: async (params: { index?: number; option: string; field?: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        let element: DOMElement | undefined;
        
        if (params.index !== undefined) {
          element = domIndexer.getElementByIndex(dom, params.index);
        } else if (params.field) {
          const elements = Array.from(dom.elements.values()).filter(e => 
            e.tag === 'select' && 
            (e.text?.includes(params.field!) || e.attributes.name?.includes(params.field!))
          );
          element = elements[0];
        }
        
        if (!element || element.tag !== 'select') {
          return { success: false, error: 'No select element found' };
        }
        
        await page.selectOption(`xpath=${element.xpath}`, params.option);
        
        return {
          success: true,
          data: { selected: params.option, field: element.attributes.name || 'dropdown' }
        };
      } catch (error) {
        return {
          success: false,
          error: `Select failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'scroll',
      description: 'Scroll the page or to a specific element',
      parameters: {
        direction: { type: 'string', required: false, description: 'up, down, top, bottom' },
        amount: { type: 'number', required: false, description: 'Pixels to scroll' },
        to_element: { type: 'number', required: false, description: 'Element index to scroll to' }
      },
      examples: [
        'scroll direction="down" amount=500',
        'scroll direction="top"',
        'scroll to_element=10'
      ]
    },
    handler: async (params: { direction?: string; amount?: number; to_element?: number }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        
        if (params.to_element !== undefined) {
          const element = domIndexer.getElementByIndex(dom, params.to_element);
          if (element) {
            await page.evaluate((xpath) => {
              const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, element.xpath);
            
            return { success: true, data: { scrolledTo: `element ${params.to_element}` } };
          }
        }
        
        const scrollAmount = params.amount || 500;
        
        switch (params.direction) {
          case 'up':
            await page.evaluate(amount => window.scrollBy(0, -amount), scrollAmount);
            break;
          case 'down':
            await page.evaluate(amount => window.scrollBy(0, amount), scrollAmount);
            break;
          case 'top':
            await page.evaluate(() => window.scrollTo(0, 0));
            break;
          case 'bottom':
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            break;
          default:
            await page.evaluate(amount => window.scrollBy(0, amount), scrollAmount);
        }
        
        await page.waitForTimeout(500); // Wait for scroll animation
        
        return {
          success: true,
          data: { scrolled: params.direction || 'down', amount: scrollAmount },
          screenshot: await page.screenshot({ type: 'png' })
        };
      } catch (error) {
        return {
          success: false,
          error: `Scroll failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'hover',
      description: 'Hover over an element',
      parameters: {
        index: { type: 'number', required: false, description: 'Element index from DOM' },
        text: { type: 'string', required: false, description: 'Text of element to hover' }
      },
      examples: [
        'hover index=7',
        'hover text="More options"'
      ]
    },
    handler: async (params: { index?: number; text?: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page, dom } = context;
        let element: DOMElement | undefined;
        
        if (params.index !== undefined) {
          element = domIndexer.getElementByIndex(dom, params.index);
        } else if (params.text) {
          const elements = domIndexer.findElementsByText(dom, params.text);
          element = elements.find(e => e.isVisible) || elements[0];
        }
        
        if (!element) {
          return { success: false, error: 'No element found to hover' };
        }
        
        if (element.boundingBox && element.boundingBox.width > 0) {
          const x = element.boundingBox.x + element.boundingBox.width / 2;
          const y = element.boundingBox.y + element.boundingBox.height / 2;
          await page.mouse.move(x, y);
        } else {
          await page.hover(`xpath=${element.xpath}`);
        }
        
        await page.waitForTimeout(500); // Wait for hover effects
        
        return {
          success: true,
          data: { hovered: element.tag, text: element.text },
          screenshot: await page.screenshot({ type: 'png' })
        };
      } catch (error) {
        return {
          success: false,
          error: `Hover failed: ${error}`
        };
      }
    }
  },
  
  {
    definition: {
      name: 'press_key',
      description: 'Press a keyboard key',
      parameters: {
        key: { type: 'string', required: true, description: 'Key to press (Enter, Escape, Tab, etc.)' }
      },
      examples: [
        'press_key key="Enter"',
        'press_key key="Escape"',
        'press_key key="Tab"'
      ]
    },
    handler: async (params: { key: string }, context: AgentContext): Promise<ActionResult> => {
      try {
        const { page } = context;
        
        await page.keyboard.press(params.key);
        
        return {
          success: true,
          data: { pressed: params.key }
        };
      } catch (error) {
        return {
          success: false,
          error: `Key press failed: ${error}`
        };
      }
    }
  }
  ];
}

// Export for backward compatibility
export const interactionActions = getInteractionActions();