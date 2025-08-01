import { StorageFactory } from '../src/providers/storage/StorageFactory';
import { FirebaseStorage } from '../src/providers/storage/FirebaseStorage';
import { S3Storage } from '../src/providers/storage/S3Storage';

/**
 * Test storage integration locally (without GitHub Actions)
 */
async function testStorageLocal() {
  console.log('🧪 Testing Storage Integration Locally...\n');

  // Test Firebase Storage
  await testFirebaseStorage();
  
  // Test S3 Storage
  await testS3Storage();
}

async function testFirebaseStorage() {
  console.log('📦 Testing Firebase Storage...');
  
  try {
    // Check if Firebase credentials are configured
    const credentials = process.env.FIREBASE_CREDENTIALS;
    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    
    if (!credentials || !bucket) {
      console.log('⚠️  Firebase not configured - skipping test');
      console.log('   Set FIREBASE_CREDENTIALS and FIREBASE_STORAGE_BUCKET environment variables');
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
    const bucket = process.env.S3_BUCKET;
    
    if (!bucket) {
      console.log('⚠️  S3 not configured - skipping test');
      console.log('   Set S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY environment variables');
      return;
    }
    
    // Create S3 storage instance
    const storage = new S3Storage({
      bucket,
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
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

// Run tests if called directly
if (require.main === module) {
  testStorageLocal()
    .then(() => {
      console.log('✅ All storage tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Storage tests failed:', error);
      process.exit(1);
    });
}

export { testStorageLocal };