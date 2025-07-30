#!/usr/bin/env node

/**
 * YoFix Browser Agent Playground
 * 
 * Interactive testing environment for browser-agent
 */

const { Agent } = require('./dist/browser-agent/core/Agent');
const readline = require('readline');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envLocal = path.join(__dirname, '.env.local');
const envDefault = path.join(__dirname, '.env');

if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (fs.existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class BrowserAgentPlayground {
  constructor() {
    this.agent = null;
    this.quickExamples = [
      {
        name: 'Login & Get User Info',
        task: 'go to https://app.tryloop.ai, click on "sign-in with password instead" link, type "hari@tryloop.ai" in the first visible text input, type "Loop@134" in the password input, click the button with text "LOGIN", wait 3 seconds for page to load, then extract and report any text containing "Hari" or username from the page'
      },
      {
        name: 'Google Search & Extract URLs',
        task: 'go to google.com, search for "pineapple", wait for results to load, then extract and list the top 10 URLs from the search results'
      },
      {
        name: 'World Population Research',
        task: 'go to google.com, search for "world population 2024", note the total world population, then search for "india population 2024", note India\'s population, then calculate and report the ratio of India\'s population to world population'
      }
    ];
  }

  async start() {
    console.log('🎮 YoFix Browser Agent Playground');
    console.log('=====================================\n');
    
    if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.error('❌ Please set CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable');
      process.exit(1);
    }

    console.log('🖥️  Browser Mode: VISIBLE (you should see the browser window)');
    console.log('🤖 AI Control: The browser is controlled by AI based on your commands\n');

    console.log('Available commands:');
    console.log('  task <description>       - Execute any task');
    console.log('  1, 2, 3                  - Run quick example (see below)');
    console.log('  screenshot               - Take a screenshot');
    console.log('  help                     - Show detailed help');
    console.log('  quit                     - Exit playground\n');
    
    console.log('🚀 Quick Examples (just type the number):');
    console.log('  1️⃣  Login to TryLoop and get user info');
    console.log('  2️⃣  Search Google for pineapple and extract top 10 URLs');
    console.log('  3️⃣  Find world & India population ratio\n');

    this.promptUser();
  }

  promptUser() {
    rl.question('yofix> ', async (input) => {
      await this.processCommand(input.trim());
      this.promptUser();
    });
  }

  async processCommand(input) {
    const [command, ...args] = input.split(' ');

    try {
      switch (command) {
        case '1':
          console.log('\n🚀 Running Quick Example 1: ' + this.quickExamples[0].name);
          await this.executeTask(this.quickExamples[0].task);
          break;
          
        case '2':
          console.log('\n🚀 Running Quick Example 2: ' + this.quickExamples[1].name);
          await this.executeTask(this.quickExamples[1].task);
          break;
          
        case '3':
          console.log('\n🚀 Running Quick Example 3: ' + this.quickExamples[2].name);
          await this.executeTask(this.quickExamples[2].task);
          break;
          
        case 'task':
          await this.executeTask(args.join(' '));
          break;

        case 'screenshot':
          await this.takeScreenshot();
          break;

        case 'quit':
        case 'exit':
          await this.cleanup();
          process.exit(0);
          break;

        case 'help':
          this.showHelp();
          break;

        // Legacy commands - redirect to task
        case 'start':
          console.log('💡 Tip: You can now use "task" directly without starting a session first.');
          await this.executeTask(`go to ${args[0]}`);
          break;
          
        case 'visual':
          await this.executeTask('run visual analysis on the current page');
          break;
          
        case 'responsive':
          await this.executeTask('test responsive design on the current page');
          break;
          
        case 'auth':
          if (args[0] && args[1]) {
            await this.executeTask(`login with email ${args[0]} and password ${args[1]}`);
          } else {
            console.log('❌ Please provide email and password');
          }
          break;

        default:
          if (input) {
            // If no command keyword, treat the whole input as a task
            console.log('💡 Assuming you meant: task ' + input);
            await this.executeTask(input);
          }
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  // Removed - no longer needed

  async executeTask(task) {
    if (!task) {
      console.log('❌ Please provide a task description.');
      return;
    }

    console.log(`\n🤖 Executing: ${task}`);
    console.log('🖥️  Browser window should open shortly...\n');
    
    // Create a new agent for this task
    this.agent = new Agent(task, {
      headless: false, // Always show browser in playground
      maxSteps: 20,
      llmProvider: 'anthropic',
      viewport: { width: 1920, height: 1080 }
    });

    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

    try {
      await this.agent.initialize();
      console.log('✅ Browser initialized\n');
      
      const result = await this.agent.run();
      
      console.log('\n' + '='.repeat(50));
      if (result.success) {
        console.log('✅ Task completed successfully!');
        
        // Show reliability score if available
        if (result.reliability) {
          console.log(`\n📊 Reliability Score: ${(result.reliability.overall * 100).toFixed(1)}%`);
          console.log(`   Task Completeness: ${(result.reliability.factors.taskCompleteness * 100).toFixed(0)}%`);
          console.log(`   Confidence: ${(result.reliability.factors.verificationConfidence * 100).toFixed(0)}%`);
        }
        
        // Show extracted content
        const lastStep = result.steps[result.steps.length - 1];
        if (lastStep?.result.extractedContent) {
          console.log(`\n📄 Extracted content: ${lastStep.result.extractedContent}`);
        }
      } else {
        console.log('❌ Task failed:', result.error || 'Unknown error');
      }
      console.log('='.repeat(50) + '\n');
      
      // Keep browser open for a moment so user can see final state
      console.log('⏸️  Keeping browser open for 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error('\n❌ Error:', error.message);
    } finally {
      if (this.agent) {
        await this.agent.cleanup();
        this.agent = null;
      }
    }
  }

  // Removed - use task command instead

  // Removed - use task command instead

  // Removed - use task command instead

  async takeScreenshot() {
    console.log('📸 Taking screenshot of the current page...');
    await this.executeTask('take a screenshot of the current page and save it');
  }

  showHelp() {
    console.log(`
🎮 YoFix Browser Agent Playground - Help
========================================

🚀 Quick Examples (Just type the number!):
  1️⃣  Login to TryLoop and get user info
      → Navigates to app.tryloop.ai, logs in with credentials, extracts user name
      
  2️⃣  Search Google for pineapple and extract URLs  
      → Searches Google, extracts top 10 result URLs
      
  3️⃣  Find world & India population ratio
      → Searches population data and calculates the ratio

✨ Main Command:
  task <description>    Execute any browser automation task

📝 More Task Examples:
  task go to https://github.com and find the trending repositories
  task go to amazon.com, search for "laptop", and show prices of first 5 results
  task check if example.com has any broken images or links
  task go to wikipedia.org and find information about AI history
  task login to my app at localhost:3000 with test@email.com password123

🎯 What You Can Do:
  • Navigate to any website
  • Click buttons, links, or any element
  • Fill out forms with data
  • Extract text, prices, URLs, or any information
  • Take screenshots
  • Search and analyze content
  • Perform calculations on extracted data
  • Test authentication flows
  • Check for broken elements

💡 Tips:
  • Just type 1, 2, or 3 to run quick examples instantly!
  • Describe tasks in plain English
  • The browser window will be visible
  • Each task gets a fresh browser
  • Results include reliability scores

🔧 Commands:
  1, 2, 3           Run quick example
  task <desc>       Custom task
  screenshot        Take screenshot
  help              Show this help
  quit              Exit

📊 Features:
  • Smart Planning: AI creates execution plan
  • Step Verification: Each action is verified
  • Visual Feedback: Elements highlight before clicking
  • Reliability Score: Confidence metrics

⚠️  Troubleshooting:
  • No browser? Run: npx playwright install chromium
  • On server? Use: xvfb-run node playground.js
  • Set CLAUDE_API_KEY in environment
    `);
  }

  async cleanup() {
    if (this.agent) {
      console.log('🧹 Cleaning up browser session...');
      await this.agent.cleanup();
    }
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n👋 Exiting playground...');
  process.exit(0);
});

// Start playground
if (require.main === module) {
  const playground = new BrowserAgentPlayground();
  playground.start().catch(console.error);
}

module.exports = BrowserAgentPlayground;