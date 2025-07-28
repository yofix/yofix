import * as core from '@actions/core';
import { RouteAnalysisResult, TestTemplate, TestAction, TestAssertion, Viewport, FirebaseConfig } from '../../types';
import { EnhancedContextProvider } from '../../context/EnhancedContextProvider';

export class TestGenerator {
  private firebaseConfig: FirebaseConfig;
  private viewports: Viewport[];
  private claudeApiKey?: string;
  private enableAIGeneration: boolean = false;
  private contextProvider?: EnhancedContextProvider;

  constructor(firebaseConfig: FirebaseConfig, viewports: Viewport[], claudeApiKey?: string, enableAIGeneration: boolean = false) {
    this.firebaseConfig = firebaseConfig;
    this.viewports = viewports;
    this.claudeApiKey = claudeApiKey;
    this.enableAIGeneration = enableAIGeneration;
    if (claudeApiKey) {
      this.contextProvider = new EnhancedContextProvider(claudeApiKey);
    }
  }

  /**
   * Generate comprehensive test suite based on route analysis
   */
  async generateTests(analysis: RouteAnalysisResult): Promise<TestTemplate[]> {
    core.info('Generating React SPA tests based on route analysis...');
    
    const tests: TestTemplate[] = [];

    // Always include basic SPA loading test
    tests.push(this.createSPALoadingTest());

    // Use AI to generate additional tests if enabled
    if (this.enableAIGeneration && this.claudeApiKey) {
      core.info('🤖 Using Claude AI to generate context-aware tests...');
      const aiTests = await this.generateTestsWithAI(analysis);
      tests.push(...aiTests);
    }

    // Generate component-specific tests
    if (analysis.components.length > 0) {
      tests.push(...this.createComponentTests(analysis.components));
    }

    // Generate route navigation tests
    if (analysis.routes.length > 0) {
      tests.push(...this.createRouteTests(analysis.routes));
    }

    // Generate form interaction tests if forms are detected
    const formComponents = analysis.components.filter(comp => 
      comp.toLowerCase().includes('form') || 
      comp.toLowerCase().includes('input') ||
      comp.toLowerCase().includes('login') ||
      comp.toLowerCase().includes('signup')
    );
    
    if (formComponents.length > 0) {
      tests.push(...this.createFormTests(formComponents));
    }

    // Add responsive tests for UI changes
    if (analysis.hasUIChanges) {
      tests.push(this.createResponsiveTest());
    }

    // Add error boundary test for high-risk changes
    if (analysis.riskLevel === 'high') {
      tests.push(this.createErrorBoundaryTest());
    }

    core.info(`Generated ${tests.length} tests for React SPA verification`);
    return tests;
  }

  /**
   * Generate tests using Claude AI based on page analysis
   */
  private async generateTestsWithAI(analysis: RouteAnalysisResult): Promise<TestTemplate[]> {
    if (!this.claudeApiKey || !this.contextProvider) return [];

    try {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      const claude = new Anthropic({ apiKey: this.claudeApiKey });

      // Build enhanced context for better test generation
      const context = await this.contextProvider.buildContext(process.cwd(), [
        'src/types.ts',
        'src/bot/types.ts',
        'tests/**/*.spec.ts',
        'playwright.config.ts',
        'package.json'
      ]);

      const basePrompt = `Analyze this web application and generate Playwright test cases:

Application URL: ${this.firebaseConfig.previewUrl}
Routes to test: ${analysis.routes.join(', ')}
Components: ${analysis.components.join(', ')}
Change type: UI changes detected

Generate specific test cases that:
1. Test user interactions (clicks, form fills, navigation)
2. Verify visual elements and layout
3. Check responsive behavior
4. Test error scenarios
5. Validate data flows

For each test, provide:
- Test name and description
- Specific actions to perform
- Expected outcomes to verify

Return as JSON array with this structure:
[{
  "name": "Test name",
  "description": "What this test verifies",
  "actions": [
    {"type": "goto", "target": "url"},
    {"type": "click", "selector": "button.submit"}
  ],
  "assertions": [
    {"type": "visible", "selector": ".success-message"}
  ]
}]`;

      // Use enhanced context for better test generation
      const enhancedPrompt = this.contextProvider.createContextualPrompt(basePrompt, context);

      const response = await claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',  // Better model for test generation
        max_tokens: 2048,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: enhancedPrompt
        }]
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      
      // Parse AI response to extract test cases
      const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);;
      if (jsonMatch) {
        const aiTestCases = JSON.parse(jsonMatch[0]);
        
        // Convert AI test cases to TestTemplate format
        return aiTestCases.map((test: any, index: number) => ({
          id: `ai-test-${index}`,
          name: test.name,
          type: 'interaction' as const,
          selector: test.actions[0]?.selector || 'body',
          actions: test.actions.map((action: any) => ({
            type: action.type,
            target: action.target || action.url,
            selector: action.selector,
            value: action.value,
            timeout: action.timeout || 10000,
            description: action.description
          })),
          assertions: test.assertions.map((assertion: any) => ({
            type: assertion.type,
            target: assertion.selector || assertion.target,
            selector: assertion.selector,
            expected: assertion.expected,
            timeout: assertion.timeout || 10000,
            description: assertion.description
          })),
          viewport: this.viewports[0]
        }));
      }
    } catch (error) {
      core.warning(`AI test generation failed: ${error}`);
    }

    return [];
  }

  /**
   * Create basic SPA loading and hydration test
   */
  private createSPALoadingTest(): TestTemplate {
    const actions: TestAction[] = [
      { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
      { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
    ];

    const assertions: TestAssertion[] = [
      { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 },
      { type: 'text', target: 'title', expected: 'should contain app name' }
    ];

    return {
      id: 'spa-loading',
      name: 'React SPA Loading and Hydration',
      type: 'component',
      selector: this.getSPAReadySelector(),
      actions,
      assertions,
      viewport: this.viewports[0] // Use primary viewport
    };
  }

  /**
   * Create component visibility and interaction tests
   */
  private createComponentTests(components: string[]): TestTemplate[] {
    return components.slice(0, 5).map((component, index) => {
      const selector = this.generateComponentSelector(component);
      
      const actions: TestAction[] = [
        { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
        { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
      ];

      const assertions: TestAssertion[] = [
        { type: 'visible', target: selector, timeout: 10000 }
      ];

      // Add interaction if it's an interactive component
      if (this.isInteractiveComponent(component)) {
        actions.push({ type: 'click', target: selector, timeout: 5000 });
        assertions.push({ 
          type: 'visible', 
          target: `${selector}:not([disabled])`, 
          timeout: 5000 
        });
      }

      return {
        id: `component-${component.toLowerCase()}`,
        name: `${component} Component Verification`,
        type: 'component' as const,
        selector,
        actions,
        assertions,
        viewport: this.viewports[index % this.viewports.length]
      };
    });
  }

  /**
   * Create route navigation tests for React Router
   */
  private createRouteTests(routes: string[]): TestTemplate[] {
    return routes.slice(0, 5).map((route, index) => {
      const fullUrl = this.firebaseConfig.previewUrl + (route.startsWith('/') ? route : `/${route}`);
      
      const actions: TestAction[] = [
        { type: 'goto', target: fullUrl, timeout: 30000 },
        { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
      ];

      const assertions: TestAssertion[] = [
        { type: 'url', target: route, timeout: 10000 },
        { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 }
      ];

      // Check for common page elements
      if (route === '/' || route === '/home') {
        assertions.push({ 
          type: 'visible', 
          target: 'main, [role="main"], .main-content', 
          timeout: 5000 
        });
      }

      return {
        id: `route-${route.replace(/[^a-zA-Z0-9]/g, '-')}`,
        name: `Route Navigation: ${route}`,
        type: 'route' as const,
        selector: this.getSPAReadySelector(),
        actions,
        assertions,
        viewport: this.viewports[index % this.viewports.length]
      };
    });
  }

  /**
   * Create form interaction tests
   */
  private createFormTests(formComponents: string[]): TestTemplate[] {
    return formComponents.slice(0, 3).map(component => {
      const formSelector = this.generateFormSelector(component);
      
      const actions: TestAction[] = [
        { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
        { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 },
        { type: 'wait', target: formSelector, timeout: 10000 }
      ];

      const assertions: TestAssertion[] = [
        { type: 'visible', target: formSelector, timeout: 10000 }
      ];

      // Add form field interactions
      if (component.toLowerCase().includes('login')) {
        actions.push(
          { type: 'fill', target: 'input[type="email"], input[name*="email"]', value: 'test@example.com', timeout: 5000 },
          { type: 'fill', target: 'input[type="password"], input[name*="password"]', value: 'testpassword', timeout: 5000 }
        );
        assertions.push({
          type: 'visible',
          target: 'button[type="submit"], button:has-text("Login"), button:has-text("Sign In")',
          timeout: 5000
        });
      }

      return {
        id: `form-${component.toLowerCase()}`,
        name: `${component} Form Interaction`,
        type: 'form' as const,
        selector: formSelector,
        actions,
        assertions,
        viewport: this.viewports[0]
      };
    });
  }

  /**
   * Create responsive design test
   */
  private createResponsiveTest(): TestTemplate {
    const actions: TestAction[] = [
      { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
      { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
    ];

    const assertions: TestAssertion[] = [
      { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 }
    ];

    return {
      id: 'responsive-design',
      name: 'Responsive Design Verification',
      type: 'interaction' as const,
      selector: 'body',
      actions,
      assertions,
      viewport: this.viewports.find(v => v.width <= 768) || this.viewports[1] // Mobile viewport
    };
  }

  /**
   * Create error boundary test for high-risk changes
   */
  private createErrorBoundaryTest(): TestTemplate {
    const actions: TestAction[] = [
      { type: 'goto', target: this.firebaseConfig.previewUrl, timeout: 30000 },
      { type: 'wait', target: this.getSPAReadySelector(), timeout: 15000 }
    ];

    const assertions: TestAssertion[] = [
      { type: 'visible', target: this.getSPAReadySelector(), timeout: 10000 },
      { type: 'hidden', target: '[data-testid="error-boundary"], .error-boundary, .error-fallback', timeout: 5000 }
    ];

    return {
      id: 'error-boundary',
      name: 'Error Boundary and Crash Prevention',
      type: 'component' as const,
      selector: 'body',
      actions,
      assertions,
      viewport: this.viewports[0]
    };
  }

  /**
   * Generate appropriate selector for React component
   */
  private generateComponentSelector(component: string): string {
    const kebabCase = component.replace(/([A-Z])/g, '-$1').toLowerCase().substring(1);
    
    // Try data-testid first (best practice)
    const selectors = [
      `[data-testid="${kebabCase}"]`,
      `[data-testid="${component.toLowerCase()}"]`,
      `.${kebabCase}`,
      `.${component.toLowerCase()}`,
      `[class*="${kebabCase}"]`,
      `[class*="${component.toLowerCase()}"]`
    ];

    return selectors.join(', ');
  }

  /**
   * Generate form-specific selector
   */
  private generateFormSelector(component: string): string {
    const kebabCase = component.replace(/([A-Z])/g, '-$1').toLowerCase().substring(1);
    
    return [
      `form[data-testid="${kebabCase}"]`,
      `form.${kebabCase}`,
      `[data-testid="${kebabCase}"] form`,
      `.${kebabCase} form`,
      'form'
    ].join(', ');
  }

  /**
   * Get selector that indicates React SPA is ready
   */
  private getSPAReadySelector(): string {
    if (this.firebaseConfig.buildSystem === 'vite') {
      // Vite-specific ready indicators
      return '#root:not(:empty), #app:not(:empty), [data-reactroot], .App';
    } else {
      // Standard React ready indicators  
      return '#root:not(:empty), #app:not(:empty), [data-reactroot]';
    }
  }

  /**
   * Check if component is interactive (button, input, etc.)
   */
  private isInteractiveComponent(component: string): boolean {
    const interactiveKeywords = [
      'button', 'input', 'select', 'form', 'link', 'tab', 'menu', 
      'modal', 'dialog', 'dropdown', 'toggle', 'switch', 'slider'
    ];
    
    return interactiveKeywords.some(keyword => 
      component.toLowerCase().includes(keyword)
    );
  }

  /**
   * Create viewport configurations from input string
   */
  static parseViewports(viewportsInput: string): Viewport[] {
    const defaultViewports: Viewport[] = [
      { width: 1920, height: 1080, name: 'Desktop' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 375, height: 667, name: 'Mobile' }
    ];

    if (!viewportsInput) {
      return defaultViewports;
    }

    try {
      const viewports = viewportsInput.split(',').map(viewport => {
        const [dimensions, name] = viewport.split(':');
        const [width, height] = dimensions.split('x').map(Number);
        
        return {
          width,
          height,
          name: name || `${width}x${height}`
        };
      });

      return viewports.length > 0 ? viewports : defaultViewports;
    } catch (error) {
      core.warning(`Failed to parse viewports "${viewportsInput}". Using defaults.`);
      return defaultViewports;
    }
  }
}