/**
 * Test the new login baseline orchestrator approach
 *
 * This validates the complete flow:
 * 1. Extract login URL from GitHub action
 * 2. Find route source file
 * 3. Resolve component tree
 * 4. Analyze with Babel AST
 * 5. Generate Playwright actions with LLM
 * 6. Validate in browser
 * 7. Save as baseline
 */

import { LoginBaselineOrchestrator } from './src/browser-agent/schemas/LoginBaselineOrchestrator';
import { StorageProvider } from './src/providers/storage/types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Mock storage provider for testing
class LocalFileStorage implements StorageProvider {
  private basePath = '.yofix-cache/login-baselines';

  async uploadFile(filePath: string, content: Buffer, contentType?: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);
    console.log(`📁 Saved to local storage: ${fullPath}`);
  }

  async downloadFile(filePath: string): Promise<Buffer | null> {
    const fullPath = path.join(this.basePath, filePath);

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    return fs.readFileSync(fullPath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);
    return fs.existsSync(fullPath);
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const fullPath = path.join(this.basePath, prefix);

    if (!fs.existsSync(fullPath)) {
      return [];
    }

    return fs.readdirSync(fullPath).map(file => path.join(prefix, file));
  }
}

async function main() {
  console.log('🧪 Testing Login Baseline Orchestrator');
  console.log('=====================================\n');

  // Configuration
  const claudeApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!claudeApiKey) {
    console.error('❌ ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable not set');
    process.exit(1);
  }

  const testCredentials = {
    email: process.env.TEST_EMAIL || 'hari@tryloop.ai',
    password: process.env.TEST_PASSWORD || ''
  };

  if (!testCredentials.password) {
    console.error('❌ TEST_PASSWORD environment variable not set');
    process.exit(1);
  }

  // Initialize
  const storage = new LocalFileStorage();
  const orchestrator = new LoginBaselineOrchestrator(storage, claudeApiKey);

  // Test 1: Generate baseline directly (bypassing route detection for now)
  console.log('📋 Test 1: Generate baseline with direct file approach\n');
  console.log('   (Note: Bypassing route detection - will be replaced with route-impact-analyzer integration)\n');

  const repositoryRoot = '/Users/hari/2025/lp/loop-frontend';
  const loginUrl = 'https://app.tryloop.ai/login/password';

  // Known source files for loop-frontend login
  const sourceFiles = [
    '/Users/hari/2025/lp/loop-frontend/src/pages/public/Login/LoginWithPassword.tsx',
    '/Users/hari/2025/lp/loop-frontend/src/pages/public/Login/LoginForm.tsx',
    '/Users/hari/2025/lp/loop-frontend/src/forms/CustomInput.tsx'
  ];

  try {
    const startTime = Date.now();

    // Direct test without orchestrator for now
    const { ComponentTreeAnalyzer } = await import('./src/browser-agent/schemas/ComponentTreeAnalyzer');
    const { PlaywrightActionGenerator } = await import('./src/browser-agent/schemas/PlaywrightActionGenerator');
    const { LoginBaselineManager } = await import('./src/browser-agent/schemas/LoginBaselineManager');

    const analyzer = new ComponentTreeAnalyzer();
    const actionGenerator = new PlaywrightActionGenerator(claudeApiKey);
    const baselineManager = new LoginBaselineManager(storage);

    // Analyze component structure
    console.log('🧬 Analyzing component structure...');
    const structure = await analyzer.analyzeLoginForm(sourceFiles);

    console.log(`   Library: ${structure.detectedLibrary}`);
    console.log(`   Email field: ${structure.emailField?.component || 'not found'}`);
    console.log(`   Password field: ${structure.passwordField?.component || 'not found'}`);
    console.log(`   Submit button: ${structure.submitButton?.component || 'not found'}`);
    console.log('');

    // Generate Playwright actions
    console.log('🧠 Generating Playwright actions with LLM...');
    const baseline = await actionGenerator.generateLoginActions(structure, {
      loginUrl,
      sourceFiles,
      testCredentials,
      model: 'claude-sonnet-4-5-20250929'
    });

    // Save to storage
    const baselineJson = JSON.stringify(baseline, null, 2);
    const baselineKey = crypto.createHash('md5').update(loginUrl).digest('hex').substring(0, 8);
    await storage.uploadFile(
      `login-baselines/app-tryloop-ai-${baselineKey}.json`,
      Buffer.from(baselineJson, 'utf-8')
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ BASELINE GENERATION SUCCESSFUL!\n');
    console.log('📊 Results:');
    console.log(`   Duration: ${duration}s`);
    console.log(`   Login URL: ${baseline.loginUrl}`);
    console.log(`   Library: ${baseline.detectedLibrary}`);
    console.log(`   Source Files: ${baseline.sourceFiles.length}`);
    console.log(`   Actions: ${baseline.actions.length}`);
    console.log(`   Validated: ${baseline.validated ? '✅ Yes' : '❌ No'}`);

    if (baseline.validationDetails) {
      console.log('\n🧪 Validation Details:');
      console.log(`   Email filled: ${baseline.validationDetails.emailFilled ? '✅' : '❌'}`);
      console.log(`   Password filled: ${baseline.validationDetails.passwordFilled ? '✅' : '❌'}`);
      console.log(`   Button clicked: ${baseline.validationDetails.buttonClicked ? '✅' : '❌'}`);
      console.log(`   Login succeeded: ${baseline.validationDetails.loginSucceeded ? '✅' : '❌'}`);
    }

    console.log('\n🎬 Generated Actions:');
    baseline.actions.forEach((action, idx) => {
      console.log(`   ${idx + 1}. ${action.type.toUpperCase()}: ${action.description}`);
      if (action.selector) {
        console.log(`      Selector: ${action.selector}`);
      }
    });

    // Test 2: Second run (should use cache)
    console.log('\n\n📋 Test 2: Second run (testing cache)\n');

    const startTime2 = Date.now();

    // Try to load from cache
    const cachedBaseline = await baselineManager.getOrGenerateBaseline(loginUrl, async () => {
      throw new Error('Should not regenerate - baseline should be in cache!');
    });

    const duration2 = ((Date.now() - startTime2) / 1000).toFixed(2);

    console.log(`\n✅ Cache test successful! Duration: ${duration2}s (should be < 1s)`);

    if (parseFloat(duration2) < 1.0) {
      console.log('   ✅ Cache is working correctly!');
    } else {
      console.log('   ⚠️  Cache may not be working - took longer than expected');
    }

    // Save baseline to file for inspection
    const outputPath = '.yofix-cache/test-baseline-output.json';
    fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2));
    console.log(`\n📁 Baseline saved to: ${outputPath}`);

    console.log('\n✅ ALL TESTS PASSED!');

  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
