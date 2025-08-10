# YoFix Baseline Generation - Host Repository Integration Guide

## Overview

This guide explains how to integrate YoFix baseline generation into your repository for visual regression testing. The baseline generation workflow allows you to capture reference screenshots from your production site that will be used to detect visual changes in pull requests.

## Prerequisites

Before integrating baseline generation, ensure you have:

1. **YoFix Action Installed**: Your repository uses YoFix for visual testing
2. **Production URL**: A stable production or staging environment
3. **Storage Provider Configured**: Firebase, AWS S3, or GitHub artifacts
4. **Required Secrets**: API keys and storage credentials

## Quick Start Integration

### Step 1: Copy the Workflow File

Create `.github/workflows/generate-baseline.yml` in your repository:

```yaml
name: Generate Baseline Screenshots

on:
  workflow_dispatch:
    inputs:
      production-url:
        description: 'Production URL to capture baselines from'
        required: true
        type: string
        default: 'https://your-production-site.com'  # Update this
      
      test-routes:
        description: 'Comma-separated list of routes to capture'
        required: false
        type: string
        default: '/'  # Add your default routes
      
      viewports:
        description: 'Viewport sizes'
        required: false
        type: string
        default: '1920x1080,768x1024,375x667'

jobs:
  generate-baselines:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: LoopKitchen/yofix@v1  # Use latest version
        with:
          preview-url: ${{ inputs.production-url }}
          production-url: ${{ inputs.production-url }}
          mode: baseline-generation
          test-routes: ${{ inputs.test-routes }}
          viewports: ${{ inputs.viewports }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          # Add your storage configuration below
```

### Step 2: Configure Secrets

Add these secrets to your repository (Settings → Secrets and variables → Actions):

#### Required Secrets
- `CLAUDE_API_KEY` - For AI-powered features (get from Anthropic)
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

#### Storage Provider Secrets (Choose One)

**Option A: Firebase Storage (Recommended)**
```
FIREBASE_CREDENTIALS - Base64 encoded service account JSON
FIREBASE_BUCKET - Your storage bucket name
```

**Option B: AWS S3**
```
AWS_ACCESS_KEY_ID - Your AWS access key
AWS_SECRET_ACCESS_KEY - Your AWS secret key
S3_BUCKET - Your S3 bucket name
```

**Option C: GitHub Artifacts**
No additional secrets needed (uses GITHUB_TOKEN)

#### Optional Authentication Secrets
If your site requires login:
```
AUTH_EMAIL - Test account email
AUTH_PASSWORD - Test account password
```

### Step 3: Customize for Your Application

Update the workflow with your specific configuration:

```yaml
# For an e-commerce site
test-routes: '/,/products,/cart,/checkout'

# For a SaaS dashboard
test-routes: '/,/dashboard,/settings,/reports'

# For a marketing site
test-routes: '/,/about,/features,/pricing,/contact'
```

## Complete Integration Example

Here's a complete example for a typical web application:

```yaml
name: Generate Baseline Screenshots

on:
  workflow_dispatch:
    inputs:
      production-url:
        description: 'Production URL'
        required: true
        type: string
        default: 'https://app.example.com'
      
      test-routes:
        description: 'Routes to capture (comma-separated)'
        required: false
        type: string
        default: '/,/dashboard,/profile,/settings'
      
      enable-ai-navigation:
        description: 'Auto-discover routes using AI'
        required: false
        type: boolean
        default: false
      
      viewports:
        description: 'Viewport sizes'
        required: false
        type: string
        default: '1920x1080,768x1024,375x667'
      
      auth-email:
        description: 'Login email (optional)'
        required: false
        type: string
      
      auth-password:
        description: 'Login password (optional)'
        required: false
        type: string

jobs:
  generate-baselines:
    runs-on: ubuntu-latest
    name: Generate Baseline Screenshots
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Generate Baselines
        uses: LoopKitchen/yofix@v1
        with:
          # URLs
          preview-url: ${{ inputs.production-url }}
          production-url: ${{ inputs.production-url }}
          
          # Mode
          mode: baseline-generation
          
          # Routes and navigation
          test-routes: ${{ inputs.test-routes }}
          enable-ai-navigation: ${{ inputs.enable-ai-navigation }}
          max-routes: 20
          
          # Viewports
          viewports: ${{ inputs.viewports }}
          
          # Authentication
          auth-email: ${{ inputs.auth-email || secrets.AUTH_EMAIL }}
          auth-password: ${{ inputs.auth-password || secrets.AUTH_PASSWORD }}
          auth-login-url: '/login'
          auth-mode: 'llm'
          
          # API Keys
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          
          # Firebase Storage
          storage-provider: 'firebase'
          firebase-credentials: ${{ secrets.FIREBASE_CREDENTIALS }}
          storage-bucket: ${{ secrets.FIREBASE_BUCKET }}
      
      - name: Upload Artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: baseline-screenshots
          path: baselines/
          retention-days: 30
```

## How It Works

### Baseline Storage Structure

Baselines are stored with consistent naming:
```
baselines/
├── root_1920x1080.png         # Homepage desktop
├── root_768x1024.png           # Homepage tablet  
├── root_375x667.png            # Homepage mobile
├── dashboard_1920x1080.png    # Dashboard desktop
├── dashboard_768x1024.png      # Dashboard tablet
└── dashboard_375x667.png       # Dashboard mobile
```

### Route Naming Convention
- `/` → `root`
- `/dashboard` → `dashboard`
- `/user/profile` → `user_profile`
- Special characters are sanitized

### Integration with PR Testing

Once baselines are generated, your PR workflows will automatically:
1. Capture screenshots of the preview deployment
2. Compare against these baselines
3. Report visual differences
4. Create new baselines if none exist

## Usage Scenarios

### Initial Setup
First time setting up visual testing:
```bash
1. Add the workflow file
2. Configure secrets
3. Run workflow with your production URL
4. Specify main routes (or use AI discovery)
5. Baselines are now ready for PR testing
```

### After Major UI Updates
When you've made intentional design changes:
```bash
1. Merge design changes to production
2. Run baseline generation workflow
3. New baselines replace old ones
4. Future PRs compare against new design
```

### Adding New Routes
When adding new pages to your app:
```bash
1. Deploy new pages to production
2. Run workflow with updated route list
3. New baselines created for new routes
4. Existing baselines remain unchanged
```

## Advanced Configuration

### Using AI Route Discovery

Enable AI to automatically find all routes:

```yaml
enable-ai-navigation: true
max-routes: 25
# Leave test-routes empty - AI will discover them
```

### Authentication Scenarios

#### Static Credentials
```yaml
auth-email: ${{ secrets.AUTH_EMAIL }}
auth-password: ${{ secrets.AUTH_PASSWORD }}
auth-login-url: '/login'
auth-mode: 'llm'  # AI handles login flow
```

#### Dynamic Input
```yaml
auth-email: ${{ inputs.auth-email }}
auth-password: ${{ inputs.auth-password }}
# User provides credentials when running workflow
```

### Multiple Environments

Create separate workflows for different environments:

```yaml
# generate-baseline-staging.yml
production-url: 'https://staging.example.com'
storage-bucket: 'baselines-staging'

# generate-baseline-production.yml  
production-url: 'https://example.com'
storage-bucket: 'baselines-production'
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "No baselines found" in PR tests
**Solution**: Run the baseline generation workflow first

#### 2. Storage upload fails
**Solution**: Verify storage credentials in repository secrets

#### 3. Routes not captured correctly
**Solution**: Ensure routes are comma-separated and start with `/`

#### 4. Authentication fails
**Solution**: 
- Verify credentials are correct
- Check auth-login-url matches your login page
- Try different auth-mode (llm vs selectors)

#### 5. AI navigation not finding routes
**Solution**:
- Ensure CLAUDE_API_KEY is set
- Increase max-routes limit
- Manually specify critical routes

### Debugging Tips

1. **Check workflow logs**: Each step shows detailed output
2. **Download artifacts**: Inspect generated screenshots locally
3. **Test with single route**: Start with just homepage (`/`)
4. **Verify storage access**: Check Firebase/S3 console for uploaded files

## Best Practices

### 1. Route Selection
- Start with critical user paths
- Include different page types (landing, dashboard, forms)
- Don't exceed 20-30 routes (performance consideration)

### 2. Viewport Coverage
- Always include mobile (375x667 or 390x844)
- Include tablet (768x1024)
- Include desktop (1920x1080 or 1440x900)

### 3. Maintenance Schedule
- Regenerate baselines after major releases
- Review baselines quarterly
- Document when and why baselines were updated

### 4. Storage Management
- Use cloud storage (Firebase/S3) for reliability
- Set retention policies to manage costs
- Backup critical baselines

## Security Considerations

1. **Never commit credentials** - Use GitHub Secrets
2. **Use test accounts** for authentication - Not production accounts
3. **Restrict workflow permissions** - Use least privilege
4. **Rotate API keys** regularly
5. **Review storage bucket permissions** - Should be private

## Verification Checklist

Before running in production, verify:

- [ ] Workflow file is in `.github/workflows/`
- [ ] All required secrets are configured
- [ ] Production URL is accessible
- [ ] Test routes are valid and load correctly
- [ ] Storage provider credentials work
- [ ] Authentication works (if needed)
- [ ] Viewports match your requirements

## Support and Resources

- **Documentation**: [YoFix Docs](https://github.com/LoopKitchen/yofix)
- **Issues**: [GitHub Issues](https://github.com/LoopKitchen/yofix/issues)
- **Examples**: Check the `examples/` directory in YoFix repo

## Summary

The baseline generation workflow provides:
1. **Automated baseline creation** from production
2. **Flexible route configuration** (manual or AI discovery)
3. **Multi-viewport support** for responsive testing
4. **Authentication handling** for protected areas
5. **Multiple storage options** for different needs

Once integrated, you'll have a robust visual regression testing system that automatically detects unintended visual changes in pull requests.