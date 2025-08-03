#!/usr/bin/env node

/**
 * Test script for Firebase Storage upload
 * Usage: node test-firebase-upload.js /path/to/firebase-service.json
 */

const fs = require('fs');
const path = require('path');
const { FirebaseStorage } = require('./dist/providers/storage/FirebaseStorage');

async function testFirebaseUpload(serviceAccountPath) {
  console.log('🧪 Testing Firebase Storage upload...');
  
  try {
    // Read service account file
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log(`✅ Loaded service account for project: ${serviceAccount.project_id}`);
    
    // Create storage instance
    const storage = new FirebaseStorage({
      project_id: serviceAccount.project_id,
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
      bucket: `${serviceAccount.project_id}.appspot.com`
    });
    
    await storage.initialize();
    console.log('✅ Firebase Storage initialized');
    
    // Create a test image
    const testImageBuffer = Buffer.from(`
      <svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="100" fill="#4A90E2"/>
        <text x="100" y="50" font-family="Arial" font-size="20" fill="white" text-anchor="middle" alignment-baseline="middle">
          YoFix Test ${new Date().toISOString()}
        </text>
      </svg>
    `);
    
    // Upload test screenshot
    const filename = `test-screenshot-${Date.now()}.svg`;
    const uploadPath = `yofix/test/${filename}`;
    
    console.log(`📤 Uploading test image: ${uploadPath}`);
    const publicUrl = await storage.uploadFile(uploadPath, testImageBuffer, {
      contentType: 'image/svg+xml',
      metadata: {
        test: 'true',
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`✅ Upload successful!`);
    console.log(`📸 Public URL: ${publicUrl}`);
    
    // Get signed URL
    const signedUrl = await storage.getSignedUrl(uploadPath, 3600);
    console.log(`🔗 Signed URL (valid for 1 hour): ${signedUrl}`);
    
    // Test file exists
    const exists = await storage.exists(uploadPath);
    console.log(`✅ File exists check: ${exists}`);
    
    // List files
    const files = await storage.listFiles('yofix/test/');
    console.log(`📁 Files in test directory: ${files.length}`);
    files.forEach(file => console.log(`   - ${file}`));
    
    // Cleanup
    console.log(`🧹 Cleaning up test file...`);
    await storage.deleteFile(uploadPath);
    
    await storage.cleanup();
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Main
if (process.argv.length < 3) {
  console.error('Usage: node test-firebase-upload.js /path/to/firebase-service.json');
  process.exit(1);
}

const serviceAccountPath = process.argv[2];
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Service account file not found: ${serviceAccountPath}`);
  process.exit(1);
}

testFirebaseUpload(serviceAccountPath);