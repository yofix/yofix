import { StorageFactory } from '../src/providers/storage/StorageFactory';
import { FirebaseStorage } from '../src/providers/storage/FirebaseStorage';
import { S3Storage } from '../src/providers/storage/S3Storage';
import * as core from '@actions/core';

/**
 * Test storage integration for both Firebase and S3
 */
async function testStorageIntegration() {
  console.log('🧪 Testing Storage Integration...\n');

  // Test Firebase Storage
  await testFirebaseStorage();
  
  // Test S3 Storage
  await testS3Storage();
  
  // Test StorageFactory
  await testStorageFactory();
}

async function testFirebaseStorage() {
  console.log('📦 Testing Firebase Storage...');
  
  try {
    // Check if Firebase credentials are configured
    const credentials = process.env.FIREBASE_CREDENTIALS || core.getInput('firebase-credentials');
    const bucket = process.env.FIREBASE_STORAGE_BUCKET || core.getInput('storage-bucket');
    
    if (!credentials || !bucket) {
      console.log('⚠️  Firebase not configured - skipping test');
      return;
    }
    
    // Create Firebase storage instance
    const storage = new FirebaseStorage({
      credentials,
      bucket
    });
    
    await storage.initialize();
    console.log('✅ Firebase Storage initialized');
    
    // Test upload
    const testData = Buffer.from('Test screenshot data');
    const testPath = `test/screenshot-${Date.now()}.png`;
    
    const uploadUrl = await storage.uploadFile(testPath, testData, {
      contentType: 'image/png',
      metadata: {
        test: 'true',
        timestamp: Date.now().toString()
      }
    });
    
    console.log(`✅ Upload successful: ${uploadUrl}`);
    
    // Test URL generation
    const signedUrl = await storage.getSignedUrl(testPath, 3600);
    console.log(`✅ Signed URL generated: ${signedUrl.substring(0, 50)}...`);
    
    // Clean up
    await storage.deleteFile(testPath);
    console.log('✅ Test file cleaned up');
    
  } catch (error) {
    console.error('❌ Firebase Storage test failed:', error);
  }
  
  console.log('');
}

async function testS3Storage() {
  console.log('📦 Testing S3 Storage...');
  
  try {
    // Check if S3 is configured
    const bucket = process.env.S3_BUCKET || core.getInput('s3-bucket');
    
    if (!bucket) {
      console.log('⚠️  S3 not configured - skipping test');
      return;
    }
    
    // Create S3 storage instance
    const storage = new S3Storage({
      bucket,
      region: process.env.AWS_REGION || core.getInput('aws-region') || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || core.getInput('aws-access-key-id'),
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || core.getInput('aws-secret-access-key')
    });
    
    await storage.initialize();
    console.log('✅ S3 Storage initialized');
    
    // Test upload
    const testData = Buffer.from('Test screenshot data');
    const testPath = `test/screenshot-${Date.now()}.png`;
    
    const uploadUrl = await storage.uploadFile(testPath, testData, {
      contentType: 'image/png',
      metadata: {
        test: 'true',
        timestamp: Date.now().toString()
      }
    });
    
    console.log(`✅ Upload successful: ${uploadUrl}`);
    
    // Test URL generation
    const signedUrl = await storage.getSignedUrl(testPath, 3600);
    console.log(`✅ Signed URL generated: ${signedUrl.substring(0, 50)}...`);
    
    // Clean up
    await storage.deleteFile(testPath);
    console.log('✅ Test file cleaned up');
    
  } catch (error) {
    console.error('❌ S3 Storage test failed:', error);
  }
  
  console.log('');
}

async function testStorageFactory() {
  console.log('🏭 Testing StorageFactory...');
  
  try {
    // Test creating from inputs
    const provider = core.getInput('storage-provider') || 'firebase';
    console.log(`Creating ${provider} storage from inputs...`);
    
    const storage = await StorageFactory.createFromInputs();
    console.log(`✅ StorageFactory created ${StorageFactory.getProviderInfo(storage)}`);
    
    // Verify it's the correct type
    if (provider === 'firebase' && storage instanceof FirebaseStorage) {
      console.log('✅ Correct Firebase instance created');
    } else if (provider === 's3' && storage instanceof S3Storage) {
      console.log('✅ Correct S3 instance created');
    } else {
      console.log('❌ Incorrect storage instance type');
    }
    
  } catch (error) {
    console.error('❌ StorageFactory test failed:', error);
  }
  
  console.log('');
}

// Run tests if called directly
if (require.main === module) {
  testStorageIntegration()
    .then(() => {
      console.log('✅ All storage tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Storage tests failed:', error);
      process.exit(1);
    });
}

export { testStorageIntegration };