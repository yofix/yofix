# YoFix Storage Infrastructure Setup

This guide covers setting up the required storage infrastructure for YoFix, including dual support for Firebase Storage and AWS S3.

## Overview

YoFix requires two main storage components:
1. **Object Storage** - For screenshots, baselines, and reports (Firebase or S3)
2. **Cache Storage** - For AI responses and expensive operations (Redis)

### Storage Provider Features

| Feature | Firebase Storage | AWS S3 |
|---------|-----------------|---------|
| Screenshots | ✅ | ✅ |
| Baselines | ✅ | ✅ |
| Reports | ✅ | ✅ |
| Public URLs | ✅ (signed URLs) | ✅ (signed URLs) |
| PR Embedding | ✅ | ✅ |
| Cost | Free tier: 5GB | Free tier: 5GB (1 year) |
| Setup Complexity | Medium | Low |
| Default Provider | ✅ | ❌ |

## 1. Object Storage Options

### Option A: Firebase Storage (Recommended)

Firebase Storage is the default and most integrated option.

#### Setup Steps:

1. **Create a Firebase Project**
   ```bash
   # Install Firebase CLI
   npm install -g firebase-tools
   
   # Login to Firebase
   firebase login
   
   # Create a new project
   firebase projects:create yofix-storage
   ```

2. **Enable Storage**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Navigate to Storage
   - Click "Get Started"
   - Choose your region (us-central1 recommended)

3. **Create Service Account**
   ```bash
   # In Firebase Console:
   # Project Settings > Service Accounts > Generate New Private Key
   
   # Encode the JSON file
   base64 -i service-account.json -o service-account-base64.txt
   ```

4. **Set Storage Rules**
   ```javascript
   // storage.rules
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       // Allow read access to all
       match /{allPaths=**} {
         allow read: if true;
       }
       
       // Allow write access with service account
       match /{allPaths=**} {
         allow write: if request.auth != null;
       }
     }
   }
   ```

5. **Configure GitHub Secrets**
   ```yaml
   FIREBASE_SERVICE_ACCOUNT: <base64-encoded-json>
   FIREBASE_STORAGE_BUCKET: your-project.appspot.com
   ```

6. **Action Configuration**
   ```yaml
   - uses: yofix/yofix@v1
     with:
       storage-provider: 'firebase'  # default
       firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
       storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
   ```

### Option B: AWS S3 (Alternative)

AWS S3 is fully supported as an alternative storage provider.

#### Setup Steps:

1. **Create S3 Bucket**
   ```bash
   aws s3 mb s3://yofix-storage --region us-east-1
   ```

2. **Configure Bucket Policy**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::yofix-storage/*"
       }
     ]
   }
   ```

3. **Create IAM User**
   ```bash
   aws iam create-user --user-name yofix-storage
   aws iam attach-user-policy --user-name yofix-storage \
     --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
   ```

4. **Generate Access Keys**
   ```bash
   aws iam create-access-key --user-name yofix-storage
   ```

5. **Configure GitHub Secrets**
   ```yaml
   AWS_ACCESS_KEY_ID: <access-key>
   AWS_SECRET_ACCESS_KEY: <secret-key>
   AWS_REGION: us-east-1
   S3_BUCKET: yofix-storage
   ```

6. **Action Configuration**
   ```yaml
   - uses: yofix/yofix@v1
     with:
       storage-provider: 's3'
       s3-bucket: ${{ vars.S3_BUCKET }}
       aws-region: ${{ vars.AWS_REGION }}
       aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
       aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
   ```

## 2. Cache Storage (Redis)

### Option A: Redis Cloud (Recommended for Production)

1. **Sign up for Redis Cloud**
   - Go to [Redis Cloud](https://redis.com/cloud/sign-up/)
   - Create a free database (30MB)
   - Choose your region

2. **Get Connection Details**
   - Copy the Redis URL from dashboard
   - Format: `redis://default:password@host:port`

3. **Configure GitHub Secrets**
   ```yaml
   REDIS_URL: redis://default:password@redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345
   ```

### Option B: Self-Hosted Redis

1. **Using Docker**
   ```bash
   docker run -d \
     --name yofix-redis \
     -p 6379:6379 \
     -v redis-data:/data \
     redis:7-alpine \
     redis-server --appendonly yes
   ```

2. **Using Heroku Redis**
   ```bash
   heroku addons:create heroku-redis:hobby-dev
   ```

### Option C: No Redis (Fallback)

If Redis is not configured, YoFix will use in-memory caching with these limitations:
- Cache is not shared between workflow runs
- Higher AI API costs due to repeated calls
- Slower performance for repeated analyses

## 3. Screenshot Storage Integration

### How Screenshots are Handled

1. **Capture**: Browser agent captures screenshots during test execution
2. **Upload**: Screenshots are automatically uploaded to configured storage
3. **URL Generation**: Signed URLs are generated for PR embedding
4. **PR Display**: Screenshots are embedded directly in PR comments

### Screenshot URL Format

**Firebase Storage**:
```
https://storage.googleapis.com/[bucket-name]/yofix/[pr-number]/[timestamp]/[screenshot-name].png
```

**AWS S3**:
```
https://[bucket-name].s3.[region].amazonaws.com/yofix/[pr-number]/[timestamp]/[screenshot-name].png
```

### Storage Structure

```
yofix/
├── pr-123/
│   ├── 2024-01-15-120000/
│   │   ├── home-1920x1080.png
│   │   ├── dashboard-1920x1080.png
│   │   └── mobile-375x667.png
│   └── baselines/
│       ├── home-baseline.png
│       └── dashboard-baseline.png
└── pr-124/
    └── 2024-01-16-140000/
        └── ...
```

### Automatic Cleanup

- Screenshots older than 30 days are automatically deleted
- Configure retention with `cleanup-days` input
- Baselines are preserved unless explicitly updated

## 4. GitHub Action Configuration

### Complete Example with Storage

#### Firebase Storage Example
```yaml
name: YoFix Visual Testing

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  visual-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy Preview
        id: deploy
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.YOFIX_GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          projectId: your-project
      
      - name: YoFix Analysis
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.details_url }}
          
          # Storage Configuration (Firebase)
          storage-provider: 'firebase'  # default
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
          
          # Optional Redis Cache
          redis-url: ${{ secrets.REDIS_URL }}
          
          # API Keys
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

#### AWS S3 Storage Example
```yaml
name: YoFix Visual Testing with S3

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  visual-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy Preview
        # Your deployment step here
      
      - name: YoFix Analysis
        uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.url }}
          
          # Storage Configuration (S3)
          storage-provider: 's3'
          s3-bucket: ${{ vars.S3_BUCKET }}
          aws-region: ${{ vars.AWS_REGION }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          
          # API Keys
          github-token: ${{ secrets.YOFIX_GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
```

## 5. Storage Costs

### Firebase Storage
- **Free Tier**: 5GB storage, 1GB/day bandwidth
- **Paid**: $0.026/GB storage, $0.12/GB bandwidth
- **Typical Usage**: ~$5-10/month for small teams

### Redis Cloud
- **Free Tier**: 30MB storage
- **Paid**: Starting at $7/month for 250MB
- **Typical Usage**: Free tier sufficient for most teams

### AWS S3
- **Free Tier**: 5GB storage (12 months)
- **Paid**: $0.023/GB storage, $0.09/GB transfer
- **Typical Usage**: ~$5-10/month for small teams

## 6. Environment Variables

### Required
```bash
FIREBASE_CREDENTIALS=<base64-encoded-service-account>
STORAGE_BUCKET=your-project.appspot.com
CLAUDE_API_KEY=sk-ant-...
YOFIX_GITHUB_TOKEN=${{ secrets.YOFIX_GITHUB_TOKEN }}
```

### Optional
```bash
REDIS_URL=redis://...
CACHE_TTL=3600
MAX_MEMORY_CACHE=104857600
CLEANUP_DAYS=30
```

## 7. Testing Your Setup

### Test Firebase Connection
```bash
# Set environment variables
export FIREBASE_CREDENTIALS=...
export STORAGE_BUCKET=...

# Run storage test
npm run test:storage
```

### Test Redis Connection
```bash
# Set Redis URL
export REDIS_URL=redis://...

# Run cache test
npm run test:cache
```

## 8. Troubleshooting

### Firebase Issues
- **403 Forbidden**: Check service account permissions
- **404 Not Found**: Verify bucket name
- **CORS errors**: Update Firebase Storage CORS rules
- **Screenshots not appearing**: Check if firebase-credentials is base64 encoded

### S3 Issues
- **Access Denied**: Verify IAM permissions and bucket policy
- **Region mismatch**: Ensure aws-region matches bucket location
- **Signed URL expiry**: URLs expire after 1 hour by default
- **Screenshots not appearing**: Check if AWS credentials are correct

### Screenshot Issues
- **No screenshots in PR**: Check storage provider configuration
- **Broken image links**: Verify storage bucket is publicly accessible
- **Missing firebaseUrl**: Ensure storage provider is initialized
- **Upload timeout**: Check network connectivity and file sizes

### Redis Issues
- **Connection refused**: Check firewall/security groups
- **Authentication failed**: Verify password in URL
- **Timeout**: Check network connectivity

### Performance Issues
- Enable Redis for faster repeated analyses
- Use image optimization to reduce storage costs
- Configure cleanup to remove old artifacts
- Consider using S3 for lower latency in your region

## Next Steps

1. Choose your storage providers
2. Follow the setup steps above
3. Configure GitHub Secrets
4. Test the integration
5. Monitor usage and costs