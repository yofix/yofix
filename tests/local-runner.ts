#!/usr/bin/env ts-node

/**
 * Local test runner for development and debugging
 * Usage: npm run test:local -- --url=https://your-preview.web.app
 */

import { program } from 'commander';
import { FirebaseUrlHandler } from '../src/firebase-url-handler';
import { TestGenerator } from '../src/test-generator';
import { VisualRunner } from '../src/visual-runner';
import { FirebaseConfig, Viewport } from '../src/types';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

async function runLocalTest() {
  program
    .option('--url <url>', 'Firebase preview URL to test')
    .option('--project <project>', 'Firebase project ID (optional)')
    .option('--target <target>', 'Firebase target (optional)')
    .option('--build-system <system>', 'Build system: vite or react (optional)')
    .option('--output <dir>', 'Output directory for results')
    .parse();

  const options = program.opts();

  if (!options.url) {
    console.error('❌ Error: --url parameter is required');
    console.log('Usage: npm run test:local -- --url=https://your-preview.web.app');
    process.exit(1);
  }

  console.log('🧪 Starting local Runtime PR Verification test...');
  console.log(`📍 Target URL: ${options.url}`);

  const outputDir = options.output || await fs.mkdtemp(path.join(os.tmpdir(), 'local-test-'));
  console.log(`📁 Output directory: ${outputDir}`);

  try {
    // 1. Create Firebase configuration
    console.log('\n🔥 Step 1: Analyzing Firebase deployment...');
    const firebaseConfig: FirebaseConfig = await FirebaseUrlHandler.createFirebaseConfig(
      options.url,
      options.project,
      options.target,
      options.buildSystem
    );

    console.log('Firebase Config:', JSON.stringify(firebaseConfig, null, 2));

    // 2. Generate basic tests
    console.log('\n🧪 Step 2: Generating tests...');
    const viewports: Viewport[] = [
      { width: 1920, height: 1080, name: 'Desktop' },
      { width: 768, height: 1024, name: 'Tablet' },
    ];

    const testGenerator = new TestGenerator(firebaseConfig, viewports);
    
    // Create mock analysis for local testing
    const mockAnalysis = {
      hasUIChanges: true,
      changedPaths: ['src/App.tsx', 'src/components/Header.tsx'],
      components: ['App', 'Header', 'Button'],
      routes: ['/', '/about', '/dashboard'],
      testSuggestions: ['Test main navigation', 'Verify responsive design'],
      riskLevel: 'medium' as const
    };

    const tests = testGenerator.generateTests(mockAnalysis);
    console.log(`Generated ${tests.length} tests`);

    // 3. Run visual tests
    console.log('\n🎭 Step 3: Running visual tests...');
    const runner = new VisualRunner(firebaseConfig, outputDir, 300000); // 5 minutes timeout
    
    await runner.initialize();
    const results = await runner.runTests(tests);
    await runner.cleanup();

    // 4. Report results
    console.log('\n📊 Test Results:');
    console.log('================');
    
    let passed = 0;
    let failed = 0;
    
    for (const result of results) {
      const status = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
      console.log(`${status} ${result.testName} (${result.duration}ms)`);
      
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.slice(0, 2).join(', ')}`);
      }
      
      if (result.screenshots.length > 0) {
        console.log(`   Screenshots: ${result.screenshots.map(s => s.name).join(', ')}`);
      }
      
      if (result.status === 'passed') passed++;
      else if (result.status === 'failed') failed++;
    }

    console.log(`\n📈 Summary: ${passed}/${results.length} passed, ${failed} failed`);
    console.log(`📁 Results saved to: ${outputDir}`);

    // List generated files
    console.log('\n📎 Generated Files:');
    const screenshotDir = path.join(outputDir, 'screenshots');
    const videoDir = path.join(outputDir, 'videos');
    
    try {
      const screenshots = await fs.readdir(screenshotDir);
      screenshots.forEach(file => console.log(`  📸 ${file}`));
    } catch (error) {
      console.log('  No screenshots generated');
    }

    try {
      const videos = await fs.readdir(videoDir);
      videos.forEach(file => console.log(`  🎥 ${file}`));
    } catch (error) {
      console.log('  No videos generated');
    }

    console.log('\n✅ Local test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Local test failed:', error);
    process.exit(1);
  }
}

// Add commander as dependency to package.json
if (require.main === module) {
  runLocalTest().catch(console.error);
}