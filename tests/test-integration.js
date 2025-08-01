/**
 * Integration test to verify LLM authentication is working in the core engine
 */

const { Agent } = require('./dist/browser-agent/core/Agent');
require('dotenv').config({ path: '.env.local' });

async function testIntegratedLLMAuth() {
  console.log('🧪 Testing Integrated LLM Authentication in YoFix Core\n');
  
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error('❌ CLAUDE_API_KEY is required');
    process.exit(1);
  }
  
  // Define a task that includes LLM authentication
  const testTask = `
1. Use llm_login to authenticate with email="hari@tryloop.ai" password="Loop@134" loginUrl="https://app.tryloop.ai/login/password"
2. Navigate to https://app.tryloop.ai/dashboard after authentication
3. Take a screenshot for baseline comparison
4. Run check_visual_issues with screenshot=true to detect layout problems
5. Save results to test-results.json
`;

  const agent = new Agent(testTask, {
    headless: false,
    maxSteps: 10,
    llmProvider: 'anthropic',
    viewport: { width: 1920, height: 1080 },
    debug: true
  });
  
  try {
    console.log('📋 Task:\n' + testTask);
    console.log('🚀 Starting agent...\n');
    
    // Set API key
    process.env.ANTHROPIC_API_KEY = apiKey;
    
    await agent.initialize();
    const result = await agent.run();
    
    console.log('\n📊 Results:');
    console.log('Success:', result.success);
    console.log('Steps completed:', result.stepsCompleted);
    console.log('Final state:', result.finalState);
    
    if (result.success) {
      console.log('\n✅ Integration test passed! LLM authentication is working in the core engine.');
    } else {
      console.log('\n❌ Integration test failed:', result.error);
    }
    
    // Keep browser open for inspection
    console.log('\n⏸️  Browser will remain open for 20 seconds...');
    await new Promise(resolve => setTimeout(resolve, 20000));
    
    await agent.cleanup();
    
  } catch (error) {
    console.error('❌ Test error:', error);
    await agent.cleanup();
    process.exit(1);
  }
}

// Run the test
testIntegratedLLMAuth().catch(console.error);