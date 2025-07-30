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
const Agent_1 = require("../core/Agent");
async function exampleBasicUsage() {
    const agent = new Agent_1.Agent('Go to example.com and extract the main heading', {
        headless: true,
        llmProvider: 'anthropic'
    });
    try {
        await agent.initialize();
        const result = await agent.run();
        console.log('Task completed:', result.success);
        console.log('Steps taken:', result.steps.length);
        console.log('Final URL:', result.finalUrl);
    }
    finally {
        await agent.cleanup();
    }
}
async function exampleVisualTesting() {
    const agent = new Agent_1.Agent('Login to the demo site and check for visual issues on the dashboard', {
        headless: false,
        maxSteps: 30
    });
    try {
        await agent.initialize();
        await agent.run();
    }
    finally {
        await agent.cleanup();
    }
}
async function exampleCustomAction() {
    const agent = new Agent_1.Agent('Use my custom action to do something special', {
        headless: true
    });
    agent.registerAction({
        name: 'my_custom_action',
        description: 'Does something special',
        parameters: {
            message: { type: 'string', required: true }
        }
    }, async (params, context) => {
        console.log('Custom action executed:', params.message);
        const title = await context.page.title();
        return {
            success: true,
            data: { pageTitle: title, message: params.message }
        };
    });
    try {
        await agent.initialize();
        await agent.run();
    }
    finally {
        await agent.cleanup();
    }
}
async function exampleComplexWorkflow() {
    const task = `
    1. Go to an e-commerce site
    2. Search for "laptop"
    3. Extract prices of first 5 results
    4. Save prices to a file
    5. Find the cheapest option
    6. Click on it for more details
  `;
    const agent = new Agent_1.Agent(task, {
        headless: false,
        maxSteps: 50
    });
    try {
        await agent.initialize();
        const result = await agent.run();
        const state = agent.getState();
        for (const [path, content] of state.fileSystem) {
            console.log(`File ${path}:`, content);
        }
        const exportedState = agent.exportState();
        console.log('State exported, can be restored later');
    }
    finally {
        await agent.cleanup();
    }
}
async function exampleYoFixIntegration() {
    const agent = new Agent_1.Agent('Test visual regression on multiple pages', {
        headless: true,
        viewport: { width: 1920, height: 1080 }
    });
    const urls = ['/home', '/about', '/contact'];
    try {
        await agent.initialize();
        for (const url of urls) {
            const task = `
        1. Go to ${url}
        2. Run check_visual_issues with screenshots
        3. Test responsive at mobile and tablet sizes
        4. Save any issues found to /issues${url}.json
      `;
            const newAgent = new Agent_1.Agent(task, { headless: true });
            await newAgent.initialize();
            const result = await newAgent.run();
            if (!result.success) {
                console.error(`Failed to test ${url}:`, result.error);
            }
            await newAgent.cleanup();
        }
    }
    finally {
        await agent.cleanup();
    }
}
async function exampleDirectAPI() {
    const { ActionRegistry, DOMIndexer, StateManager } = await Promise.resolve().then(() => __importStar(require('../index')));
    const { registerBuiltInActions } = await Promise.resolve().then(() => __importStar(require('../actions')));
    const { chromium } = await Promise.resolve().then(() => __importStar(require('playwright')));
    const registry = new ActionRegistry();
    registerBuiltInActions(registry);
    const domIndexer = new DOMIndexer();
    const stateManager = new StateManager('Direct API usage');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto('https://example.com');
        const dom = await domIndexer.indexPage(page);
        console.log(`Found ${dom.interactiveElements.length} interactive elements`);
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
    }
    finally {
        await browser.close();
    }
}
if (require.main === module) {
    (async () => {
        console.log('Running browser-agent examples...\n');
        await exampleBasicUsage();
        console.log('\nExamples completed!');
    })().catch(console.error);
}
