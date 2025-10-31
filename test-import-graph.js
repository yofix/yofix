#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Read the import graph cache
const cacheFile = path.join('/Users/hari/2025/lp/loop-frontend', '.yofix', 'import-graph.json');

if (!fs.existsSync(cacheFile)) {
  console.error('❌ Import graph cache not found');
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));

console.log('🔍 Checking import graph for Topbar and PrivateLayout...\n');

// Check if Topbar.tsx is in the cache
const topbarFiles = Object.keys(cache.files).filter(f => f.includes('Topbar'));
console.log(`Topbar files in cache: ${topbarFiles.length}`);
topbarFiles.forEach(f => console.log(`  - ${f}`));

// Check if PrivateLayout.tsx is in the cache
const layoutFiles = Object.keys(cache.files).filter(f => f.includes('PrivateLayout'));
console.log(`\nPrivateLayout files in cache: ${layoutFiles.length}`);
layoutFiles.forEach(f => console.log(`  - ${f}`));

// Check imports in PrivateLayout
const privateLayoutFile = layoutFiles.find(f => f.endsWith('PrivateLayout.tsx'));
if (privateLayoutFile) {
  const privateLayout = cache.files[privateLayoutFile];
  console.log(`\n📦 Imports in ${privateLayoutFile}:`);
  privateLayout.imports.forEach(imp => {
    console.log(`  - ${imp.source} (${imp.specifiers.join(', ')})`);
  });

  // Check if it imports Topbar
  const topbarImport = privateLayout.imports.find(imp =>
    imp.source.includes('Topbar') || imp.source.includes('layout/Topbar')
  );
  if (topbarImport) {
    console.log(`\n✅ PrivateLayout imports Topbar via: ${topbarImport.source}`);
  } else {
    console.log(`\n❌ PrivateLayout does NOT import Topbar`);
  }
}

// Check if layout/index.ts is in the cache
const layoutIndexFiles = Object.keys(cache.files).filter(f =>
  f.includes('layout/index') || f.endsWith('layout/index.ts')
);
console.log(`\n📦 Layout index files in cache: ${layoutIndexFiles.length}`);
layoutIndexFiles.forEach(f => {
  console.log(`  - ${f}`);
  const file = cache.files[f];
  console.log(`    Imports: ${file.imports.map(i => i.source).join(', ')}`);
  console.log(`    Exports: ${file.exports.join(', ')}`);
});

// Check router files
const routerFiles = Object.keys(cache.files).filter(f =>
  f.includes('routes/PrivateRouter/index')
);
console.log(`\n📦 Router files in cache: ${routerFiles.length}`);
routerFiles.forEach(f => {
  console.log(`  - ${f}`);
  const file = cache.files[f];
  const layoutImport = file.imports.find(imp =>
    imp.source.includes('layout') || imp.source.includes('Layout')
  );
  if (layoutImport) {
    console.log(`    ✅ Router imports layout via: ${layoutImport.source}`);
  }
});
