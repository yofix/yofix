import * as core from '@actions/core';
import { Page } from 'playwright';
import { Anthropic } from '@anthropic-ai/sdk';
import { EnhancedContextProvider } from '../../context/EnhancedContextProvider';

export class AINavigationAnalyzer {
  private claude: Anthropic;
  private contextProvider: EnhancedContextProvider;
  
  constructor(claudeApiKey: string) {
    this.claude = new Anthropic({ apiKey: claudeApiKey });
    this.contextProvider = new EnhancedContextProvider(claudeApiKey);
  }
  
  /**
   * Discover routes dynamically by analyzing the current page
   */
  async discoverRoutes(page: Page, baseUrl: string): Promise<string[]> {
    core.info('🧠 Using AI to discover navigation routes...');
    
    try {
      // Take screenshot of current page
      const screenshot = await page.screenshot({ fullPage: true });
      
      // Get page HTML structure
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
      
      // Build enhanced context for better route discovery
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

      // Get contextual understanding first
      const contextualAnalysis = await this.contextProvider.analyzeWithContext(basePrompt, context);
      
      // Use Claude to analyze navigation elements with context
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',  // Better model for navigation understanding
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
      
      // Parse routes from response
      const routeMatch = responseText.match(/\[[\s\S]*?\]/);
      if (routeMatch) {
        const routes = JSON.parse(routeMatch[0]);
        core.info(`AI discovered ${routes.length} routes: ${routes.join(', ')}`);
        return routes;
      }
      
    } catch (error) {
      core.warning(`AI route discovery failed: ${error}`);
    }
    
    return ['/'];
  }
  
  /**
   * Analyze page interactions to generate natural language commands
   */
  async analyzePageInteractions(page: Page): Promise<string[]> {
    try {
      const screenshot = await page.screenshot({ fullPage: false, type: 'png' });
      
      // Build context for better interaction understanding
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
        model: 'claude-3-5-sonnet-20241022',  // Better model for interaction understanding
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
      
    } catch (error) {
      core.warning(`AI interaction analysis failed: ${error}`);
    }
    
    return [];
  }
}