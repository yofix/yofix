// Test the visual tester with smart authentication
const { spawn } = require('child_process');

// Set up test environment
const env = {
  ...process.env,
  INPUT_PREVIEW_URL: 'https://app.tryloop.ai',
  INPUT_ROUTES: JSON.stringify([
    { path: '/', title: 'Dashboard' },
    { path: '/billing', title: 'Billing' },
    { path: '/settings', title: 'Settings' }
  ]),
  INPUT_VIEWPORTS: '1920x1080,1366x768',
  INPUT_TEST_TIMEOUT: '30',
  INPUT_DEBUG: 'true',
  INPUT_AUTH_EMAIL: 'hari@tryloop.ai',
  INPUT_AUTH_PASSWORD: 'Loop@134',
  INPUT_AUTH_LOGIN_URL: '/login/password'
};

// Run the visual tester module
const child = spawn('node', ['dist/modules/visual-tester.js'], { env, stdio: 'inherit' });

child.on('exit', (code) => {
  console.log(`Visual tester exited with code ${code}`);
});