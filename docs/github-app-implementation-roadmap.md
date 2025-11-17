# YoFix GitHub App: Implementation Roadmap & Task Tracker

**Project:** Convert YoFix to GitHub App on DigitalOcean
**Start Date:** 2025-01-13
**Target Launch:** 2025-04-13 (12 weeks)
**Status:** 🟡 Planning Phase

---

## 📊 Project Overview

### Objectives
1. ✅ Build enterprise-grade GitHub App for zero-config visual testing
2. ✅ Deploy on DigitalOcean (77% cost savings vs AWS)
3. ✅ Handle 10,000 tests/day initially (scale to 100K)
4. ✅ Maintain 99.9% uptime
5. ✅ No customer workflow files required

### Success Metrics
- [ ] 50+ beta installations
- [ ] 95%+ test success rate
- [ ] <2 minute average test time
- [ ] 99.9% uptime during beta
- [ ] $5,845/month infrastructure cost (vs $25,540 AWS)

---

## 🗓️ Milestone Overview

| Milestone | Duration | Status | Start Date | End Date | Progress |
|-----------|----------|--------|------------|----------|----------|
| [M1: Foundation Setup](#milestone-1-foundation-setup) | 2 weeks | 🔵 Not Started | 2025-01-13 | 2025-01-26 | 0% |
| [M2: Core Services](#milestone-2-core-services) | 3 weeks | 🔵 Not Started | 2025-01-27 | 2025-02-16 | 0% |
| [M3: GitHub App Integration](#milestone-3-github-app-integration) | 2 weeks | 🔵 Not Started | 2025-02-17 | 2025-03-02 | 0% |
| [M4: Testing & Hardening](#milestone-4-testing--hardening) | 2 weeks | 🔵 Not Started | 2025-03-03 | 2025-03-16 | 0% |
| [M5: Beta Launch](#milestone-5-beta-launch) | 2 weeks | 🔵 Not Started | 2025-03-17 | 2025-03-30 | 0% |
| [M6: Production Ready](#milestone-6-production-ready) | 1 week | 🔵 Not Started | 2025-03-31 | 2025-04-06 | 0% |
| [M7: General Availability](#milestone-7-general-availability) | 1 week | 🔵 Not Started | 2025-04-07 | 2025-04-13 | 0% |

**Total Duration:** 12 weeks (3 months)

---

## Milestone 1: Foundation Setup

**Duration:** 2 weeks (Jan 13 - Jan 26)
**Goal:** Set up DigitalOcean infrastructure foundation
**Status:** 🔵 Not Started
**Progress:** 0/15 tasks complete

### Week 1: Account & Infrastructure Setup

#### Task 1.1: DigitalOcean Account Setup
- [ ] Create DigitalOcean account
- [ ] Add payment method
- [ ] Enable 2FA
- [ ] Create team and invite members
- [ ] Set up billing alerts ($1000/month threshold)

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 2 hours
**Actual Time:** _TBD_

---

#### Task 1.2: Create Development Environment
- [ ] Create project "yofix-dev"
- [ ] Deploy DOKS cluster (3 nodes, s-4vcpu-8gb)
- [ ] Deploy managed PostgreSQL (db-s-2vcpu-4gb)
- [ ] Deploy managed Redis (redis-s-2vcpu-4gb)
- [ ] Create Spaces bucket "yofix-dev-screenshots"
- [ ] Create Load Balancer

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 4 hours
**Actual Time:** _TBD_
**Dependencies:** Task 1.1

**Acceptance Criteria:**
- [ ] Kubernetes cluster accessible via kubectl
- [ ] Database accessible and can create tables
- [ ] Redis accessible and can set/get keys
- [ ] Spaces bucket accessible with API key
- [ ] Load balancer has public IP

**Commands:**
```bash
# Install doctl (DigitalOcean CLI)
brew install doctl

# Authenticate
doctl auth init

# Create Kubernetes cluster
doctl kubernetes cluster create yofix-dev \
  --region nyc3 \
  --version 1.28.2-do.0 \
  --node-pool "name=worker-pool;size=s-4vcpu-8gb;count=3;auto-scale=true;min-nodes=3;max-nodes=10"

# Get kubeconfig
doctl kubernetes cluster kubeconfig save yofix-dev

# Verify
kubectl get nodes
```

---

#### Task 1.3: Set Up Terraform Infrastructure as Code
- [ ] Create Terraform repo (yofix-infrastructure)
- [ ] Install Terraform locally
- [ ] Configure DigitalOcean provider
- [ ] Define Kubernetes cluster in Terraform
- [ ] Define databases in Terraform
- [ ] Define Spaces in Terraform
- [ ] Test terraform plan/apply
- [ ] Commit to Git

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 6 hours
**Actual Time:** _TBD_
**Dependencies:** Task 1.2

**File Structure:**
```
yofix-infrastructure/
├── terraform/
│   ├── main.tf              # Main configuration
│   ├── variables.tf         # Input variables
│   ├── outputs.tf           # Outputs
│   ├── versions.tf          # Provider versions
│   ├── environments/
│   │   ├── dev/
│   │   │   └── terraform.tfvars
│   │   ├── staging/
│   │   │   └── terraform.tfvars
│   │   └── production/
│   │       └── terraform.tfvars
│   ├── modules/
│   │   ├── kubernetes/
│   │   ├── database/
│   │   ├── redis/
│   │   └── spaces/
└── README.md
```

**Example Terraform:**
```hcl
# terraform/main.tf
terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

# Kubernetes Cluster
resource "digitalocean_kubernetes_cluster" "yofix" {
  name    = "yofix-${var.environment}"
  region  = var.region
  version = "1.28.2-do.0"

  node_pool {
    name       = "worker-pool"
    size       = var.node_size
    auto_scale = true
    min_nodes  = var.min_nodes
    max_nodes  = var.max_nodes
  }
}

# PostgreSQL Database
resource "digitalocean_database_cluster" "postgres" {
  name       = "yofix-db-${var.environment}"
  engine     = "pg"
  version    = "15"
  size       = var.db_size
  region     = var.region
  node_count = var.db_node_count
}

# Redis Cache
resource "digitalocean_database_cluster" "redis" {
  name       = "yofix-redis-${var.environment}"
  engine     = "redis"
  version    = "7"
  size       = var.redis_size
  region     = var.region
  node_count = 1
}

# Spaces Bucket
resource "digitalocean_spaces_bucket" "screenshots" {
  name   = "yofix-${var.environment}-screenshots"
  region = var.region

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}
```

---

### Week 2: Monitoring & Security Setup

#### Task 1.4: Set Up Monitoring Stack
- [ ] Install Prometheus on Kubernetes
- [ ] Install Grafana on Kubernetes
- [ ] Configure Prometheus to scrape metrics
- [ ] Import Grafana dashboards
- [ ] Set up Better Stack account
- [ ] Configure log forwarding to Better Stack
- [ ] Create basic alerts (CPU, memory, disk)
- [ ] Test alert delivery (Slack/email)

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 8 hours
**Actual Time:** _TBD_
**Dependencies:** Task 1.2

**Kubernetes Manifests:**
```yaml
# monitoring/prometheus.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s

    scrape_configs:
      - job_name: 'kubernetes-pods'
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true
```

---

#### Task 1.5: Configure Security (Firewall & Secrets)
- [ ] Create firewall rules (ingress/egress)
- [ ] Apply firewall to Kubernetes nodes
- [ ] Apply firewall to databases
- [ ] Set up Cloudflare account
- [ ] Point domain to Cloudflare
- [ ] Configure Cloudflare proxy
- [ ] Enable Cloudflare WAF rules
- [ ] Install cert-manager on Kubernetes
- [ ] Configure Let's Encrypt certificates
- [ ] Install Sealed Secrets controller
- [ ] Test secret encryption/decryption

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 6 hours
**Actual Time:** _TBD_
**Dependencies:** Task 1.2

**Firewall Rules:**
```bash
# Create firewall
doctl compute firewall create \
  --name yofix-dev \
  --inbound-rules "protocol:tcp,ports:22,sources:0.0.0.0/0 protocol:tcp,ports:443,sources:0.0.0.0/0 protocol:tcp,ports:80,sources:0.0.0.0/0" \
  --outbound-rules "protocol:tcp,ports:all,destinations:0.0.0.0/0 protocol:udp,ports:all,destinations:0.0.0.0/0"

# Apply to droplets
doctl compute firewall add-droplets <firewall-id> --droplet-ids <droplet-ids>
```

---

#### Task 1.6: Create CI/CD Pipeline
- [ ] Set up GitHub repository (yofix-app)
- [ ] Configure GitHub Actions workflow
- [ ] Add DigitalOcean credentials to GitHub Secrets
- [ ] Create Docker build action
- [ ] Create deployment action
- [ ] Test pipeline with dummy app
- [ ] Set up branch protection rules
- [ ] Configure automatic deployments (main → dev)

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 6 hours
**Actual Time:** _TBD_
**Dependencies:** Task 1.2

**GitHub Actions Workflow:**
```yaml
# .github/workflows/deploy.yml
name: Deploy to DigitalOcean

on:
  push:
    branches: [main, develop]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: |
          docker build -t registry.digitalocean.com/yofix/app:${{ github.sha }} .

      - name: Push to DigitalOcean Container Registry
        run: |
          echo ${{ secrets.DIGITALOCEAN_TOKEN }} | docker login registry.digitalocean.com -u ${{ secrets.DIGITALOCEAN_TOKEN }} --password-stdin
          docker push registry.digitalocean.com/yofix/app:${{ github.sha }}

      - name: Deploy to Kubernetes
        uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DIGITALOCEAN_TOKEN }}
        run: |
          doctl kubernetes cluster kubeconfig save yofix-dev
          kubectl set image deployment/yofix-app app=registry.digitalocean.com/yofix/app:${{ github.sha }}
```

---

### Milestone 1: Acceptance Criteria
- [ ] DigitalOcean infrastructure fully deployed via Terraform
- [ ] Development Kubernetes cluster operational
- [ ] Monitoring stack (Prometheus + Grafana) operational
- [ ] CI/CD pipeline builds and deploys dummy app
- [ ] All services accessible and secured with SSL
- [ ] Team can access and manage infrastructure

---

## Milestone 2: Core Services

**Duration:** 3 weeks (Jan 27 - Feb 16)
**Goal:** Build webhook server, job queue, and worker infrastructure
**Status:** 🔵 Not Started
**Progress:** 0/20 tasks complete

### Week 3: Repository & Base Application

#### Task 2.1: Create Application Repository Structure
- [ ] Create GitHub repository (yofix-app)
- [ ] Initialize Node.js project (package.json)
- [ ] Set up TypeScript configuration
- [ ] Configure ESLint and Prettier
- [ ] Set up Jest for testing
- [ ] Create Docker multi-stage build
- [ ] Create basic README
- [ ] Set up pre-commit hooks (Husky)

**Assignee:** Senior Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 4 hours
**Actual Time:** _TBD_

**Directory Structure:**
```
yofix-app/
├── src/
│   ├── server/
│   │   ├── app.ts                 # Express/Probot app
│   │   ├── webhooks/              # Webhook handlers
│   │   ├── services/              # Business logic
│   │   ├── queue/                 # Job queue
│   │   └── workers/               # Worker logic
│   ├── shared/
│   │   ├── types/                 # TypeScript types
│   │   ├── utils/                 # Utilities
│   │   └── constants/             # Constants
│   └── index.ts                   # Entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── Dockerfile
├── docker-compose.yml             # Local development
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

---

#### Task 2.2: Implement Webhook Server (Probot)
- [ ] Install Probot framework
- [ ] Create basic Probot app
- [ ] Implement webhook signature verification
- [ ] Add health check endpoint (/health)
- [ ] Add readiness endpoint (/ready)
- [ ] Add request ID middleware
- [ ] Add structured logging
- [ ] Test with Smee.io locally

**Assignee:** Senior Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 8 hours
**Actual Time:** _TBD_
**Dependencies:** Task 2.1

**Code:**
```typescript
// src/server/app.ts
import { Probot } from 'probot';
import { issueCommentHandler } from './webhooks/issue-comment.handler';
import { pullRequestHandler } from './webhooks/pull-request.handler';

export default (app: Probot) => {
  app.log.info('YoFix GitHub App is loading...');

  // Health check
  app.route('/health').get((req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Readiness check
  app.route('/ready').get((req, res) => {
    // Check database, Redis, etc.
    res.json({ status: 'ready' });
  });

  // Webhook handlers
  app.on('issue_comment.created', issueCommentHandler);
  app.on(['pull_request.opened', 'pull_request.synchronize'], pullRequestHandler);

  app.log.info('YoFix GitHub App loaded successfully');
};
```

---

### Week 4: Job Queue & Worker Infrastructure

#### Task 2.3: Implement BullMQ Job Queue
- [ ] Install BullMQ and ioredis
- [ ] Create queue configuration
- [ ] Implement job producer (enqueue)
- [ ] Implement job consumer (worker)
- [ ] Add job retry logic
- [ ] Add dead letter queue
- [ ] Implement priority queues (high, standard, low)
- [ ] Add job progress tracking
- [ ] Test job flow end-to-end

**Assignee:** Senior Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 10 hours
**Actual Time:** _TBD_
**Dependencies:** Task 2.2

**Code:**
```typescript
// src/server/queue/test-queue.ts
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
});

// Queue for enqueuing jobs
export const testQueue = new Queue('yofix-tests', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: false
  }
});

// Worker for processing jobs
export const createWorker = () => {
  return new Worker(
    'yofix-tests',
    async (job: Job) => {
      console.log(`Processing job ${job.id}:`, job.data);

      // Execute visual test
      const result = await executeVisualTest(job.data);

      return result;
    },
    {
      connection,
      concurrency: 5  // Process 5 jobs concurrently per worker
    }
  );
};

// Add job to queue
export async function enqueueTest(data: any, priority?: number) {
  return await testQueue.add('visual-test', data, {
    priority: priority || 3  // Default priority
  });
}
```

---

#### Task 2.4: Build Worker Docker Image
- [ ] Create Dockerfile for worker
- [ ] Install system dependencies (Chromium, etc.)
- [ ] Pre-install Playwright browsers
- [ ] Pre-install Sharp and dependencies
- [ ] Pre-install all npm dependencies
- [ ] Optimize image size (<1GB)
- [ ] Test image builds successfully
- [ ] Test worker starts and processes jobs
- [ ] Push to DigitalOcean Container Registry

**Assignee:** DevOps Lead + Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 8 hours
**Actual Time:** _TBD_
**Dependencies:** Task 2.3

**Dockerfile:**
```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ vips-dev

# Build application
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    vips \
    dumb-init

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy built application
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/app.js"]
```

---

### Week 5: Pipeline Integration

#### Task 2.5: Integrate Existing YoFix Packages
- [ ] Install @yofix/analyzer
- [ ] Install @yofix/browser
- [ ] Install @yofix/comparator
- [ ] Install @yofix/storage
- [ ] Adapt analyzer for async execution
- [ ] Adapt browser for job context
- [ ] Adapt comparator for job context
- [ ] Adapt storage for job context
- [ ] Create pipeline orchestrator
- [ ] Test full pipeline end-to-end

**Assignee:** Senior Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 12 hours
**Actual Time:** _TBD_
**Dependencies:** Task 2.4

**Code:**
```typescript
// src/server/services/pipeline-orchestrator.ts
import { analyzeRouteImpact } from '@yofix/analyzer';
import { captureScreenshotsWithBrowser } from '@yofix/browser';
import { compareBaselines } from '@yofix/comparator';
import { uploadFiles } from '@yofix/storage';

export async function executePipeline(job: any) {
  const { prNumber, installationId, repoPath, changedFiles } = job;

  // Step 1: Analyze routes
  const routeAnalysis = await analyzeRouteImpact({
    repoPath,
    changedFiles,
    options: {
      claudeApiKey: process.env.CLAUDE_API_KEY,
      claudeModel: process.env.CLAUDE_MODEL
    }
  });

  // Step 2: Capture screenshots
  const screenshots = await captureScreenshotsWithBrowser({
    routes: routeAnalysis.impactedRoutes,
    baseUrl: job.previewUrl,
    viewports: job.viewports,
    credentials: job.credentials,
    loginUrl: job.loginUrl
  });

  // Step 3: Compare with baselines
  const comparisons = await compareBaselines({
    screenshots,
    baselineSource: 'storage',
    storageConfig: job.storageConfig
  });

  // Step 4: Upload results
  const uploads = await uploadFiles({
    files: [...screenshots, ...comparisons.diffs],
    storage: job.storageConfig
  });

  return {
    routeAnalysis,
    screenshots,
    comparisons,
    uploads
  };
}
```

---

### Milestone 2: Acceptance Criteria
- [ ] Webhook server receives and validates GitHub webhooks
- [ ] Jobs are enqueued to BullMQ successfully
- [ ] Workers pick up jobs and execute tests
- [ ] Full pipeline (analyze → screenshot → compare → upload) works
- [ ] Docker image <1GB and starts in <5 seconds
- [ ] Can handle 10 concurrent jobs

---

## Milestone 3: GitHub App Integration

**Duration:** 2 weeks (Feb 17 - Mar 2)
**Goal:** Register GitHub App, integrate webhooks, implement commands
**Status:** 🔵 Not Started
**Progress:** 0/12 tasks complete

### Week 6: GitHub App Registration

#### Task 3.1: Register GitHub App
- [ ] Go to github.com/settings/apps/new
- [ ] Fill out app details (name, description, URL)
- [ ] Set webhook URL (Cloudflare → DigitalOcean)
- [ ] Generate webhook secret
- [ ] Download private key (.pem file)
- [ ] Configure permissions (contents: read, pull_requests: write, issues: write)
- [ ] Subscribe to events (issue_comment, pull_request)
- [ ] Create app icon/logo
- [ ] Test webhook delivery with Smee.io

**Assignee:** Tech Lead
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 3 hours
**Actual Time:** _TBD_

**Permissions Required:**
```
Repository permissions:
  - Contents: Read (read code)
  - Pull requests: Write (post comments)
  - Issues: Write (react to comments)
  - Metadata: Read (required)

Organization permissions:
  - Members: Read (optional, for team mentions)

Events:
  - issue_comment
  - pull_request (opened, synchronize, reopened)
```

---

#### Task 3.2: Implement Installation Management
- [ ] Create installations table in database
- [ ] Implement installation webhook handler
- [ ] Store installation data on install
- [ ] Remove installation data on uninstall
- [ ] Create API to list installations
- [ ] Implement installation authentication
- [ ] Test install/uninstall flow

**Assignee:** Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 6 hours
**Actual Time:** _TBD_
**Dependencies:** Task 3.1

**Code:**
```typescript
// src/server/webhooks/installation.handler.ts
export async function handleInstallation(context: any) {
  const { action, installation, repositories } = context.payload;

  if (action === 'created') {
    // Store installation
    await db.installations.create({
      installationId: installation.id,
      accountId: installation.account.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      repositories: repositories?.map(r => r.id) || [],
      createdAt: new Date()
    });

    context.log.info(`Installation ${installation.id} created`);
  }

  if (action === 'deleted') {
    // Remove installation
    await db.installations.delete({
      installationId: installation.id
    });

    context.log.info(`Installation ${installation.id} deleted`);
  }
}
```

---

### Week 7: Command Implementation

#### Task 3.3: Implement @yofix test Command
- [ ] Reuse existing CommandRegistry from yofix
- [ ] Reuse existing TestCommand
- [ ] Adapt for server context (no GitHub Actions)
- [ ] Parse @yofix test from comments
- [ ] Extract URL and viewports
- [ ] Enqueue test job
- [ ] React with 👀 to acknowledge
- [ ] Post results as comment reply
- [ ] React with ✅ when complete
- [ ] Test end-to-end on test repo

**Assignee:** Senior Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 8 hours
**Actual Time:** _TBD_
**Dependencies:** Task 3.2

**Code:**
```typescript
// src/server/webhooks/issue-comment.handler.ts
import { getCommandRegistry } from '../commands/CommandRegistry';

export async function issueCommentHandler(context: any) {
  const comment = context.payload.comment.body;

  // Check for @yofix command
  const registry = getCommandRegistry();
  const parsed = registry.parseComment(comment);

  if (!parsed) {
    return;  // Not a @yofix command
  }

  // React with eyes
  await context.octokit.reactions.createForIssueComment({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    comment_id: context.payload.comment.id,
    content: 'eyes'
  });

  // Enqueue job
  const job = await enqueueTest({
    command: parsed.command.name,
    args: parsed.parsed.args,
    prNumber: context.payload.issue.number,
    installationId: context.payload.installation.id,
    commentId: context.payload.comment.id,
    repoOwner: context.payload.repository.owner.login,
    repoName: context.payload.repository.name
  }, 1);  // High priority

  context.log.info(`Job ${job.id} enqueued for @yofix ${parsed.command.name}`);
}
```

---

#### Task 3.4: Implement Automatic PR Testing
- [ ] Listen to pull_request events (opened, synchronize)
- [ ] Extract changed files from PR
- [ ] Check if installation has PR testing enabled
- [ ] Enqueue test job (standard priority)
- [ ] Post initial comment with "Testing in progress..."
- [ ] Update comment with results when complete
- [ ] Handle errors gracefully
- [ ] Test on sample PR

**Assignee:** Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 8 hours
**Actual Time:** _TBD_
**Dependencies:** Task 3.3

---

### Milestone 3: Acceptance Criteria
- [ ] GitHub App successfully receives webhooks
- [ ] @yofix test command works end-to-end
- [ ] Automatic PR testing works
- [ ] Results posted as comments with screenshots
- [ ] Emoji reactions work (👀, ✅)
- [ ] 10+ test PRs successfully tested

---

## Milestone 4: Testing & Hardening

**Duration:** 2 weeks (Mar 3 - Mar 16)
**Goal:** Comprehensive testing, performance optimization, error handling
**Status:** 🔵 Not Started
**Progress:** 0/15 tasks complete

### Week 8: Testing

#### Task 4.1: Write Unit Tests
- [ ] Test CommandRegistry
- [ ] Test webhook handlers
- [ ] Test job queue enqueue/dequeue
- [ ] Test pipeline orchestrator
- [ ] Test installation management
- [ ] Achieve 80% code coverage
- [ ] Set up coverage reports in CI

**Assignee:** QA Engineer + Backend Engineers
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 16 hours
**Actual Time:** _TBD_

---

#### Task 4.2: Write Integration Tests
- [ ] Test webhook → queue → worker flow
- [ ] Test full pipeline execution
- [ ] Test database operations
- [ ] Test Redis operations
- [ ] Test Spaces uploads
- [ ] Test GitHub API calls (mocked)
- [ ] Run integration tests in CI

**Assignee:** QA Engineer
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 12 hours
**Actual Time:** _TBD_

---

#### Task 4.3: Load Testing
- [ ] Set up k6 or Artillery
- [ ] Write load test scripts
- [ ] Test 100 concurrent webhooks
- [ ] Test 100 concurrent jobs
- [ ] Measure response times (p50, p95, p99)
- [ ] Identify bottlenecks
- [ ] Optimize performance
- [ ] Verify can handle 10K tests/day

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 10 hours
**Actual Time:** _TBD_

---

### Week 9: Hardening

#### Task 4.4: Error Handling & Resilience
- [ ] Add try-catch to all async functions
- [ ] Implement circuit breaker (opossum)
- [ ] Add timeout handling
- [ ] Implement graceful shutdown
- [ ] Add retry logic for GitHub API calls
- [ ] Handle browser crashes gracefully
- [ ] Test failure scenarios
- [ ] Document error codes

**Assignee:** Senior Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 10 hours
**Actual Time:** _TBD_

---

#### Task 4.5: Performance Optimization
- [ ] Profile application (clinic.js)
- [ ] Optimize database queries
- [ ] Add database indexes
- [ ] Implement caching (route analysis)
- [ ] Optimize image processing
- [ ] Reduce memory usage
- [ ] Benchmark before/after
- [ ] Document optimizations

**Assignee:** Senior Backend Engineer
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 12 hours
**Actual Time:** _TBD_

---

### Milestone 4: Acceptance Criteria
- [ ] 80% unit test coverage
- [ ] All integration tests passing
- [ ] Can handle 100 concurrent requests
- [ ] p95 response time <2 seconds
- [ ] Error rate <1%
- [ ] No memory leaks detected
- [ ] Graceful degradation under load

---

## Milestone 5: Beta Launch

**Duration:** 2 weeks (Mar 17 - Mar 30)
**Goal:** Launch private beta with 20-50 users
**Status:** 🔵 Not Started
**Progress:** 0/10 tasks complete

### Week 10: Beta Preparation

#### Task 5.1: Create Beta Onboarding Documentation
- [ ] Write installation guide
- [ ] Write usage guide (commands)
- [ ] Create troubleshooting guide
- [ ] Record demo video
- [ ] Create FAQ
- [ ] Set up support Slack channel
- [ ] Prepare feedback form

**Assignee:** Product Manager
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 8 hours
**Actual Time:** _TBD_

---

#### Task 5.2: Identify Beta Users
- [ ] Create list of 50 potential beta users
- [ ] Reach out to friendly customers
- [ ] Reach out to personal network
- [ ] Post on Twitter/LinkedIn
- [ ] Target 20-30 acceptances
- [ ] Create beta user spreadsheet
- [ ] Schedule kickoff calls

**Assignee:** CEO/Founder + Product Manager
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 10 hours
**Actual Time:** _TBD_

---

### Week 11: Beta Deployment & Support

#### Task 5.3: Deploy to Production
- [ ] Create production environment on DigitalOcean
- [ ] Deploy production Kubernetes cluster (10 nodes)
- [ ] Deploy production databases
- [ ] Point domain to production
- [ ] Configure SSL certificates
- [ ] Run smoke tests
- [ ] Enable monitoring and alerts
- [ ] Set up on-call rotation

**Assignee:** DevOps Lead
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 6 hours
**Actual Time:** _TBD_

---

#### Task 5.4: Beta User Onboarding
- [ ] Send onboarding emails to beta users
- [ ] Hold onboarding calls (10 users)
- [ ] Help users install GitHub App
- [ ] Help users run first test
- [ ] Monitor usage and errors
- [ ] Weekly check-in emails
- [ ] Collect feedback continuously

**Assignee:** Product Manager + Customer Success
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 20 hours (spread over 2 weeks)
**Actual Time:** _TBD_

---

### Milestone 5: Acceptance Criteria
- [ ] 20+ beta installations
- [ ] 100+ tests executed successfully
- [ ] 95%+ success rate
- [ ] <5 P1 incidents during beta
- [ ] NPS score from beta users >40
- [ ] Documented learnings and improvements

---

## Milestone 6: Production Ready

**Duration:** 1 week (Mar 31 - Apr 6)
**Goal:** Address beta feedback, final hardening
**Status:** 🔵 Not Started
**Progress:** 0/8 tasks complete

#### Task 6.1: Fix Beta Issues
- [ ] Triage all beta bug reports
- [ ] Fix P0/P1 bugs
- [ ] Fix P2 bugs (time permitting)
- [ ] Deploy fixes to production
- [ ] Verify fixes with beta users

**Assignee:** All Engineers
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 40 hours
**Actual Time:** _TBD_

---

#### Task 6.2: Performance Tuning
- [ ] Analyze production metrics
- [ ] Identify slow queries
- [ ] Optimize slow endpoints
- [ ] Tune Kubernetes resource limits
- [ ] Tune database connection pool
- [ ] Verify p95 <2s consistently

**Assignee:** Senior Backend Engineer + DevOps
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 12 hours
**Actual Time:** _TBD_

---

#### Task 6.3: Security Audit
- [ ] Run security scan (Snyk)
- [ ] Fix all critical vulnerabilities
- [ ] Fix all high vulnerabilities
- [ ] Review firewall rules
- [ ] Review IAM permissions
- [ ] Test DDoS protection
- [ ] Document security posture

**Assignee:** Security Lead
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 8 hours
**Actual Time:** _TBD_

---

### Milestone 6: Acceptance Criteria
- [ ] All P0/P1 bugs fixed
- [ ] 99.9% uptime over last 2 weeks
- [ ] p95 response time <2s
- [ ] No critical security vulnerabilities
- [ ] Beta users happy (NPS >50)

---

## Milestone 7: General Availability

**Duration:** 1 week (Apr 7 - Apr 13)
**Goal:** Public launch, marketing, support readiness
**Status:** 🔵 Not Started
**Progress:** 0/6 tasks complete

#### Task 7.1: Prepare Marketing Materials
- [ ] Write launch blog post
- [ ] Create product demo video
- [ ] Update website with GitHub App info
- [ ] Prepare social media posts
- [ ] Prepare Product Hunt launch
- [ ] Prepare HackerNews Show HN post

**Assignee:** Product Manager + Marketing
**Status:** 🔵 Not Started
**Priority:** P1 (High)
**Estimated Time:** 16 hours
**Actual Time:** _TBD_

---

#### Task 7.2: Public Launch
- [ ] Publish blog post
- [ ] Post on Twitter/LinkedIn
- [ ] Launch on Product Hunt
- [ ] Post on HackerNews
- [ ] Email existing customers
- [ ] Monitor social media engagement
- [ ] Respond to questions/comments

**Assignee:** CEO + Product Manager
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 8 hours (launch day)
**Actual Time:** _TBD_

---

#### Task 7.3: Support Readiness
- [ ] Set up support email (support@yofix.dev)
- [ ] Create support ticket system
- [ ] Write support runbooks
- [ ] Train support team
- [ ] Set up on-call rotation
- [ ] Monitor for issues

**Assignee:** Customer Success Lead
**Status:** 🔵 Not Started
**Priority:** P0 (Blocker)
**Estimated Time:** 12 hours
**Actual Time:** _TBD_

---

### Milestone 7: Acceptance Criteria
- [ ] Public launch completed
- [ ] 100+ new installations in first week
- [ ] <10 P1 incidents
- [ ] Support response time <4 hours
- [ ] Positive community reception

---

## 📊 Progress Tracking

### Overall Progress
- **Total Tasks:** 86
- **Completed:** 0
- **In Progress:** 0
- **Not Started:** 86
- **Completion:** 0%

### By Milestone
| Milestone | Tasks | Complete | Progress |
|-----------|-------|----------|----------|
| M1: Foundation | 15 | 0 | 0% |
| M2: Core Services | 20 | 0 | 0% |
| M3: GitHub App | 12 | 0 | 0% |
| M4: Testing | 15 | 0 | 0% |
| M5: Beta | 10 | 0 | 0% |
| M6: Production | 8 | 0 | 0% |
| M7: Launch | 6 | 0 | 0% |

### By Priority
- **P0 (Blocker):** 25 tasks
- **P1 (High):** 30 tasks
- **P2 (Medium):** 31 tasks

---

## 🚨 Risks & Issues

### Active Risks
_None yet - track as project progresses_

### Active Issues
_None yet - track as project progresses_

---

## 📝 Change Log

| Date | Milestone | Change | Author |
|------|-----------|--------|--------|
| 2025-01-12 | All | Initial roadmap created | Claude |

---

## 👥 Team & Roles

| Role | Name | Responsibilities |
|------|------|-----------------|
| **Tech Lead** | TBD | Architecture, technical decisions |
| **Senior Backend Engineer** | TBD | Core services, pipeline integration |
| **Backend Engineer** | TBD | Commands, webhooks, APIs |
| **DevOps Lead** | TBD | Infrastructure, CI/CD, monitoring |
| **QA Engineer** | TBD | Testing, quality assurance |
| **Product Manager** | TBD | Requirements, beta program, launch |
| **Security Lead** | TBD | Security audit, compliance |
| **Customer Success** | TBD | Beta support, onboarding |

---

## 📚 Resources

### Documentation
- [DigitalOcean Kubernetes Docs](https://docs.digitalocean.com/products/kubernetes/)
- [Probot Framework](https://probot.github.io/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [GitHub Apps Documentation](https://docs.github.com/en/apps)

### Tools
- **Project Management:** GitHub Projects
- **Communication:** Slack (#yofix-app-dev)
- **Monitoring:** Better Stack + Grafana
- **Error Tracking:** Sentry

### Repositories
- **Main App:** github.com/yofix/yofix-app
- **Infrastructure:** github.com/yofix/yofix-infrastructure
- **Documentation:** github.com/yofix/yofix/docs

---

**Last Updated:** 2025-01-12
**Document Owner:** Tech Lead
**Review Frequency:** Weekly (every Monday)
