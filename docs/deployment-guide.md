# YoFix Deployment Guide

## Overview

This guide covers deploying YoFix in different environments and configurations.

## Deployment Options

### 1. GitHub Action (Recommended)

The simplest way to use YoFix is as a GitHub Action in your workflow.

#### Basic Setup

```yaml
name: Visual Testing
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  yofix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Deploy your app (example with Firebase)
      - name: Deploy Preview
        id: deploy
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: pr-${{ github.event.pull_request.number }}
      
      # Run YoFix
      - uses: yofix/yofix@v1
        with:
          preview-url: ${{ steps.deploy.outputs.details_url }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
```

#### With Authentication

```yaml
- uses: yofix/yofix@v1
  with:
    preview-url: ${{ steps.deploy.outputs.details_url }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
    firebase-credentials: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
    # Authentication
    auth-email: ${{ secrets.TEST_USER_EMAIL }}
    auth-password: ${{ secrets.TEST_USER_PASSWORD }}
    auth-login-url: /login
```

### 2. GitHub App (Coming Soon)

Install YoFix as a GitHub App for automatic PR analysis without workflow files.

#### Installation

1. Visit [github.com/apps/yofix](https://github.com/apps/yofix)
2. Click "Install"
3. Select repositories
4. Configure settings

#### Configuration

Create `.github/yofix.yml`:

```yaml
# YoFix App Configuration
enabled: true
preview:
  provider: vercel  # or firebase, netlify
  pattern: "https://{project}-{pr}.vercel.app"

authentication:
  required: true
  method: email-password
  loginUrl: /auth/login

storage:
  provider: yofix-cloud  # or firebase, s3
```

### 3. Self-Hosted Deployment

Run YoFix on your own infrastructure for complete control.

#### Docker Deployment

```dockerfile
# docker-compose.yml
version: '3.8'

services:
  yofix:
    image: yofix/yofix-server:latest
    ports:
      - "8080:8080"
    environment:
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
      - GITHUB_APP_ID=${GITHUB_APP_ID}
      - GITHUB_APP_KEY=${GITHUB_APP_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - STORAGE_PROVIDER=s3
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_BUCKET=${AWS_BUCKET}
    volumes:
      - ./config:/app/config
      - yofix-data:/app/data

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=yofix
      - POSTGRES_USER=yofix
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  yofix-data:
  postgres-data:
```

#### Kubernetes Deployment

```yaml
# yofix-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yofix
spec:
  replicas: 3
  selector:
    matchLabels:
      app: yofix
  template:
    metadata:
      labels:
        app: yofix
    spec:
      containers:
      - name: yofix
        image: yofix/yofix-server:latest
        ports:
        - containerPort: 8080
        env:
        - name: CLAUDE_API_KEY
          valueFrom:
            secretKeyRef:
              name: yofix-secrets
              key: claude-api-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: yofix-service
spec:
  selector:
    app: yofix
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

### 4. Serverless Deployment

Deploy YoFix as serverless functions for cost-effective scaling.

#### AWS Lambda

```yaml
# serverless.yml
service: yofix

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  environment:
    CLAUDE_API_KEY: ${env:CLAUDE_API_KEY}
    STORAGE_BUCKET: ${self:custom.bucket}

functions:
  webhook:
    handler: dist/handlers/webhook.handler
    events:
      - http:
          path: /webhook
          method: post
          
  analyzer:
    handler: dist/handlers/analyzer.handler
    timeout: 300
    memorySize: 2048
    
  bot:
    handler: dist/handlers/bot.handler
    timeout: 300

resources:
  Resources:
    ScreenshotBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:custom.bucket}

custom:
  bucket: yofix-screenshots-${self:provider.stage}
```

#### Vercel Functions

```javascript
// api/webhook.js
import { handleWebhook } from 'yofix/handlers';

export default async function handler(req, res) {
  const result = await handleWebhook(req.body);
  res.status(200).json(result);
}
```

## Storage Configuration

### Firebase Storage

```javascript
// config/storage.js
export default {
  provider: 'firebase',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT
  }
};
```

### AWS S3

```javascript
// config/storage.js
export default {
  provider: 's3',
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};
```

### Local Storage (Development)

```javascript
// config/storage.js
export default {
  provider: 'local',
  local: {
    path: './storage/screenshots'
  }
};
```

## Environment Variables

### Required Variables

```bash
# AI Provider
CLAUDE_API_KEY=sk-ant-xxx

# GitHub Integration
GITHUB_TOKEN=ghp_xxx
GITHUB_APP_ID=123456
GITHUB_APP_KEY=xxx

# Storage (choose one)
FIREBASE_SERVICE_ACCOUNT=xxx
# or
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET=yofix-screenshots
```

### Optional Variables

```bash
# Authentication
AUTH_REQUIRED=true
AUTH_EMAIL=test@example.com
AUTH_PASSWORD=xxx
AUTH_LOGIN_URL=/login

# Performance
MAX_CONCURRENT_TESTS=3
SCREENSHOT_QUALITY=85
CACHE_TTL=3600

# Debugging
DEBUG=yofix:*
LOG_LEVEL=info
```

## Monitoring & Observability

### Logging

```yaml
# config/logging.yml
logging:
  level: info
  format: json
  outputs:
    - stdout
    - file: /var/log/yofix/app.log
  
  # External logging
  external:
    provider: datadog  # or splunk, elasticsearch
    apiKey: ${DATADOG_API_KEY}
```

### Metrics

```yaml
# config/metrics.yml
metrics:
  enabled: true
  provider: prometheus
  endpoint: /metrics
  
  custom:
    - name: visual_tests_total
      type: counter
      description: Total visual tests run
      
    - name: fix_generation_duration
      type: histogram
      description: Time to generate fixes
      
    - name: ai_api_costs
      type: gauge
      description: AI API costs per PR
```

### Health Checks

```yaml
# config/health.yml
health:
  endpoint: /health
  checks:
    - name: database
      type: postgres
      critical: true
      
    - name: storage
      type: s3
      critical: true
      
    - name: ai_provider
      type: http
      url: https://api.anthropic.com/v1/health
      critical: false
```

## Security Best Practices

### 1. API Key Management

- Never commit API keys
- Use secret management services
- Rotate keys regularly
- Limit key permissions

### 2. Network Security

```yaml
# Kubernetes Network Policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: yofix-network-policy
spec:
  podSelector:
    matchLabels:
      app: yofix
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx
    ports:
    - protocol: TCP
      port: 8080
```

### 3. Rate Limiting

```javascript
// config/rateLimit.js
export default {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skipSuccessfulRequests: true,
  
  // Custom limits per endpoint
  endpoints: {
    '/api/analyze': {
      windowMs: 60 * 1000,
      max: 10
    },
    '/webhook': {
      windowMs: 60 * 1000,
      max: 50
    }
  }
};
```

## Scaling Considerations

### Horizontal Scaling

```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: yofix-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: yofix
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Caching Strategy

```javascript
// config/cache.js
export default {
  redis: {
    host: process.env.REDIS_HOST,
    port: 6379,
    ttl: 3600
  },
  
  strategies: {
    screenshots: {
      ttl: 86400,  // 24 hours
      compress: true
    },
    analysis: {
      ttl: 3600,   // 1 hour
      keyPattern: 'analysis:{prNumber}:{route}:{viewport}'
    },
    codebase: {
      ttl: 604800, // 1 week
      keyPattern: 'codebase:{repo}:{branch}'
    }
  }
};
```

## Troubleshooting

### Common Issues

1. **Preview URL not found**
   - Ensure deployment completes before YoFix runs
   - Check URL pattern matches your provider
   - Verify GitHub token has correct permissions

2. **Authentication failures**
   - Test credentials manually first
   - Check login URL is correct
   - Ensure cookies/sessions are handled

3. **Storage errors**
   - Verify service account/credentials
   - Check bucket permissions
   - Ensure bucket exists

4. **AI API errors**
   - Check API key validity
   - Monitor rate limits
   - Verify network connectivity

### Debug Mode

Enable detailed logging:

```yaml
- uses: yofix/yofix@v1
  with:
    debug: true
    log-level: verbose
```

Or in self-hosted:

```bash
DEBUG=yofix:* LOG_LEVEL=debug npm start
```