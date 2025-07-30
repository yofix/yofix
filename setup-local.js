#!/usr/bin/env node

/**
 * YoFix Local Setup Script
 * 
 * This script helps you set up YoFix for local development and testing
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Auto-detect login URL using browser-agent
 */
async function autoDetectLoginUrl(websiteUrl, claudeApiKey) {
  try {
    // Check if we have the Agent available
    const distPath = path.join(__dirname, 'dist', 'browser-agent', 'core', 'Agent.js');
    if (!fs.existsSync(distPath)) {
      throw new Error('YoFix not built yet. Run "yarn build" first.');
    }
    
    const { Agent } = require('./dist/browser-agent/core/Agent');
    
    const detectionTask = `
      Navigate to ${websiteUrl} and find the login page:
      
      1. Look for common login indicators:
         - Links with text like "Login", "Sign In", "Log In", "Sign Up"
         - Buttons with login/signin text
         - Navigation items for authentication
         
      2. Check common login URLs:
         - /login
         - /signin  
         - /auth/login
         - /user/login
         - /account/login
         - /auth
         
      3. If you find a login link or button, click on it to get the actual login page URL
      
      4. Save the detected login URL to /login-url.txt
      
      5. If no login is found, save "none" to /login-url.txt
      
      Focus on finding the actual login page where users enter credentials.
    `;
    
    const agent = new Agent(detectionTask, {
      headless: true,
      maxSteps: 10,
      llmProvider: 'anthropic',
      viewport: { width: 1920, height: 1080 }
    });
    
    // Set API key
    process.env.ANTHROPIC_API_KEY = claudeApiKey;
    
    await agent.initialize();
    const result = await agent.run();
    
    // Get detected URL
    const agentState = agent.getState();
    const detectedUrl = agentState.fileSystem.get('/login-url.txt');
    
    await agent.cleanup();
    
    if (detectedUrl && detectedUrl !== 'none') {
      // Clean up the URL
      let loginUrl = detectedUrl.trim();
      
      // If it's a full URL, extract just the path
      try {
        const url = new URL(loginUrl);
        loginUrl = url.pathname;
      } catch (e) {
        // If not a full URL, assume it's already a path
        if (!loginUrl.startsWith('/')) {
          loginUrl = '/' + loginUrl;
        }
      }
      
      return loginUrl;
    }
    
    return null;
    
  } catch (error) {
    console.error(`Auto-detection error: ${error.message}`);
    return null;
  }
}

async function setupYoFix() {
  console.log('🛠️  YoFix Local Setup');
  console.log('====================\n');

  console.log('This setup will help you configure YoFix for local development and testing.');
  console.log('You can press Enter to use default values or type "skip" to skip optional settings.\n');

  const config = {};

  // Required: Claude API Key
  console.log('📝 REQUIRED: Claude API Key');
  console.log('Get your API key from: https://console.anthropic.com/\n');
  
  const claudeKey = await question('Enter your Claude API key: ');
  if (!claudeKey || claudeKey.trim() === '') {
    console.error('❌ Claude API key is required for YoFix to work.');
    process.exit(1);
  }
  config.CLAUDE_API_KEY = claudeKey.trim();

  // Website URL
  console.log('\n🌐 Website URL to Test');
  const websiteUrl = await question('Website URL (default: http://localhost:3000): ');
  config.TEST_WEBSITE_URL = websiteUrl.trim() || 'http://localhost:3000';

  // Storage Configuration
  console.log('\n💾 Storage Configuration (Optional)');
  console.log('Choose storage for screenshots and test results:');
  console.log('1. Skip (store locally only)');
  console.log('2. Firebase Storage');
  console.log('3. AWS S3');
  
  const storageChoice = await question('Choose storage option (1-3, default: 1): ');
  
  if (storageChoice === '2') {
    console.log('\n🔥 Firebase Storage Setup');
    const firebaseProject = await question('Firebase Project ID: ');
    const firebaseBucket = await question('Firebase Storage Bucket: ');
    const firebaseCredentials = await question('Firebase Service Account JSON (base64 encoded): ');
    
    if (firebaseProject) config.FIREBASE_PROJECT_ID = firebaseProject.trim();
    if (firebaseBucket) config.FIREBASE_STORAGE_BUCKET = firebaseBucket.trim();
    if (firebaseCredentials) config.FIREBASE_CREDENTIALS = firebaseCredentials.trim();
  } else if (storageChoice === '3') {
    console.log('\n☁️  AWS S3 Setup');
    const awsAccessKey = await question('AWS Access Key ID: ');
    const awsSecretKey = await question('AWS Secret Access Key: ');
    const awsRegion = await question('AWS Region (default: us-east-1): ');
    const s3Bucket = await question('S3 Bucket Name: ');
    
    if (awsAccessKey) config.AWS_ACCESS_KEY_ID = awsAccessKey.trim();
    if (awsSecretKey) config.AWS_SECRET_ACCESS_KEY = awsSecretKey.trim();
    if (awsRegion) config.AWS_REGION = awsRegion.trim() || 'us-east-1';
    if (s3Bucket) config.S3_BUCKET = s3Bucket.trim();
  }

  // Authentication (Optional)
  console.log('\n🔐 Authentication Setup (Optional)');
  const needsAuth = await question('Does your website require login? (y/N): ');
  
  if (needsAuth.toLowerCase() === 'y' || needsAuth.toLowerCase() === 'yes') {
    const authEmail = await question('Test account email: ');
    const authPassword = await question('Test account password: ');
    
    console.log('\nLogin page URL options:');
    console.log('1. Auto-detect (AI will find the login page) ← Recommended');
    console.log('2. /login (standard default)');
    console.log('3. Custom URL (e.g., /signin, /auth/login)');
    
    const loginChoice = await question('Choose login URL option (1-3, default: 1): ');
    
    let loginUrl = 'auto-detect';
    if (loginChoice === '2') {
      loginUrl = '/login';
    } else if (loginChoice === '3') {
      const customUrl = await question('Enter custom login URL: ');
      loginUrl = customUrl.trim() || '/login';
    }
    
    if (authEmail) config.TEST_AUTH_EMAIL = authEmail.trim();
    if (authPassword) config.TEST_AUTH_PASSWORD = authPassword.trim();
    config.TEST_LOGIN_URL = loginUrl;
    
    // If auto-detect is chosen, test it now
    if (loginUrl === 'auto-detect') {
      console.log('\n🤖 Testing auto-detection of login page...');
      try {
        const detectedUrl = await autoDetectLoginUrl(config.TEST_WEBSITE_URL, config.CLAUDE_API_KEY);
        if (detectedUrl) {
          console.log(`✅ Auto-detected login URL: ${detectedUrl}`);
          config.TEST_LOGIN_URL = detectedUrl;
        } else {
          console.log('⚠️ Could not auto-detect login URL. Using /login as fallback.');
          config.TEST_LOGIN_URL = '/login';
        }
      } catch (error) {
        console.log(`⚠️ Auto-detection failed: ${error.message}. Using /login as fallback.`);
        config.TEST_LOGIN_URL = '/login';
      }
    }
  }

  // Test Configuration
  console.log('\n🧪 Test Configuration');
  const testRoutes = await question('Routes to test (comma-separated, default: /,/about): ');
  const testViewports = await question('Viewports to test (default: 375x667,768x1024,1920x1080): ');
  
  config.TEST_ROUTES = testRoutes.trim() || '/,/about';
  config.TEST_VIEWPORTS = testViewports.trim() || '375x667,768x1024,1920x1080';

  // Development Settings
  console.log('\n⚙️  Development Settings');
  const showBrowser = await question('Show browser during testing? (Y/n): ');
  const enableDebug = await question('Enable debug output? (Y/n): ');
  
  config.YOFIX_HEADLESS = (showBrowser.toLowerCase() === 'n' || showBrowser.toLowerCase() === 'no') ? 'true' : 'false';
  config.YOFIX_DEBUG = (enableDebug.toLowerCase() !== 'n' && enableDebug.toLowerCase() !== 'no') ? 'true' : 'false';
  config.YOFIX_SLOW_MO = '500';

  // Generate .env.local file
  console.log('\n📝 Generating .env.local file...');
  
  const envContent = [
    '# YoFix Local Development Environment',
    '# Generated by setup-local.js',
    '',
    '# =============================================================================',
    '# AI API KEY',
    '# =============================================================================',
    `CLAUDE_API_KEY=${config.CLAUDE_API_KEY}`,
    `ANTHROPIC_API_KEY=${config.CLAUDE_API_KEY}`,
    '',
    '# =============================================================================',
    '# STORAGE CONFIGURATION',
    '# ============================================================================='
  ];

  if (config.FIREBASE_PROJECT_ID) {
    envContent.push(`FIREBASE_PROJECT_ID=${config.FIREBASE_PROJECT_ID}`);
    envContent.push(`FIREBASE_STORAGE_BUCKET=${config.FIREBASE_STORAGE_BUCKET}`);
    envContent.push(`FIREBASE_CREDENTIALS=${config.FIREBASE_CREDENTIALS}`);
  }

  if (config.AWS_ACCESS_KEY_ID) {
    envContent.push(`AWS_ACCESS_KEY_ID=${config.AWS_ACCESS_KEY_ID}`);
    envContent.push(`AWS_SECRET_ACCESS_KEY=${config.AWS_SECRET_ACCESS_KEY}`);
    envContent.push(`AWS_REGION=${config.AWS_REGION}`);
    envContent.push(`S3_BUCKET=${config.S3_BUCKET}`);
  }

  envContent.push(
    '',
    '# =============================================================================',
    '# LOCAL TESTING CONFIGURATION',
    '# =============================================================================',
    `TEST_WEBSITE_URL=${config.TEST_WEBSITE_URL}`,
    `TEST_ROUTES=${config.TEST_ROUTES}`,
    `TEST_VIEWPORTS=${config.TEST_VIEWPORTS}`
  );

  if (config.TEST_AUTH_EMAIL) {
    envContent.push(
      '',
      '# Authentication',
      `TEST_AUTH_EMAIL=${config.TEST_AUTH_EMAIL}`,
      `TEST_AUTH_PASSWORD=${config.TEST_AUTH_PASSWORD}`,
      `TEST_LOGIN_URL=${config.TEST_LOGIN_URL}`
    );
  }

  envContent.push(
    '',
    '# =============================================================================',
    '# DEVELOPMENT SETTINGS',
    '# =============================================================================',
    `YOFIX_HEADLESS=${config.YOFIX_HEADLESS}`,
    `YOFIX_DEBUG=${config.YOFIX_DEBUG}`,
    `YOFIX_SLOW_MO=${config.YOFIX_SLOW_MO}`
  );

  const envFilePath = path.join(__dirname, '.env.local');
  fs.writeFileSync(envFilePath, envContent.join('\n'));

  console.log(`✅ Configuration saved to ${envFilePath}`);

  // Test the setup
  console.log('\n🧪 Testing your setup...');
  
  if (!fs.existsSync('./dist')) {
    console.log('📦 Building YoFix...');
    const { execSync } = require('child_process');
    try {
      execSync('yarn build', { stdio: 'inherit' });
    } catch (error) {
      console.error('❌ Build failed. Please run "yarn build" manually.');
      process.exit(1);
    }
  }

  // Show next steps
  console.log('\n🎉 Setup Complete!');
  console.log('\nNext steps:');
  console.log('1. Test your configuration:');
  console.log('   node test-local.js');
  console.log('');
  console.log('2. Use the interactive playground:');
  console.log('   node playground.js');
  console.log('');
  console.log('3. Use the CLI:');
  console.log('   ./dist/cli/yofix-cli.js scan https://your-website.com');
  console.log('');
  console.log('4. Edit .env.local anytime to update your configuration');
  console.log('');
  console.log('📚 For help: node test-local.js --help');

  rl.close();
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  console.log('\n\n👋 Setup cancelled');
  rl.close();
  process.exit(0);
});

if (require.main === module) {
  setupYoFix().catch(console.error);
}

module.exports = setupYoFix;