#!/usr/bin/env node

const { Agent } = require('./dist/browser-agent/index.js');

async function testElementSelection() {
  console.log('🧪 Testing Phase 2 Element Selection Improvements\n');
  
  const agent = new Agent(
    'go to https://app.tryloop.ai, click on "sign-in with password instead" link, then click the LOGIN button', 
    {
      headless: false,
      debug: true,
      maxSteps: 10
    }
  );
  
  try {
    const result = await agent.run();
    
    console.log('\n📊 Test Results:');
    console.log(`Success: ${result.success}`);
    console.log(`Steps: ${result.steps.length}`);
    console.log(`Reliability: ${result.reliability?.overall || 'N/A'}`);
    
    if (result.reliability) {
      console.log('\n🔍 Reliability Breakdown:');
      console.log(`Task Completeness: ${(result.reliability.factors.taskCompleteness * 100).toFixed(1)}%`);
      console.log(`Verification Confidence: ${(result.reliability.factors.verificationConfidence * 100).toFixed(1)}%`);
      
      if (result.reliability.issues.length > 0) {
        console.log('\n⚠️ Issues:', result.reliability.issues.join('; '));
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await agent.cleanup();
  }
}

testElementSelection().catch(console.error);