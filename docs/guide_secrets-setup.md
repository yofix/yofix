# YoFix Secrets & API Keys Setup Guide

This guide walks you through obtaining and configuring all required secrets for YoFix.

## Required Secrets

### 1. CLAUDE_API_KEY (Required)

Claude API key is used for AI-powered visual analysis and fix generation.

**How to obtain:**
1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-api03-...`)

**GitHub Secret name:** `CLAUDE_API_KEY`

**Cost:** 
- Claude 3 Haiku: ~$0.01-0.02 per PR
- Claude 3 Sonnet: ~$0.05-0.10 per PR

### 2. Storage Provider (Choose One)

#### Option A: Firebase Storage

**Required secrets:**
- `FIREBASE_SERVICE_ACCOUNT` - Base64 encoded service account JSON
- `FIREBASE_STORAGE_BUCKET` - Your storage bucket name

**How to set up Firebase:**

1. **Create Firebase Project**
   - Go to [console.firebase.google.com](https://console.firebase.google.com)
   - Click "Create Project"
   - Enter project name (e.g., "my-app-yofix")
   - Disable Google Analytics (optional)

2. **Enable Storage**
   - In Firebase Console, click "Storage" in left menu
   - Click "Get Started"
   - Choose your location (e.g., us-central1)
   - Start in production mode

3. **Create Service Account**
   - Go to Project Settings (gear icon)
   - Navigate to "Service Accounts" tab
   - Click "Generate new private key"
   - Save the downloaded JSON file

4. **Encode Service Account**
   ```bash
   # On macOS/Linux
   base64 -i service-account.json | tr -d '\n' > encoded.txt
   
   # Copy to clipboard (macOS)
   cat encoded.txt | pbcopy
   
   # Copy to clipboard (Linux)
   cat encoded.txt | xclip -selection clipboard
   ```

5. **Get Storage Bucket Name**
   - Go to Storage in Firebase Console
   - Copy the bucket URL (e.g., `my-app-yofix.appspot.com`)
   - Use just the bucket name without `gs://`

#### Option B: AWS S3 Storage

**Required secrets:**
- `S3_BUCKET` - Your S3 bucket name
- `AWS_ACCESS_KEY_ID` - IAM user access key
- `AWS_SECRET_ACCESS_KEY` - IAM user secret key
- `AWS_REGION` (optional) - Default: us-east-1

**How to set up S3:**

1. **Create S3 Bucket**
   ```bash
   aws s3 mb s3://my-app-yofix-screenshots --region us-east-1
   ```

2. **Create IAM User**
   - Go to IAM Console
   - Users → Add User
   - User name: `yofix-github-action`
   - Access type: Programmatic access

3. **Create IAM Policy**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:PutObjectAcl",
           "s3:GetObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::my-app-yofix-screenshots",
           "arn:aws:s3:::my-app-yofix-screenshots/*"
         ]
       }
     ]
   }
   ```

4. **Attach Policy to User**
   - Select the created user
   - Add permissions → Attach policy
   - Select your custom policy

5. **Save Credentials**
   - Download or copy Access Key ID and Secret Access Key

### 3. YOFIX_GITHUB_TOKEN (Automatic)

The `YOFIX_GITHUB_TOKEN` is automatically available in GitHub Actions. No setup required.

**Permissions needed:**
- `pull-requests: write` - To post comments
- `contents: read` - To read repository

## Optional Secrets

### Authentication Testing

If your app requires login:

- `TEST_USER_EMAIL` - Test account email
- `TEST_USER_PASSWORD` - Test account password

**Best practices:**
- Create dedicated test accounts
- Use strong passwords
- Rotate credentials regularly
- Never use production accounts

### Redis Caching

For improved performance:

- `REDIS_URL` - Redis connection string

**Example formats:**
```
redis://localhost:6379
redis://:password@hostname:6379/0
rediss://redis.example.com:6380
```

### Deployment Platforms

#### Vercel
- `VERCEL_TOKEN` - Get from account settings
- `VERCEL_ORG_ID` - Found in team settings
- `VERCEL_PROJECT_ID` - Found in project settings

#### Netlify
- `NETLIFY_AUTH_TOKEN` - Personal access token
- `NETLIFY_SITE_ID` - Site API ID

## Adding Secrets to GitHub

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret:
   - Name: Use the exact names from this guide
   - Value: Paste the secret value
5. Click "Add secret"

## Security Best Practices

### 1. Principle of Least Privilege
- Only grant minimum required permissions
- Use separate accounts for testing
- Rotate keys regularly

### 2. Secret Rotation
- Set calendar reminders to rotate keys
- Update both GitHub secrets and source
- Test after rotation

### 3. Access Control
- Limit who can access repository settings
- Use environment protection rules
- Enable required reviewers for deployments

### 4. Monitoring
- Monitor API usage and costs
- Set up billing alerts
- Review access logs regularly

## Troubleshooting

### "Authentication failed" errors

**Firebase:**
- Ensure service account JSON is properly base64 encoded
- Check if service account has Storage Admin role
- Verify bucket name is correct

**S3:**
- Verify IAM permissions are correct
- Check if bucket exists in specified region
- Ensure credentials are not expired

### "API key invalid" errors

**Claude:**
- Check if key starts with `sk-ant-api03-`
- Verify key hasn't been revoked
- Ensure no extra spaces or newlines

### "Permission denied" errors

**GitHub:**
- Check workflow has correct permissions
- Ensure secrets are available to workflow
- Verify branch protection rules

## Cost Estimation

### Per PR costs:
- **Claude API**: $0.05-0.10
- **Firebase Storage**: <$0.01
- **S3 Storage**: <$0.01
- **Total**: ~$0.06-0.11 per PR

### Monthly costs (100 PRs):
- **Claude API**: $5-10
- **Storage**: <$1
- **Total**: ~$6-11

## Example Secrets Configuration

```yaml
# .github/workflows/visual-test.yml
env:
  # These come from repository secrets
  CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
  FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
  FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
  
  # Optional
  TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
  TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
  REDIS_URL: ${{ secrets.REDIS_URL }}
```

## Next Steps

1. Set up required secrets following this guide
2. Copy an example workflow from `/examples`
3. Run YoFix on your first PR
4. Fine-tune configuration as needed

For more help, see:
- [Quick Start Guide](guide_quickstart.md)
- [Storage Setup](config_storage-setup.md)
- [Authentication Setup](config_authentication.md)