#!/usr/bin/env node

/**
 * Quick test script to see which routes are impacted by a file change
 */

const fs = require('fs');
const path = require('path');

async function testFile() {
  const testFile = 'src/pages/members/Configurations/ConfigurationCenter';
  const patternsPath = '/Users/hari/2025/lp/loop-frontend/.yofix/patterns.json';

  console.log('\n🔍 Testing Route Detection\n');
  console.log(`File: ${testFile}`);
  console.log('─'.repeat(60));

  // Load learned patterns
  const patternsData = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
  const patterns = patternsData.pattern;

  console.log('\n📦 Framework:', patterns.framework);
  console.log('✨ Confidence:', (patterns.confidence * 100).toFixed(1) + '%');

  console.log('\n📂 Component Directories:');
  patterns.patterns.componentPaths.directories.forEach(dir => {
    console.log(`   - ${dir}`);
  });

  console.log('\n🛣️  Common Routes Found:');
  patterns.patterns.routeStructure.commonPaths.forEach(route => {
    console.log(`   - ${route}`);
  });

  console.log('\n📍 Route Locations:');
  patterns.patterns.routeDefinitions.locations.forEach(loc => {
    console.log(`   - ${loc}`);
  });

  console.log('\n🔧 Reference Style:', patterns.patterns.componentPaths.referenceStyle);
  console.log('📝 File Naming Patterns:', patterns.patterns.componentPaths.fileNamingPatterns.join(', '));

  // Check if test file matches learned patterns
  console.log('\n🎯 Pattern Matching for Test File:');

  const matchesComponentDir = patterns.patterns.componentPaths.directories.some(dir =>
    testFile.includes(dir)
  );
  console.log(`   ✓ In component directory: ${matchesComponentDir}`);

  const hasCorrectExtension = patterns.patterns.componentPaths.fileNamingPatterns.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(testFile + '.tsx') || regex.test(testFile + '.ts');
  });
  console.log(`   ✓ Matches file pattern: ${hasCorrectExtension}`);

  const usesLazyLoading = patterns.patterns.lazyLoading.enabled;
  console.log(`   ✓ Uses lazy loading: ${usesLazyLoading}`);

  // Import aliases
  console.log('\n🔗 Import Aliases:');
  Object.entries(patterns.patterns.importAliases.aliases).forEach(([alias, path]) => {
    console.log(`   ${alias} → ${path}`);
  });

  console.log('\n💡 Expected Route Impact:');
  console.log(`   Based on learned patterns, this component is likely used in routes`);
  console.log(`   that lazy-load from "src/pages/members/" directory.`);
  console.log(`   \n   Potential routes: /configurations, /settings, /config-center`);
  console.log(`   (exact route requires import graph analysis)\n`);
}

testFile().catch(console.error);
