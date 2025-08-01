// Simple test for visual tester with smart authentication
const { spawn } = require('child_process');

// Set up test environment
const env = {
  ...process.env,
  INPUT_PREVIEW_URL: 'https://app.tryloop.ai',
  INPUT_ROUTES: JSON.stringify([
    { path: '/', title: 'Dashboard' }
  ]),
  INPUT_VIEWPORTS: '1920x1080',
  INPUT_TEST_TIMEOUT: '60',
  INPUT_DEBUG: 'true',
  INPUT_AUTH_EMAIL: 'hari@tryloop.ai',
  INPUT_AUTH_PASSWORD: 'Loop@134',
  INPUT_AUTH_LOGIN_URL: '/login/password'
};

console.log('🧪 Testing visual tester with smart authentication...\n');

// Run the visual tester module
const child = spawn('node', ['dist/modules/visual-tester.js'], { env, stdio: 'inherit' });

// Kill after 60 seconds to prevent hanging
const timeout = setTimeout(() => {
  console.log('\n⏰ Test timeout reached, killing process...');
  child.kill();
}, 60000);

child.on('exit', (code) => {
  clearTimeout(timeout);
  console.log(`\nVisual tester exited with code ${code}`);
  
  // Check if screenshots were created
  const fs = require('fs');
  const path = require('path');
  const screenshotDir = path.join(process.cwd(), 'screenshots');
  
  if (fs.existsSync(screenshotDir)) {
    const files = fs.readdirSync(screenshotDir);
    console.log(`\n📸 Screenshots created: ${files.length}`);
    files.forEach(file => console.log(`  - ${file}`));
  }
  
  // Check results
  const resultsFile = path.join(process.cwd(), 'visual-test-results.json');
  if (fs.existsSync(resultsFile)) {
    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    console.log('\n📊 Test Results:');
    console.log(`  Total: ${results.summary.total}`);
    console.log(`  Passed: ${results.summary.passed}`);
    console.log(`  Failed: ${results.summary.failed}`);
    console.log(`  Warnings: ${results.summary.warnings}`);
  }
});