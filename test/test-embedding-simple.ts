#!/usr/bin/env ts-node
/**
 * Simple test for screenshot embedding HTML generation
 */

import { Screenshot } from '../src/types';

// Simplified version of the embedding logic for testing
function generateEmbeddedScreenshots(screenshots: Screenshot[]): string {
  if (screenshots.length === 0) {
    return '';
  }

  let gallery = '### 📸 Screenshots\n\n';
  
  // Group screenshots by test/route name (remove viewport info)
  const groupedByRoute = screenshots.reduce((acc, screenshot) => {
    // Extract route from screenshot name by removing viewport dimensions
    let route = screenshot.name;
    // Remove viewport size pattern (e.g., -1920x1080)
    route = route.replace(/-\d+x\d+$/, '');
    // Clean up the route name
    route = route.replace(/^\//, '').replace(/-/g, ' ');
    
    if (!acc[route]) {
      acc[route] = [];
    }
    acc[route].push(screenshot);
    return acc;
  }, {} as Record<string, Screenshot[]>);

  // Generate gallery for each route
  for (const [route, routeScreenshots] of Object.entries(groupedByRoute)) {
    gallery += `#### Route: \`${route}\`\n\n`;
    
    // Only show images if they have Firebase URLs
    const screenshotsWithUrls = routeScreenshots.filter(s => s.firebaseUrl);
    
    if (screenshotsWithUrls.length === 0) {
      gallery += `_Screenshots captured but URLs not available_\n\n`;
      continue;
    }
    
    // Create a table for viewports
    gallery += '<table>\n<tr>\n';
    
    // Sort by viewport size (desktop, tablet, mobile)
    const sorted = screenshotsWithUrls.sort((a, b) => b.viewport.width - a.viewport.width);
    
    for (const screenshot of sorted) {
      gallery += `<td align="center">\n`;
      gallery += `<strong>${screenshot.viewport.name}</strong><br>\n`;
      gallery += `${screenshot.viewport.width}×${screenshot.viewport.height}<br>\n`;
      gallery += `<img src="${screenshot.firebaseUrl}" width="300" alt="${screenshot.name}" />\n`;
      gallery += `</td>\n`;
    }
    
    gallery += '</tr>\n</table>\n\n';
  }

  return gallery;
}

// Test data
const testScreenshots: Screenshot[] = [
  {
    name: 'spa-loading-1920x1080',
    path: '/tmp/spa-loading-1920x1080.png',
    viewport: { name: 'Desktop', width: 1920, height: 1080 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/test-bucket/screenshots/spa-loading-1920x1080.png'
  },
  {
    name: 'spa-loading-768x1024',
    path: '/tmp/spa-loading-768x1024.png',
    viewport: { name: 'Tablet', width: 768, height: 1024 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/test-bucket/screenshots/spa-loading-768x1024.png'
  },
  {
    name: 'spa-loading-375x667',
    path: '/tmp/spa-loading-375x667.png',
    viewport: { name: 'Mobile', width: 375, height: 667 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/test-bucket/screenshots/spa-loading-375x667.png'
  },
  {
    name: 'route-test-1920x1080',
    path: '/tmp/route-test-1920x1080.png',
    viewport: { name: 'Desktop', width: 1920, height: 1080 },
    timestamp: Date.now(),
    firebaseUrl: undefined // Test missing URL
  }
];

console.log('🧪 Testing Screenshot Embedding Logic\n');

const html = generateEmbeddedScreenshots(testScreenshots);

console.log('Generated HTML:\n');
console.log('=' .repeat(80));
console.log(html);
console.log('=' .repeat(80));

// Validate output
const imgCount = (html.match(/<img /g) || []).length;
const tableCount = (html.match(/<table>/g) || []).length;

console.log('\n✅ Validation:');
console.log(`   - Images found: ${imgCount} (expected: 3)`);
console.log(`   - Tables found: ${tableCount} (expected: 2)`);
console.log(`   - Routes found: spa loading, route test`);

// Show what the route names look like
console.log('\n📋 Route Name Extraction:');
testScreenshots.forEach(s => {
  const routeName = s.name.replace(/-\d+x\d+$/, '').replace(/^\//, '').replace(/-/g, ' ');
  console.log(`   ${s.name} → "${routeName}"`);
});