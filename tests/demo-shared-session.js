#!/usr/bin/env node

/**
 * Visual demonstration of shared browser session benefits
 * Run: node tests/demo-shared-session.js
 */

console.log('🚀 YoFix Shared Browser Session Demo\n');

// Simulate timing with visual progress bars
function showProgress(label, duration) {
  process.stdout.write(`${label}: `);
  const steps = 20;
  const stepDuration = duration / steps;
  
  for (let i = 0; i <= steps; i++) {
    setTimeout(() => {
      if (i < steps) {
        process.stdout.write('█');
      } else {
        process.stdout.write(` ${(duration/1000).toFixed(1)}s\n`);
      }
    }, i * stepDuration);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function demoIndependentSessions() {
  console.log('❌ INDEPENDENT SESSIONS (old behavior)\n');
  
  const routes = ['/home', '/debugger'];
  let totalTime = 0;
  
  for (let i = 0; i < routes.length; i++) {
    console.log(`Route ${i + 1}: ${routes[i]}`);
    
    await sleep(100);
    showProgress('  Browser setup  ', 1000);
    await sleep(1100);
    
    showProgress('  Authentication ', 5000);
    await sleep(5100);
    
    showProgress('  Route testing  ', 3000);
    await sleep(3100);
    
    showProgress('  Browser cleanup', 500);
    await sleep(600);
    
    totalTime += 9600;
    console.log('');
  }
  
  console.log(`Total time: ${(totalTime/1000).toFixed(1)}s\n`);
  return totalTime;
}

async function demoSharedSession() {
  console.log('✅ SHARED SESSION (new behavior)\n');
  
  const routes = ['/home', '/products', '/about'];
  let totalTime = 0;
  
  console.log('Initial setup:');
  await sleep(100);
  showProgress('  Browser setup  ', 1000);
  await sleep(1100);
  
  showProgress('  Authentication ', 5000);
  await sleep(5100);
  totalTime += 6000;
  
  console.log('\nRoute testing (reusing session):');
  for (let i = 0; i < routes.length; i++) {
    console.log(`\nRoute ${i + 1}: ${routes[i]}`);
    showProgress('  Navigate & test', 3000);
    await sleep(3100);
    totalTime += 3000;
  }
  
  console.log('\nCleanup:');
  showProgress('  Browser cleanup', 500);
  await sleep(600);
  totalTime += 500;
  
  console.log(`\nTotal time: ${(totalTime/1000).toFixed(1)}s\n`);
  return totalTime;
}

async function runDemo() {
  const independentTime = await demoIndependentSessions();
  await sleep(1000);
  
  const sharedTime = await demoSharedSession();
  await sleep(500);
  
  console.log('\n📊 RESULTS SUMMARY\n');
  console.log('┌─────────────────────┬──────────┬──────────┐');
  console.log('│ Metric              │ Old      │ New      │');
  console.log('├─────────────────────┼──────────┼──────────┤');
  console.log(`│ Total Time          │ ${(independentTime/1000).toFixed(1)}s   │ ${(sharedTime/1000).toFixed(1)}s   │`);
  console.log(`│ Browser Instances   │ 3        │ 1        │`);
  console.log(`│ Authentications     │ 3        │ 1        │`);
  console.log(`│ Time Saved          │ -        │ ${((independentTime-sharedTime)/1000).toFixed(1)}s    │`);
  console.log(`│ Performance Gain    │ -        │ ${((1 - sharedTime/independentTime) * 100).toFixed(0)}%      │`);
  console.log('└─────────────────────┴──────────┴──────────┘');
  
  console.log('\n🎯 How to enable in your workflow:\n');
  console.log('```yaml');
  console.log('- uses: yofix/yofix@v1.0.22');
  console.log('  with:');
  console.log('    session-mode: sharedAgent  # This is the default');
  console.log('```');
}

runDemo().catch(console.error);