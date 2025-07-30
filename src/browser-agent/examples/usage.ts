import { Agent } from '../core/Agent';
import { visualTestingActions } from '../actions/visual';
import { authActions } from '../actions/auth';

/**
 * Example 1: Simple navigation and data extraction
 */
async function exampleBasicUsage() {
  const agent = new Agent('Go to example.com and extract the main heading', {
    headless: true,
    llmProvider: 'anthropic'
  });
  
  try {
    await agent.initialize();
    const result = await agent.run();
    
    console.log('Task completed:', result.success);
    console.log('Steps taken:', result.steps.length);
    console.log('Final URL:', result.finalUrl);
  } finally {
    await agent.cleanup();
  }
}

/**
 * Example 2: Login and visual testing
 */
async function exampleVisualTesting() {
  const agent = new Agent(
    'Login to the demo site and check for visual issues on the dashboard',
    {
      headless: false, // Show browser for debugging
      maxSteps: 30
    }
  );
  
  try {
    await agent.initialize();
    
    // First login
    await agent.run();
    
    // The agent will:
    // 1. Navigate to login page
    // 2. Use smart_login to fill credentials
    // 3. Navigate to dashboard
    // 4. Run check_visual_issues
    // 5. Generate fixes if issues found
    
  } finally {
    await agent.cleanup();
  }
}

/**
 * Example 3: Custom action registration
 */
async function exampleCustomAction() {
  const agent = new Agent('Use my custom action to do something special', {
    headless: true
  });
  
  // Register a custom action
  agent.registerAction(
    {
      name: 'my_custom_action',
      description: 'Does something special',
      parameters: {
        message: { type: 'string', required: true }
      }
    },
    async (params, context) => {
      console.log('Custom action executed:', params.message);
      
      // Do something with the page
      const title = await context.page.title();
      
      return {
        success: true,
        data: { pageTitle: title, message: params.message }
      };
    }
  );
  
  try {
    await agent.initialize();
    await agent.run();
  } finally {
    await agent.cleanup();
  }
}

/**
 * Example 4: Complex workflow with memory
 */
async function exampleComplexWorkflow() {
  const task = `
    1. Go to an e-commerce site
    2. Search for "laptop"
    3. Extract prices of first 5 results
    4. Save prices to a file
    5. Find the cheapest option
    6. Click on it for more details
  `;
  
  const agent = new Agent(task, {
    headless: false,
    maxSteps: 50
  });
  
  try {
    await agent.initialize();
    const result = await agent.run();
    
    // Access saved files
    const state = agent.getState();
    for (const [path, content] of state.fileSystem) {
      console.log(`File ${path}:`, content);
    }
    
    // Export state for later
    const exportedState = agent.exportState();
    console.log('State exported, can be restored later');
    
  } finally {
    await agent.cleanup();
  }
}

/**
 * Example 5: Using with existing YoFix visual testing
 */
async function exampleYoFixIntegration() {
  const agent = new Agent(
    'Test visual regression on multiple pages',
    {
      headless: true,
      viewport: { width: 1920, height: 1080 }
    }
  );
  
  const urls = ['/home', '/about', '/contact'];
  
  try {
    await agent.initialize();
    
    for (const url of urls) {
      // Navigate and test each page
      const task = `
        1. Go to ${url}
        2. Run check_visual_issues with screenshots
        3. Test responsive at mobile and tablet sizes
        4. Save any issues found to /issues${url}.json
      `;
      
      // Update task
      const newAgent = new Agent(task, { headless: true });
      await newAgent.initialize();
      const result = await newAgent.run();
      
      if (!result.success) {
        console.error(`Failed to test ${url}:`, result.error);
      }
      
      await newAgent.cleanup();
    }
  } finally {
    await agent.cleanup();
  }
}

/**
 * Example 6: Direct API usage without natural language
 */
async function exampleDirectAPI() {
  const { ActionRegistry, DOMIndexer, StateManager } = await import('../index');
  const { registerBuiltInActions } = await import('../actions');
  const { chromium } = await import('playwright');
  
  // Create components
  const registry = new ActionRegistry();
  registerBuiltInActions(registry);
  
  const domIndexer = new DOMIndexer();
  const stateManager = new StateManager('Direct API usage');
  
  // Setup browser
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate
    await page.goto('https://example.com');
    
    // Index DOM
    const dom = await domIndexer.indexPage(page);
    console.log(`Found ${dom.interactiveElements.length} interactive elements`);
    
    // Execute action directly
    const result = await registry.execute('screenshot', { fullPage: true }, {
      page,
      browser,
      context,
      dom,
      state: stateManager.getState()
    });
    
    if (result.success && result.screenshot) {
      console.log('Screenshot taken, size:', result.screenshot.length);
    }
    
  } finally {
    await browser.close();
  }
}

// Run examples
if (require.main === module) {
  (async () => {
    console.log('Running browser-agent examples...\n');
    
    // Run the example you want to test
    await exampleBasicUsage();
    
    console.log('\nExamples completed!');
  })().catch(console.error);
}