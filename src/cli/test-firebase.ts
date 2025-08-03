#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FirebaseStorageManager } from '../providers/storage/FirebaseStorageManager';
import { FirebaseConfig, FirebaseStorageConfig } from '../types';
import { defaultConfig } from '../config/default.config';

program
  .name('test-firebase')
  .description('Test Firebase Storage upload functionality')
  .requiredOption('-c, --credentials <path>', 'Path to Firebase service account JSON file')
  .option('-b, --bucket <bucket>', 'Storage bucket name (default: auto-detected from project ID)')
  .option('-p, --project <projectId>', 'Firebase project ID (default: auto-detected from credentials)')
  .parse();

const options = program.opts();

async function createTestScreenshot(): Promise<Buffer> {
  const svg = `
    <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#bg)"/>
      <text x="200" y="80" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="white" text-anchor="middle">
        YoFix Test Screenshot
      </text>
      <text x="200" y="120" font-family="Arial, sans-serif" font-size="16" fill="white" text-anchor="middle">
        ${new Date().toLocaleString()}
      </text>
      <text x="200" y="150" font-family="Arial, sans-serif" font-size="12" fill="white" opacity="0.8" text-anchor="middle">
        Firebase Storage Upload Test
      </text>
    </svg>
  `;
  return Buffer.from(svg);
}

async function testFirebaseUpload() {
  console.log('🧪 YoFix Firebase Storage Upload Test\n');
  
  try {
    // Read credentials file
    const credentialsPath = path.resolve(options.credentials);
    console.log(`📄 Reading credentials from: ${credentialsPath}`);
    
    const credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
    const serviceAccount = JSON.parse(credentialsContent);
    
    // Determine bucket and project ID
    const projectId = options.project || serviceAccount.project_id;
    const bucket = options.bucket || `${projectId}.appspot.com`;
    
    console.log(`🔥 Project ID: ${projectId}`);
    console.log(`🪣 Storage Bucket: ${bucket}`);
    console.log(`⏱️  Signed URL expiry: ${defaultConfig.storage.providers.firebase.signedUrlExpiryHours} hours`);
    
    // Create Firebase config
    const firebaseConfig: FirebaseConfig = {
      projectId,
      target: 'test',
      buildSystem: 'vite',
      previewUrl: 'https://test--pr-123--test.web.app',
      region: 'us-central1'
    };
    
    const storageConfig: FirebaseStorageConfig = {
      bucket,
      basePath: defaultConfig.storage.basePath,
      signedUrlExpiry: defaultConfig.storage.providers.firebase.signedUrlExpiryHours * 60 * 60 * 1000
    };
    
    // Initialize storage manager
    console.log('\n📦 Initializing Firebase Storage Manager...');
    const credentialsBase64 = Buffer.from(credentialsContent).toString('base64');
    const storageManager = new FirebaseStorageManager(firebaseConfig, storageConfig, credentialsBase64);
    
    // Create test screenshots
    console.log('\n🖼️  Creating test screenshots...');
    const testDir = path.join(process.cwd(), '.yofix-test');
    await fs.mkdir(testDir, { recursive: true });
    
    const screenshots = [];
    for (let i = 0; i < 3; i++) {
      const screenshotBuffer = await createTestScreenshot();
      const filename = `test-screenshot-${i + 1}.svg`;
      const filepath = path.join(testDir, filename);
      
      await fs.writeFile(filepath, screenshotBuffer);
      
      screenshots.push({
        name: filename,
        path: filepath,
        viewport: { width: 1920, height: 1080, name: '1920x1080' },
        timestamp: Date.now()
      });
      
      console.log(`  ✅ Created: ${filename}`);
    }
    
    // Upload screenshots
    console.log('\n📤 Uploading screenshots to Firebase Storage...');
    const uploadedScreenshots = await storageManager.uploadScreenshots(screenshots);
    
    console.log('\n✅ Upload Results:');
    for (const screenshot of uploadedScreenshots) {
      if (screenshot.firebaseUrl) {
        console.log(`\n  📸 ${screenshot.name}`);
        console.log(`     🔗 URL: ${screenshot.firebaseUrl}`);
      } else {
        console.log(`\n  ❌ ${screenshot.name} - Upload failed`);
      }
    }
    
    // Show console URL
    const consoleUrl = storageManager.generateStorageConsoleUrl();
    console.log(`\n🌐 Firebase Console: ${consoleUrl}`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up test files...');
    await fs.rm(testDir, { recursive: true, force: true });
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testFirebaseUpload();