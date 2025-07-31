#!/usr/bin/env ts-node

/**
 * Test script to verify screenshot testing functionality in YoFix
 */

import { Agent } from '../src/browser-agent/core/Agent';
import { VisualDiffer } from '../src/core/baseline/VisualDiffer';
import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';

async function testScreenshotFunctionality() {
  console.log('🧪 Testing YoFix Screenshot Functionality\n');
  
  const results = {
    screenshotCapture: false,
    visualDiff: false,
    browserAgent: false,
    fullFlow: false
  };
  
  try {
    // Test 1: Browser Agent Screenshot Capture
    console.log('1️⃣ Testing Browser Agent Screenshot Capture...');
    const agent = new Agent('Take a screenshot of example.com', {
      headless: true,
      llmProvider: 'anthropic'
    });
    
    // Mock API key for testing
    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY || 'test-key';
    
    await agent.initialize();
    const result = await agent.run();
    
    if (result.screenshots && result.screenshots.length > 0) {
      console.log('✅ Screenshot capture working - captured', result.screenshots.length, 'screenshots');
      results.screenshotCapture = true;
      
      // Save test screenshot
      const testDir = path.join(__dirname, 'screenshots');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(testDir, 'test-screenshot.png'),
        result.screenshots[0]
      );
      console.log('   Saved test screenshot to test/screenshots/test-screenshot.png');
    } else {
      console.log('❌ No screenshots captured');
    }
    
    await agent.cleanup();
    
    // Test 2: Visual Differ
    console.log('\n2️⃣ Testing Visual Differ...');
    const differ = new VisualDiffer({
      threshold: 0.1,
      includeAA: true
    });
    
    // Create two test images with slight differences
    const img1 = new PNG({ width: 100, height: 100 });
    const img2 = new PNG({ width: 100, height: 100 });
    
    // Fill with white
    for (let i = 0; i < img1.data.length; i += 4) {
      img1.data[i] = 255;     // R
      img1.data[i + 1] = 255; // G
      img1.data[i + 2] = 255; // B
      img1.data[i + 3] = 255; // A
      
      img2.data[i] = 255;
      img2.data[i + 1] = 255;
      img2.data[i + 2] = 255;
      img2.data[i + 3] = 255;
    }
    
    // Add a red square to img2
    for (let y = 40; y < 60; y++) {
      for (let x = 40; x < 60; x++) {
        const idx = (y * 100 + x) * 4;
        img2.data[idx] = 255;     // R
        img2.data[idx + 1] = 0;   // G
        img2.data[idx + 2] = 0;   // B
      }
    }
    
    const buffer1 = PNG.sync.write(img1);
    const buffer2 = PNG.sync.write(img2);
    
    const comparison = await differ.compare(
      {
        id: 'test',
        route: '/test',
        viewport: { width: 100, height: 100, name: 'test' },
        screenshot: buffer1,
        metadata: { timestamp: Date.now() }
      },
      buffer2
    );
    
    if (comparison.diff.hasDifferences) {
      console.log('✅ Visual differ working');
      console.log(`   Detected ${comparison.diff.pixelsDiff} pixel differences (${comparison.diff.percentage}%)`);
      results.visualDiff = true;
    } else {
      console.log('❌ Visual differ failed to detect differences');
    }
    
    // Test 3: Full Screenshot Testing Flow
    console.log('\n3️⃣ Testing Full Screenshot Flow...');
    const testTask = `
    1. Navigate to https://example.com
    2. Take a screenshot
    3. Check for visual issues
    `;
    
    const flowAgent = new Agent(testTask, {
      headless: true,
      llmProvider: 'anthropic'
    });
    
    await flowAgent.initialize();
    const flowResult = await flowAgent.run();
    
    if (flowResult.success) {
      console.log('✅ Full flow test passed');
      results.fullFlow = true;
      
      // Check if visual issues were detected
      const state = flowAgent.getState();
      const visualIssues = state.memory.get('visual_issues') || [];
      console.log(`   Detected ${visualIssues.length} visual issues`);
    } else {
      console.log('❌ Full flow test failed:', flowResult.error);
    }
    
    await flowAgent.cleanup();
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log('─'.repeat(40));
    console.log(`Screenshot Capture: ${results.screenshotCapture ? '✅' : '❌'}`);
    console.log(`Visual Differ: ${results.visualDiff ? '✅' : '❌'}`);
    console.log(`Full Flow: ${results.fullFlow ? '✅' : '❌'}`);
    console.log('─'.repeat(40));
    
    const allPassed = Object.values(results).every(r => r);
    console.log(`\nOverall: ${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}`);
    
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

// Run the test
testScreenshotFunctionality().catch(console.error);