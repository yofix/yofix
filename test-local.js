#!/usr/bin/env node

/**
 * Local YoFix Testing Script
 * 
 * This script allows you to test YoFix locally without GitHub Actions
 */

const { VisualAnalyzer } = require('./dist/core/analysis/VisualAnalyzer');
const { TestGenerator } = require('./dist/core/testing/TestGenerator');
const { SmartAuthHandler } = require('./dist/github/SmartAuthHandler');
const { Agent } = require('./dist/browser-agent/core/Agent');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local (primary) or .env (fallback)
const envLocal = path.join(__dirname, '.env.local');
const envDefault = path.join(__dirname, '.env');

if (fs.existsSync(envLocal)) {
  console.log('📄 Loading environment from .env.local');
  dotenv.config({ path: envLocal });
} else if (fs.existsSync(envDefault)) {
  console.log('📄 Loading environment from .env');
  dotenv.config({ path: envDefault });
} else {
  console.log('📄 No environment file found. Using system environment variables.');
}

async function testYoFixLocally() {
  console.log('🧪 Starting YoFix Local Testing...\n');

  // Configuration from environment and CLI args
  const config = {
    websiteUrl: process.argv[2] || process.env.TEST_WEBSITE_URL || 'https://example.com',
    claudeApiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
    routes: (process.env.TEST_ROUTES || '/').split(','),
    viewports: (process.env.TEST_VIEWPORTS || '1920x1080,768x1024,375x667').split(','),
    outputDir: './test-results',
    authEmail: process.env.TEST_AUTH_EMAIL,
    authPassword: process.env.TEST_AUTH_PASSWORD,
    loginUrl: process.env.TEST_LOGIN_URL || '/login',
    headless: process.env.YOFIX_HEADLESS !== 'false',
    debug: process.env.YOFIX_DEBUG === 'true'
  };

  if (!config.claudeApiKey) {
    console.error('❌ Error: Please set CLAUDE_API_KEY environment variable');
    process.exit(1);
  }

  console.log(`🔍 Testing: ${config.websiteUrl}`);
  console.log(`📱 Viewports: ${config.viewports.join(', ')}`);
  console.log(`🛣️ Routes: ${config.routes.join(', ')}\n`);

  // Create output directory
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  try {
    // Test 1: Visual Analysis
    console.log('1️⃣ Testing Visual Analysis...');
    const visualAnalyzer = new VisualAnalyzer(config.claudeApiKey);
    
    const scanResult = await visualAnalyzer.scan({
      prNumber: 0, // Mock PR number for local testing
      routes: config.routes,
      viewports: config.viewports,
      options: {
        previewUrl: config.websiteUrl,
        maxRoutes: 5,
        enableScreenshots: true,
        maxRetries: 3,
        timeout: 30000
      }
    });

    console.log(`✅ Visual scan completed: ${scanResult.issues?.length || 0} issues found`);
    
    // Save scan results
    fs.writeFileSync(
      path.join(config.outputDir, 'scan-results.json'),
      JSON.stringify(scanResult, null, 2)
    );

    // Test 2: Fix Generation (if issues found)
    if (scanResult.issues && scanResult.issues.length > 0) {
      console.log('\n2️⃣ Testing Fix Generation...');
      const fixes = await visualAnalyzer.generateFixes(scanResult.issues);
      
      console.log(`✅ Generated ${fixes.length} fixes`);
      
      // Save fixes
      const fixesReport = fixes.map(({ issue, fix }) => ({
        issue: issue.description,
        type: issue.type,
        severity: issue.severity,
        fix: fix
      }));
      
      fs.writeFileSync(
        path.join(config.outputDir, 'generated-fixes.json'),
        JSON.stringify(fixesReport, null, 2)
      );
    }

    // Test 3: Test Generation
    console.log('\n3️⃣ Testing Test Generation...');
    const firebaseConfig = {
      projectId: 'test-project',
      target: 'default',
      buildSystem: 'vite',
      previewUrl: config.websiteUrl,
      region: 'us-central1'
    };

    const viewports = config.viewports.map(v => {
      const [width, height] = v.split('x').map(Number);
      return { width, height, name: v };
    });

    const testGenerator = new TestGenerator(firebaseConfig, viewports, config.claudeApiKey);
    
    const mockAnalysis = {
      hasUIChanges: true,
      changedPaths: ['/'],
      components: ['App', 'Header', 'Footer'],
      routes: config.routes,
      testSuggestions: ['Test navigation', 'Check responsive design'],
      riskLevel: 'medium'
    };

    const testResults = await testGenerator.runTests(mockAnalysis);
    console.log(`✅ Executed ${testResults.length} tests`);
    
    // Save test results
    fs.writeFileSync(
      path.join(config.outputDir, 'test-results.json'),
      JSON.stringify(testResults.map(r => ({
        route: r.route,
        success: r.success,
        duration: r.duration,
        issues: r.issues,
        error: r.error
      })), null, 2)
    );

    // Test 4: Direct Browser Agent Test
    console.log('\n4️⃣ Testing Browser Agent Directly...');
    const agentTask = `
      Test the website ${config.websiteUrl}:
      1. Navigate to the homepage
      2. Take a screenshot
      3. Check for visual issues using check_visual_issues
      4. Test responsive design on mobile and desktop
      5. Save results to memory
    `;

    const agent = new Agent(agentTask, {
      headless: true,
      maxSteps: 10,
      llmProvider: 'anthropic',
      viewport: { width: 1920, height: 1080 }
    });

    process.env.ANTHROPIC_API_KEY = config.claudeApiKey;
    
    await agent.initialize();
    const agentResult = await agent.run();
    await agent.cleanup();

    console.log(`✅ Browser agent test completed: ${agentResult.success ? 'SUCCESS' : 'FAILED'}`);
    
    if (agentResult.screenshots && agentResult.screenshots.length > 0) {
      // Save screenshots
      agentResult.screenshots.forEach((screenshot, index) => {
        fs.writeFileSync(
          path.join(config.outputDir, `screenshot-${index}.png`),
          screenshot
        );
      });
      console.log(`📸 Saved ${agentResult.screenshots.length} screenshots`);
    }

    // Test 5: Authentication Test (Optional)
    if (config.authEmail && config.authPassword) {
      console.log('\n5️⃣ Testing Smart Authentication...');
      
      const authConfig = {
        loginUrl: config.loginUrl,
        email: config.authEmail,
        password: config.authPassword,
        successIndicator: 'dashboard'
      };

      const authHandler = new SmartAuthHandler(authConfig, config.claudeApiKey);
      
      // Mock page object for testing
      const mockPage = {
        context: () => ({ browser: () => ({}) }),
        url: () => config.websiteUrl
      };

      try {
        const authResult = await authHandler.login(mockPage, config.websiteUrl);
        console.log(`✅ Authentication test: ${authResult ? 'SUCCESS' : 'FAILED'}`);
      } catch (error) {
        console.log(`⚠️ Authentication test skipped: ${error.message}`);
      }
    }

    // Generate summary report
    console.log('\n📊 Generating Summary Report...');
    const summary = {
      timestamp: new Date().toISOString(),
      websiteUrl: config.websiteUrl,
      testsRun: {
        visualAnalysis: true,
        fixGeneration: scanResult.issues?.length > 0,
        testGeneration: true,
        browserAgent: true,
        authentication: !!process.env.TEST_AUTH_EMAIL
      },
      results: {
        visualIssues: scanResult.issues?.length || 0,
        fixesGenerated: scanResult.issues?.length || 0,
        testsExecuted: testResults.length,
        browserAgentSuccess: agentResult.success,
        screenshotsTaken: agentResult.screenshots?.length || 0,
        authenticationTested: !!(config.authEmail && config.authPassword)
      },
      outputFiles: fs.readdirSync(config.outputDir)
    };

    fs.writeFileSync(
      path.join(config.outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n🎉 Local testing completed successfully!');
    console.log(`📁 Results saved to: ${config.outputDir}`);
    console.log('\nFiles generated:');
    summary.outputFiles.forEach(file => {
      console.log(`  - ${file}`);
    });

  } catch (error) {
    console.error('\n❌ Testing failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
YoFix Local Testing Script

Usage:
  node test-local.js [website-url]

Environment Variables:
  CLAUDE_API_KEY        Your Claude API key (required)
  TEST_AUTH_EMAIL       Email for authentication testing (optional)
  TEST_AUTH_PASSWORD    Password for authentication testing (optional)

Examples:
  node test-local.js https://example.com
  node test-local.js https://your-staging-site.com
  CLAUDE_API_KEY=your-key node test-local.js https://localhost:3000

Output:
  All results will be saved to ./test-results/ directory
    `);
    process.exit(0);
  }

  testYoFixLocally().catch(console.error);
}

module.exports = { testYoFixLocally };