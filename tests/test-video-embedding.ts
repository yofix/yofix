#!/usr/bin/env ts-node
/**
 * Test video embedding functionality
 */

import { Video } from '../src/types';

// Test video embedding logic
function generateEmbeddedVideos(videos: Video[]): string {
  if (videos.length === 0) {
    return '';
  }

  let gallery = '### 🎥 Test Videos\n\n';
  
  // Only show videos that have Firebase URLs
  const videosWithUrls = videos.filter(v => v.firebaseUrl);
  
  if (videosWithUrls.length === 0) {
    gallery += '_Videos captured but URLs not available_\n\n';
    return gallery;
  }
  
  // GitHub doesn't support video embedding, so we'll create nice preview links
  // with video thumbnails if possible
  gallery += '<table>\n';
  
  // Create rows of 3 videos each
  for (let i = 0; i < videosWithUrls.length; i += 3) {
    gallery += '<tr>\n';
    
    for (let j = i; j < Math.min(i + 3, videosWithUrls.length); j++) {
      const video = videosWithUrls[j];
      gallery += `<td align="center" width="33%">\n`;
      gallery += `<a href="${video.firebaseUrl}">\n`;
      // Use a play button emoji as a visual indicator
      gallery += `<div>🎬</div>\n`;
      gallery += `<strong>${video.name.replace(/\.(webm|mp4)$/, '')}</strong><br>\n`;
      gallery += `<em>${formatDuration(video.duration)}</em><br>\n`;
      gallery += `<kbd>▶️ Click to Play</kbd>\n`;
      gallery += `</a>\n`;
      gallery += `</td>\n`;
    }
    
    // Fill empty cells if needed
    for (let k = videosWithUrls.length % 3; k < 3 && k > 0 && i + 3 > videosWithUrls.length; k++) {
      gallery += `<td></td>\n`;
    }
    
    gallery += '</tr>\n';
  }
  
  gallery += '</table>\n\n';
  
  // Add direct links as well
  gallery += '<details>\n<summary>Direct video links</summary>\n\n';
  for (const video of videosWithUrls) {
    gallery += `- [${video.name}](${video.firebaseUrl}) - ${formatDuration(video.duration)}\n`;
  }
  gallery += '\n</details>\n\n';

  return gallery;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

// Test data
const testVideos: Video[] = [
  {
    name: 'test-run-1.webm',
    path: '/tmp/test-run-1.webm',
    duration: 15000,
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/frontend-qa/videos/test-run-1.webm'
  },
  {
    name: 'test-run-2.webm',
    path: '/tmp/test-run-2.webm',
    duration: 23500,
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/frontend-qa/videos/test-run-2.webm'
  },
  {
    name: 'test-run-3.webm',
    path: '/tmp/test-run-3.webm',
    duration: 8000,
    timestamp: Date.now(),
    firebaseUrl: undefined // Test missing URL
  }
];

console.log('🧪 Testing Video Embedding Logic\n');

const html = generateEmbeddedVideos(testVideos);

console.log('Generated HTML:\n');
console.log('=' .repeat(80));
console.log(html);
console.log('=' .repeat(80));

// Validate output
const tableCount = (html.match(/<table>/g) || []).length;
const playButtonCount = (html.match(/🎬/g) || []).length;
const linkCount = (html.match(/\[.*?\]\(https:\/\/storage\.googleapis\.com/g) || []).length;
const clickToPlayCount = (html.match(/Click to Play/g) || []).length;

console.log('\n✅ Validation:');
console.log(`   - Table found: ${tableCount} (expected: 1)`);
console.log(`   - Play button emojis: ${playButtonCount} (expected: 2)`);
console.log(`   - Direct links in details: ${linkCount} (expected: 2)`);
console.log(`   - Click to Play buttons: ${clickToPlayCount} (expected: 2)`);
console.log(`   - Videos with URLs: 2 of 3`);

// Show what the video names look like
console.log('\n📹 Video Processing:');
testVideos.forEach(v => {
  const cleanName = v.name.replace(/\.(webm|mp4)$/, '');
  console.log(`   ${v.name} → "${cleanName}" (${formatDuration(v.duration)})`);
});