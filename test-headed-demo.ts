/**
 * Visual demo of login baseline - runs in headed mode
 */

import { ComponentTreeAnalyzer } from './src/browser-agent/schemas/ComponentTreeAnalyzer';
import { PlaywrightActionGenerator } from './src/browser-agent/schemas/PlaywrightActionGenerator';

async function main() {
  console.log('🎬 Running Login Baseline in HEADED mode');
  console.log('Watch the browser perform the login!\n');

  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!claudeApiKey) {
    console.error('❌ CLAUDE_API_KEY environment variable not set');
    process.exit(1);
  }

  const testCredentials = {
    email: process.env.TEST_EMAIL || 'hari@tryloop.ai',
    password: process.env.TEST_PASSWORD || 'Loop@134'
  };

  const loginUrl = 'https://app.tryloop.ai/login/password';

  const sourceFiles = [
    '/Users/hari/2025/lp/loop-frontend/src/pages/public/Login/LoginWithPassword.tsx',
    '/Users/hari/2025/lp/loop-frontend/src/pages/public/Login/LoginForm.tsx',
    '/Users/hari/2025/lp/loop-frontend/src/forms/CustomInput.tsx'
  ];

  console.log('📊 Analyzing components...');
  const analyzer = new ComponentTreeAnalyzer();
  const structure = await analyzer.analyzeLoginForm(sourceFiles);
  console.log('✅ Analysis complete\n');

  console.log('🧠 Generating actions with LLM...');
  const actionGenerator = new PlaywrightActionGenerator(claudeApiKey);

  const baseline = await actionGenerator.generateLoginActions(structure, {
    loginUrl,
    sourceFiles,
    testCredentials,
    model: 'claude-sonnet-4-5-20250929',
    headless: false // 👈 HEADED MODE!
  });

  console.log('\n✅ DEMO COMPLETE!');
  console.log(`   Validated: ${baseline.validated ? 'Yes' : 'No'}`);
  console.log(`   Actions: ${baseline.actions.length}`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
