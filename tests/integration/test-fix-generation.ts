import { SmartFixGenerator } from '../../src/fixes/SmartFixGenerator';
import { CodebaseAnalyzer } from '../../src/context/CodebaseAnalyzer';
import { VisualIssue } from '../../src/bot/types';

async function testFixGeneration() {
  console.log('🧪 Testing Fix Generation with Codebase Context...\n');
  
  // 1. Analyze codebase
  console.log('1️⃣ Analyzing codebase...');
  const analyzer = new CodebaseAnalyzer();
  const context = await analyzer.analyzeRepository();
  
  console.log(`   ✅ Found ${context.routes.length} routes`);
  console.log(`   ✅ Framework: ${context.framework}`);
  console.log(`   ✅ Style system: ${context.styleSystem}`);
  console.log(`   ✅ Components: ${context.components.length}\n`);
  
  // 2. Create fix generator with context
  console.log('2️⃣ Creating fix generator...');
  const claudeApiKey = process.env.CLAUDE_API_KEY || 'mock-key';
  const fixGenerator = new SmartFixGenerator(claudeApiKey, context);
  console.log('   ✅ Fix generator initialized with codebase context\n');
  
  // 3. Test with sample issues
  const testIssues: VisualIssue[] = [
    {
      id: 1,
      severity: 'high',
      type: 'layout-shift',
      description: 'Button moves down when hovering over it, causing layout shift',
      affectedViewports: ['desktop', 'tablet'],
      location: {
        route: '/dashboard',
        selector: '.action-button'
      },
      screenshots: []
    },
    {
      id: 2,
      severity: 'medium',
      type: 'text-overflow',
      description: 'Long product names overflow their containers on mobile',
      affectedViewports: ['mobile'],
      location: {
        route: '/products',
        selector: '.product-card .product-name'
      },
      screenshots: []
    }
  ];
  
  console.log('3️⃣ Generating fixes for test issues...\n');
  
  for (const issue of testIssues) {
    console.log(`📝 Issue #${issue.id}: ${issue.type}`);
    console.log(`   Description: ${issue.description}`);
    
    try {
      // Mock mode for testing without API calls
      if (claudeApiKey === 'mock-key') {
        console.log('   ⚠️  Running in mock mode (no CLAUDE_API_KEY set)');
        console.log('   ✅ Fix would be generated with real API key\n');
      } else {
        const fix = await fixGenerator.generateFix(issue);
        if (fix) {
          console.log(`   ✅ Generated fix:`);
          console.log(`      Description: ${fix.description}`);
          console.log(`      Confidence: ${fix.confidence}`);
          console.log(`      Files affected: ${fix.files.length}`);
          fix.files.forEach(file => {
            console.log(`      - ${file.path}: ${file.changes.length} change(s)`);
          });
          console.log();
        } else {
          console.log('   ❌ No fix generated\n');
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  }
  
  console.log('✅ Integration test complete!');
  console.log('\nNext steps:');
  console.log('1. Set CLAUDE_API_KEY environment variable for real fix generation');
  console.log('2. Test with actual visual issues from PR comments');
  console.log('3. Deploy as GitHub Action for alpha testing');
}

// Run the test
testFixGeneration().catch(console.error);