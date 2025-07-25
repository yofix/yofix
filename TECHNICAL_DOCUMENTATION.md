# Runtime PR Verification - Technical Documentation

## 🚀 Deployment Guide

### Prerequisites

1. **GitHub Repository**: Your repository must use GitHub Actions
2. **Firebase Project**: Active Firebase project with Hosting enabled
3. **Firebase Service Account**: Service account with appropriate permissions
4. **Firebase Storage Bucket**: For storing screenshots and videos

### Step 1: Create Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → Project Settings → Service Accounts
3. Click "Generate new private key"
4. Download the JSON file (keep this secure!)

**Required permissions for the service account:**
- `firebasehosting.sites.get`
- `firebasehosting.versions.list`
- `storage.buckets.get`
- `storage.objects.create`
- `storage.objects.delete`
- `storage.objects.get`
- `storage.objects.list`

### Step 2: Encode Service Account for GitHub

```bash
# Convert service account JSON to base64
base64 -i path/to/service-account.json | tr -d '\n' > firebase-sa-base64.txt

# On macOS:
base64 -i path/to/service-account.json | pbcopy
# The base64 string is now in your clipboard
```

### Step 3: Configure GitHub Secrets

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add these **Repository Secrets**:

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `FIREBASE_SA_BASE64` | Base64 encoded service account JSON | From Step 2 above |
| `FIREBASE_TOKEN` | Firebase CLI token (optional) | Run `firebase login:ci` |
| `GEMINI_API_KEY` | Google AI API key for Gemini | [Get from Google AI Studio](https://aistudio.google.com/app/apikey) |

### Step 4: Configure GitHub Variables

1. Still in Settings → Secrets and variables → Actions
2. Switch to the **Variables** tab
3. Add these **Repository Variables**:

| Variable Name | Description | Example |
|--------------|-------------|----------|
| `FIREBASE_PROJECT_ID` | Your Firebase project ID | `my-app-12345` |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket name | `my-app-12345.appspot.com` |
| `FIREBASE_TARGET` | Hosting target (optional) | `app` or `loop-qc` |

### Step 5: Deploy the Action

**Option A: Use from GitHub Marketplace (Recommended)**
```yaml
# In your workflow file
- uses: LoopKitchen/runtime-pr-verification@v1
  with:
    preview-url: ${{ needs.deploy.outputs.preview_url }}
    firebase-credentials: ${{ secrets.FIREBASE_SA_BASE64 }}
    storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Option B: Fork and Deploy Your Own**
1. Fork this repository
2. Enable GitHub Actions in your fork
3. Create a release/tag (e.g., `v1.0.0`)
4. Reference in workflows: `uses: your-org/runtime-pr-verification@v1.0.0`

### Step 6: Storage Bucket Configuration

1. Go to Firebase Console → Storage
2. If not created, click "Get Started"
3. Choose location closest to your users
4. Set up storage rules:

```javascript
// storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow service account to read/write
    match /runtime-pr-verification/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
    
    // Optional: Allow public read for screenshots
    match /runtime-pr-verification/{pr}/screenshots/{image} {
      allow read: if true;
    }
  }
}
```

### Complete Configuration Reference

| Input | Required | Description | Default | Example |
|-------|----------|-------------|---------|----------|
| `preview-url` | ✅ | Firebase preview URL | - | `https://app--pr-123-app.web.app` |
| `firebase-credentials` | ✅ | Base64 service account | - | `${{ secrets.FIREBASE_SA_BASE64 }}` |
| `storage-bucket` | ✅ | Storage bucket name | - | `my-app.appspot.com` |
| `github-token` | ✅ | GitHub token | - | `${{ secrets.GITHUB_TOKEN }}` |
| `firebase-project-id` | ❌ | Override project ID | Auto-detected | `my-app-12345` |
| `firebase-target` | ❌ | Hosting target | Auto-detected | `app`, `loop-qc` |
| `build-system` | ❌ | Build system | Auto-detected | `vite`, `react` |
| `viewports` | ❌ | Test viewports | See below | `1920x1080:Desktop` |
| `test-timeout` | ❌ | Test timeout | `5m` | `8m` |
| `max-routes` | ❌ | Max routes to test | `10` | `15` |
| `cleanup-days` | ❌ | Storage cleanup | `7` | `14` |
| `gemini-bot-name` | ❌ | Gemini bot username | `gemini[bot]` | `gemini-reviewer` |
| `fail-on-errors` | ❌ | Fail on test errors | `false` | `true` |

**Default Viewports:**
```
1920x1080:Desktop,1366x768:Laptop,768x1024:Tablet,375x667:Mobile
```

### Troubleshooting Deployment

**Error: "Input required and not supplied: preview-url"**
- Ensure your deploy job outputs the preview URL
- Check the job dependency with `needs: [deploy]`

**Error: "Failed to initialize Firebase Admin"**
- Verify service account JSON is valid
- Check base64 encoding (no line breaks)
- Ensure service account has required permissions

**Error: "Storage bucket not found"**
- Verify bucket name matches your Firebase project
- Ensure Storage is enabled in Firebase Console
- Check service account has storage permissions

**Error: "Failed to find Gemini analysis"**
- Ensure Gemini bot has commented on the PR
- Check `gemini-bot-name` matches your bot's username
- Verify the job dependency order

## 🏗️ Architecture Overview

This GitHub Action provides comprehensive runtime verification for React SPAs deployed to Firebase Hosting, with intelligent integration of Gemini AI code review analysis.

```mermaid
graph TB
    subgraph "GitHub Actions Environment"
        A[PR Event Trigger] --> B[Runtime PR Verification Action]
        B --> C[Input Validation]
        C --> D[Firebase URL Analysis]
        D --> E[Gemini Analysis Parsing]
        E --> F[Test Generation]
        F --> G[Visual Test Execution]
        G --> H[Firebase Storage Upload]
        H --> I[PR Comment Generation]
    end
    
    subgraph "External Dependencies"
        J[Firebase Hosting<br/>Preview URLs]
        K[Firebase Storage<br/>Artifact Storage]
        L[Gemini AI<br/>Code Review Bot]
        M[GitHub API<br/>PR Comments]
    end
    
    D --> J
    H --> K
    E --> L
    I --> M
    
    style B fill:#e1f5fe
    style J fill:#fff3e0
    style K fill:#fff3e0
    style L fill:#f3e5f5
    style M fill:#e8f5e8
```

## 🔧 Core Components Architecture

### Component Interaction Flow

```mermaid
sequenceDiagram
    participant GA as GitHub Actions
    participant FUH as FirebaseUrlHandler
    participant GP as GeminiParser
    participant TG as TestGenerator
    participant VR as VisualRunner
    participant FSM as FirebaseStorageManager
    participant PR as PRReporter
    participant FB as Firebase Services
    
    GA->>FUH: Initialize with preview URL
    FUH->>FB: Validate deployment status
    FB-->>FUH: Deployment ready
    
    GA->>GP: Parse Gemini analysis
    GP->>GA: Return structured analysis
    
    GA->>TG: Generate tests from analysis
    TG-->>GA: Return test templates
    
    GA->>VR: Execute visual tests
    VR->>FB: Navigate to preview URL
    FB-->>VR: Render React SPA
    VR-->>GA: Return test results + artifacts
    
    GA->>FSM: Upload screenshots/videos
    FSM->>FB: Store in Firebase Storage
    FB-->>FSM: Return public URLs
    
    GA->>PR: Generate PR comment
    PR->>GA: Post to GitHub API
```

## 📁 File Structure & Responsibilities

```mermaid
graph LR
    subgraph "Core Module Structure"
        A[index.ts<br/>Main Orchestrator] --> B[types.ts<br/>TypeScript Interfaces]
        A --> C[firebase-url-handler.ts<br/>URL & Deployment Logic]
        A --> D[gemini-parser.ts<br/>AI Analysis Extraction]
        A --> E[test-generator.ts<br/>React Test Templates]
        A --> F[visual-runner.ts<br/>Playwright Execution]
        A --> G[firebase-storage.ts<br/>Storage Management]
        A --> H[pr-reporter.ts<br/>GitHub Integration]
        A --> I[firebase-config-detector.ts<br/>Configuration Analysis]
        A --> J[firebase-error-handler.ts<br/>Error Management]
    end
    
    style A fill:#bbdefb
    style B fill:#c8e6c9
    style C fill:#ffcdd2
    style D fill:#f8bbd9
    style E fill:#dcedc8
    style F fill:#ffe0b2
    style G fill:#ffcdd2
    style H fill:#d1c4e9
    style I fill:#ffcdd2
    style J fill:#ffab91
```

## 🔄 Data Flow Architecture

### Input Processing Flow

```mermaid
flowchart TD
    A[Action Inputs] --> B{Validate Inputs}
    B -->|Valid| C[Parse Firebase Preview URL]
    B -->|Invalid| Z[Fail with Error]
    
    C --> D[Detect Firebase Configuration]
    D --> E[firebase.json Detection]
    D --> F[package.json Analysis]
    D --> G[URL Pattern Analysis]
    
    E --> H[Combine Configuration]
    F --> H
    G --> H
    
    H --> I[Final Firebase Config]
    I --> J[Wait for Deployment]
    J --> K[Verify React SPA Ready]
    
    style A fill:#e3f2fd
    style I fill:#c8e6c9
    style K fill:#dcedc8
```

### Test Generation Flow

```mermaid
flowchart TD
    A[Gemini Analysis] --> B{Has UI Changes?}
    B -->|Yes| C[Extract Components]
    B -->|No| X[Skip Visual Testing]
    
    C --> D[Extract Routes]
    D --> E[Extract Test Suggestions]
    E --> F[Generate Component Tests]
    F --> G[Generate Route Tests]
    G --> H[Generate Form Tests]
    H --> I[Generate Responsive Tests]
    
    I --> J[Test Template Array]
    J --> K[Visual Test Execution]
    
    style A fill:#f3e5f5
    style J fill:#fff3e0
    style K fill:#e8f5e8
```

## 🎯 Firebase Integration Architecture

### Multi-Target Support System

```mermaid
graph TB
    subgraph "Firebase Configuration Detection"
        A[Preview URL] --> B[URL Pattern Analysis]
        C[firebase.json] --> D[Hosting Config Parsing]
        E[package.json] --> F[Build System Detection]
        
        B --> G[Configuration Resolver]
        D --> G
        F --> G
        
        G --> H{Multiple Targets?}
        H -->|Yes| I[loop-frontend Style<br/>Multi-target Setup]
        H -->|No| J[loop-admin Style<br/>Single Target Setup]
    end
    
    subgraph "Target Examples"
        I --> K[app: Vite + dist]
        I --> L[loop-qc: Vite + dist]
        J --> M[loop-ad: React + build]
    end
    
    style G fill:#bbdefb
    style I fill:#c8e6c9
    style J fill:#dcedc8
```

### Firebase Storage Organization

```mermaid
graph TD
    A[Firebase Storage Bucket] --> B[runtime-pr-verification/]
    B --> C[PR-123/]
    C --> D[2024-07-23/]
    D --> E[screenshots/]
    D --> F[videos/]
    D --> G[test-summary.json]
    
    E --> H[spa-loading-Desktop-final.png]
    E --> I[component-header-Tablet-final.png]
    E --> J[route-dashboard-Mobile-final.png]
    
    F --> K[form-login-Desktop.webm]
    
    style A fill:#ffcdd2
    style D fill:#fff3e0
    style E fill:#e8f5e8
    style F fill:#f3e5f5
```

## 🧪 Test Generation System

### React Component Test Templates

```mermaid
flowchart LR
    subgraph "Component Analysis"
        A[Detected Component] --> B{Component Type?}
        B -->|Interactive| C[Button, Form, Input]
        B -->|Display| D[Card, Text, Image]
        B -->|Navigation| E[Link, Menu, Tab]
    end
    
    subgraph "Generated Tests"
        C --> F[Visibility + Click Test]
        D --> G[Visibility + Screenshot]
        E --> H[Navigation + URL Check]
    end
    
    subgraph "Test Execution"
        F --> I[Playwright Actions]
        G --> I
        H --> I
        I --> J[Screenshot Capture]
        I --> K[Assertion Validation]
    end
    
    style A fill:#e3f2fd
    style I fill:#fff3e0
    style J fill:#c8e6c9
```

### React Router Integration

```mermaid
sequenceDiagram
    participant TG as TestGenerator
    participant GA as GeminiAnalysis
    participant VR as VisualRunner
    participant RR as ReactRouter
    participant FB as FirebaseHosting
    
    TG->>GA: Extract route changes
    GA-->>TG: Return ["/dashboard", "/settings"]
    
    loop For each route
        TG->>VR: Generate navigation test
        VR->>FB: Navigate to route
        FB->>RR: Client-side routing
        RR-->>FB: Render route component
        FB-->>VR: Page content ready
        VR->>VR: Capture screenshot
        VR->>VR: Validate URL change
    end
    
    VR-->>TG: Test results with evidence
```

## 🎨 Visual Testing Engine

### Playwright Integration Architecture

```mermaid
graph TB
    subgraph "Browser Management"
        A[Chromium Launch] --> B[Browser Context]
        B --> C[Page Instance]
        C --> D[Viewport Configuration]
    end
    
    subgraph "React SPA Optimization"
        D --> E[Navigate to URL]
        E --> F[Wait for Network Idle]
        F --> G[Wait for React Hydration]
        G --> H{Build System?}
        H -->|Vite| I[Wait for HMR Ready]
        H -->|React| J[Wait for Bundle Load]
    end
    
    subgraph "Test Execution"
        I --> K[Execute Test Actions]
        J --> K
        K --> L[Capture Screenshots]
        K --> M[Record Videos]
        K --> N[Collect Console Logs]
    end
    
    style A fill:#e3f2fd
    style G fill:#c8e6c9
    style K fill:#fff3e0
    style L fill:#dcedc8
```

### Multi-Viewport Testing Strategy

```mermaid
graph LR
    subgraph "Viewport Configuration"
        A[Desktop<br/>1920x1080] --> D[Test Execution]
        B[Tablet<br/>768x1024] --> D
        C[Mobile<br/>375x667] --> D
    end
    
    subgraph "Test Distribution"
        D --> E[Component Tests<br/>All Viewports]
        D --> F[Route Tests<br/>Primary Viewport]
        D --> G[Responsive Tests<br/>Mobile Viewport]
    end
    
    subgraph "Evidence Collection"
        E --> H[Screenshots per Viewport]
        F --> I[Navigation Videos]
        G --> J[Responsive Comparisons]
    end
    
    style D fill:#bbdefb
    style H fill:#c8e6c9
    style I fill:#dcedc8
    style J fill:#f3e5f5
```

## 🤖 Gemini AI Integration

### Analysis Parsing System

```mermaid
flowchart TD
    A[PR Comments] --> B[Find Gemini Comment]
    B --> C{Comment Found?}
    C -->|Yes| D[Parse Comment Body]
    C -->|No| E[Generate Default Analysis]
    
    D --> F[Extract Components]
    D --> G[Extract Routes]
    D --> H[Extract Risk Level]
    D --> I[Extract Test Suggestions]
    
    F --> J[Structured Analysis Object]
    G --> J
    H --> J
    I --> J
    
    E --> K[Default Test Configuration]
    
    J --> L[Test Generation]
    K --> L
    
    style A fill:#f3e5f5
    style D fill:#e1f5fe
    style J fill:#c8e6c9
    style L fill:#fff3e0
```

### Pattern Recognition System

```mermaid
graph TB
    subgraph "Component Detection Patterns"
        A[component/Component] --> F[Component List]
        B[export function ComponentName] --> F
        C[src/components/ComponentName] --> F
    end
    
    subgraph "Route Detection Patterns"
        D[route/Route/path:] --> G[Route List]
        E[src/pages/PageName] --> G
        H[navigate to /path] --> G
    end
    
    subgraph "Risk Assessment"
        I[breaking/major/critical] --> J[High Risk]
        K[change/update/modify] --> L[Medium Risk]
        M[minor/fix/patch] --> N[Low Risk]
    end
    
    F --> O[Test Template Selection]
    G --> O
    J --> P[Comprehensive Testing]
    L --> Q[Standard Testing]
    N --> R[Basic Testing]
    
    style F fill:#c8e6c9
    style G fill:#dcedc8
    style O fill:#fff3e0
```

## 🔐 Error Handling Architecture

### Comprehensive Error Classification

```mermaid
flowchart TD
    A[Error Occurs] --> B{Error Type?}
    
    B -->|Firebase Admin| C[Service Account Issues]
    B -->|Firebase Storage| D[Storage/Upload Issues]
    B -->|Firebase Hosting| E[Deployment Issues]
    B -->|Network| F[Connectivity Issues]
    B -->|Permission| G[Authorization Issues]
    
    C --> H{Retryable?}
    D --> H
    E --> H
    F --> H
    G --> H
    
    H -->|Yes| I[Exponential Backoff Retry]
    H -->|No| J[Immediate Failure]
    
    I --> K{Max Retries?}
    K -->|No| L[Retry Operation]
    K -->|Yes| J
    
    L --> M[Operation Success?]
    M -->|Yes| N[Continue Execution]
    M -->|No| K
    
    J --> O[Log Error + User Message]
    O --> P[Graceful Degradation]
    
    style A fill:#ffcdd2
    style I fill:#fff3e0
    style N fill:#c8e6c9
    style P fill:#f8bbd9
```

### Error Recovery Strategies

```mermaid
graph TB
    subgraph "Firebase Storage Errors"
        A[Upload Failure] --> B[Continue without URL]
        C[Quota Exceeded] --> D[Compress Images]
        E[Permission Denied] --> F[Check Service Account]
    end
    
    subgraph "Firebase Hosting Errors"
        G[Deployment Timeout] --> H[Extended Wait + Retry]
        I[URL Not Found] --> J[Check Preview URL]
    end
    
    subgraph "Test Execution Errors"
        K[React Hydration Timeout] --> L[Proceed with Basic Tests]
        M[Component Not Found] --> N[Skip Component Test]
        O[Route Navigation Failure] --> P[Log Warning + Continue]
    end
    
    style B fill:#c8e6c9
    style H fill:#dcedc8
    style L fill:#fff3e0
```

## 📊 Performance Optimization Strategy

### Execution Timeline Optimization

```mermaid
gantt
    title Runtime PR Verification Timeline
    dateFormat s
    axisFormat %s
    
    section Initialization
    Input Validation           :done, task1, 0, 5
    Firebase Config Detection  :done, task2, after task1, 10
    Deployment Wait           :done, task3, after task2, 30
    
    section Analysis
    Gemini Parsing            :done, task4, after task3, 10
    Test Generation           :done, task5, after task4, 10
    
    section Execution
    Browser Launch            :done, task6, after task5, 10
    Visual Tests              :active, task7, after task6, 105
    Screenshot Capture        :crit, task8, after task7, 30
    
    section Upload
    Firebase Storage Upload   :task9, after task8, 30
    PR Comment Generation     :task10, after task9, 10
    
    section Cleanup
    Browser Cleanup           :task11, after task10, 10
    Temp File Cleanup         :task12, after task11, 10
```

### Parallel Operations Strategy

```mermaid
flowchart TD
    A[Start] --> B[Initialize Browser]
    A --> C[Parse Gemini Analysis]
    A --> D[Setup Firebase Storage]
    
    B --> E[Browser Ready]
    C --> F[Analysis Complete]
    D --> G[Storage Ready]
    
    E --> H[Execute Tests]
    F --> H
    
    H --> I[Tests Complete]
    I --> J[Upload Screenshots]
    I --> K[Upload Videos]
    I --> L[Generate PR Comment]
    
    G --> J
    G --> K
    
    J --> M[All Uploads Complete]
    K --> M
    L --> N[Post PR Comment]
    
    M --> N
    
    style A fill:#e3f2fd
    style H fill:#fff3e0
    style M fill:#c8e6c9
    style N fill:#dcedc8
```

## 🔄 CI/CD Integration Patterns

### GitHub Actions Workflow Integration

```mermaid
flowchart LR
    subgraph "PR Workflow Pipeline"
        A[PR Created/Updated] --> B[Code Checkout]
        B --> C[Build React App]
        C --> D[Deploy to Firebase]
        D --> E[Gemini Code Review]
        E --> F[Runtime PR Verification]
        F --> G[PR Status Check]
    end
    
    subgraph "Parallel Execution"
        E --> H[Static Analysis]
        F --> I[Visual Testing]
        H --> J[Combined Results]
        I --> J
    end
    
    subgraph "Result Integration"
        G --> K[PR Comment Update]
        J --> K
        K --> L[Merge Decision]
    end
    
    style F fill:#bbdefb
    style I fill:#c8e6c9
    style K fill:#dcedc8
```

### Multi-Repository Usage Pattern

```mermaid
graph TB
    subgraph CAR[Central Action Repository]
        A[runtime-pr-verification@v1]
    end
    
    subgraph CR[Consumer Repositories]
        B[loop-frontend<br/>Vite + Multi-target]
        C[loop-admin<br/>React + Single-target]
        D[Other React SPAs]
    end
    
    subgraph CV[Configuration Variations]
        E[Custom Viewports]
        F[Extended Timeouts]
        G[Specific Firebase Targets]
    end
    
    A --> B
    A --> C
    A --> D
    
    B --> E
    C --> F
    D --> G
    
    style A fill:#e1f5fe
    style B fill:#c8e6c9
    style C fill:#dcedc8
    style D fill:#fff3e0
```

## 📈 Monitoring & Analytics

### Action Performance Metrics

```mermaid
graph TB
    subgraph "Execution Metrics"
        A[Total Runtime] --> D[Performance Dashboard]
        B[Test Success Rate] --> D
        C[Firebase Upload Speed] --> D
    end
    
    subgraph "Quality Metrics"
        E[Visual Regression Detection] --> F[Quality Dashboard]
        G[Error Coverage] --> F
        H[Test Effectiveness] --> F
    end
    
    subgraph "Usage Analytics"
        I[Repository Adoption] --> J[Usage Dashboard]
        K[Feature Utilization] --> J
        L[Error Patterns] --> J
    end
    
    style D fill:#e3f2fd
    style F fill:#c8e6c9
    style J fill:#fff3e0
```

## 🔧 Development & Debugging

### Local Development Setup

```mermaid
flowchart TD
    A[Clone Repository] --> B[Install Dependencies]
    B --> C[Setup Environment Variables]
    C --> D[Run Local Tests]
    
    D --> E{Test Type?}
    E -->|Unit Tests| F[Jest Test Suite]
    E -->|Integration Tests| G[Local Test Runner]
    E -->|Manual Testing| H[Target Firebase URL]
    
    F --> I[Validation Complete]
    G --> J[Mock Firebase Services]
    H --> K[Real Firebase Integration]
    
    J --> I
    K --> I
    
    style A fill:#e3f2fd
    style I fill:#c8e6c9
```

### Debug Information Flow

```mermaid
sequenceDiagram
    participant DEV as Developer
    participant LT as Local Test Runner
    participant FA as Firebase Action
    participant LOG as Action Logs
    
    DEV->>LT: npm run test:local --url=...
    LT->>FA: Initialize with debug config
    FA->>LOG: Log configuration details
    FA->>LOG: Log Firebase detection results
    FA->>LOG: Log test generation process
    FA->>LOG: Log test execution results
    FA->>LOG: Log upload progress
    LOG-->>DEV: Comprehensive debug output
```

## 🚀 Deployment Strategy

### Release Management

```mermaid
flowchart LR
    A[Development] --> B[Feature Branch]
    B --> C[Pull Request]
    C --> D[Code Review]
    D --> E[Integration Tests]
    E --> F[Merge to Main]
    F --> G[Automated Release]
    G --> H[Version Tag]
    H --> I[GitHub Marketplace]
    
    subgraph "Version Strategy"
        J[v1.x.x - Major Features]
        K[v1.x.x - Minor Enhancements]
        L[v1.x.x - Bug Fixes]
    end
    
    H --> J
    H --> K
    H --> L
    
    style G fill:#bbdefb
    style I fill:#c8e6c9
```

## 📚 Usage Examples

### Basic Implementation

```yaml
# .github/workflows/pr-verification.yml
name: PR Verification
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  visual-verification:
    runs-on: ubuntu-latest
    steps:
      - uses: your-org/runtime-pr-verification@v1
        with:
          preview-url: ${{ needs.deploy.outputs.preview_url }}
          firebase-credentials: ${{ secrets.FIREBASE_SA_BASE64 }}
          storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Configuration

```yaml
# Advanced configuration for loop-frontend
- uses: your-org/runtime-pr-verification@v1
  with:
    preview-url: ${{ needs.deploy.outputs.preview_url }}
    firebase-credentials: ${{ secrets.FIREBASE_SA_BASE64 }}
    storage-bucket: 'loop-frontend-screenshots'
    github-token: ${{ secrets.GITHUB_TOKEN }}
    firebase-target: 'app'
    build-system: 'vite'
    viewports: '1920x1080:Desktop,768x1024:Tablet,390x844:Mobile'
    test-timeout: '8m'
    max-routes: '15'
    cleanup-days: '14'
```

## 🎯 Quick Deployment Checklist

Here's everything you need to deploy this action in your repository:

### ✅ Required Secrets (Settings → Secrets → Actions → New repository secret)
1. **`FIREBASE_SA_BASE64`** - Your Firebase service account JSON encoded in base64
   ```bash
   base64 -i service-account.json | pbcopy  # Copies to clipboard on macOS
   ```
2. **`GEMINI_API_KEY`** - Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
3. **`FIREBASE_TOKEN`** (optional) - Run `firebase login:ci` if not using service account

### ✅ Required Variables (Settings → Secrets → Actions → Variables tab)
1. **`FIREBASE_PROJECT_ID`** - Your Firebase project ID (e.g., `my-app-12345`)
2. **`FIREBASE_STORAGE_BUCKET`** - Usually `{project-id}.appspot.com`

### ✅ Minimum Workflow Configuration
```yaml
# .github/workflows/pr-checks.yml
name: PR Visual Verification
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  # Your existing deploy job that outputs preview_url
  deploy:
    outputs:
      preview_url: ${{ steps.deploy.outputs.preview_url }}
    # ... your deployment steps ...

  # Add this job for visual verification
  visual-verification:
    needs: [deploy]  # Make sure deploy completes first
    runs-on: ubuntu-latest
    steps:
      - uses: LoopKitchen/runtime-pr-verification@v1
        with:
          preview-url: ${{ needs.deploy.outputs.preview_url }}
          firebase-credentials: ${{ secrets.FIREBASE_SA_BASE64 }}
          storage-bucket: ${{ vars.FIREBASE_STORAGE_BUCKET }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 📦 What Gets Stored Where
- **Screenshots**: `gs://{bucket}/runtime-pr-verification/PR-{number}/{date}/screenshots/`
- **Videos**: `gs://{bucket}/runtime-pr-verification/PR-{number}/{date}/videos/`
- **Test Summary**: `gs://{bucket}/runtime-pr-verification/PR-{number}/{date}/test-summary.json`

### 🔒 Firebase Service Account Permissions Needed
- Firebase Hosting Viewer
- Storage Object Admin (for the screenshots bucket)

This technical documentation provides a comprehensive understanding of the Runtime PR Verification Action's architecture, implementation details, and usage patterns. The Mermaid diagrams visualize the complex interactions between components, making it easier to understand the system's behavior and troubleshoot issues.