# 🧪 YoFix Local Development Guide

This guide shows you how to test YoFix locally without GitHub Actions.

## 🚀 Quick Start (2 minutes)

```bash
# 1. Run the setup script
node setup-local.js

# 2. Test your configuration
node test-local.js

# 3. Start interactive playground (optional)
node playground.js
```

## 📋 Prerequisites

- Node.js 18+ installed
- Claude API key from [https://console.anthropic.com/](https://console.anthropic.com/)
- Website to test (can be localhost:3000 or any URL)

## ⚙️ Environment Configuration

YoFix uses **ONE** environment file approach:

### **Environment File Priority:**
1. `.env.local` (recommended for local development)
2. `.env` (fallback)
3. System environment variables

### **Setup Options:**

#### Option A: Automated Setup (Recommended)
```bash
node setup-local.js
```

#### Option B: Manual Setup
```bash
# Copy example file
cp .env.example .env.local

# Edit with your values
nano .env.local
```

## 🧪 Testing Methods

### **1. CLI Testing (Quickest)**
```bash
# Basic scan
./dist/cli/yofix-cli.js scan https://example.com

# Full scan with options
./dist/cli/yofix-cli.js scan https://your-site.com \
  --routes / /about /contact \
  --viewports 375x667 768x1024 1920x1080 \
  --output results.json

# Generate fixes
./dist/cli/yofix-cli.js fix results.json --output fixes.css
```

### **2. Comprehensive Testing**
```bash
# Test all components
node test-local.js https://your-website.com

# Test with authentication
node test-local.js https://app-requiring-login.com

# Test local development
node test-local.js http://localhost:3000
```

### **3. Interactive Playground**
```bash
# Start playground
node playground.js

# Commands available:
yofix> start https://example.com
yofix> visual                    # Run visual analysis
yofix> responsive               # Test responsive design
yofix> task "click login button" # Natural language tasks
yofix> screenshot               # Take screenshot
yofix> quit                     # Exit
```

### **4. Docker Testing**
```bash
# Build and test in clean environment
cd docker-test
export CLAUDE_API_KEY="your-key"
docker-compose up yofix
```

## 🔧 Configuration Details

### **Required Settings:**
```bash
CLAUDE_API_KEY=your-claude-api-key    # From console.anthropic.com
TEST_WEBSITE_URL=http://localhost:3000 # Website to test
```

### **Optional Settings:**
```bash
# Test Configuration
TEST_ROUTES=/,/about,/contact         # Routes to test
TEST_VIEWPORTS=375x667,768x1024,1920x1080 # Viewports
TEST_AUTH_EMAIL=test@example.com      # For auth testing
TEST_AUTH_PASSWORD=password123        # For auth testing
TEST_LOGIN_URL=auto-detect            # AI finds login page automatically

# Development Settings  
YOFIX_HEADLESS=false                  # Show browser
YOFIX_DEBUG=true                      # Debug output
YOFIX_SLOW_MO=500                     # Slow down actions

# Storage (Optional)
FIREBASE_PROJECT_ID=your-project      # Firebase storage
FIREBASE_STORAGE_BUCKET=your-bucket   
AWS_ACCESS_KEY_ID=your-key           # AWS S3 storage
AWS_SECRET_ACCESS_KEY=your-secret
```

## 🔍 Login Auto-Detection

YoFix can automatically find login pages using AI:

### **How It Works:**
1. **Scans the homepage** for login links, buttons, or navigation items
2. **Checks common URLs** like `/login`, `/signin`, `/auth/login`, etc.
3. **Clicks login links** to find the actual login form page
4. **Validates pages** by looking for username/password fields
5. **Returns the path** of the detected login page

### **Usage:**
```bash
# In setup-local.js
Login page URL options:
1. Auto-detect (AI will find the login page)  ← Recommended
2. /login (default)
3. Custom URL

# In .env.local
TEST_LOGIN_URL=auto-detect
```

### **Common Detection Results:**
- `/login` - Standard login page
- `/signin` - Sign in page  
- `/auth/login` - Authentication route
- `/user/login` - User account login
- `/account/signin` - Account signin
- `/dashboard/login` - Dashboard login

### **Fallback Behavior:**
If auto-detection fails, YoFix defaults to `/login` and continues testing.

## 📊 Understanding Results

### **Test Output Files:**
```
test-results/
├── scan-results.json        # Visual issues detected
├── generated-fixes.json     # AI-generated fixes
├── test-results.json        # Test execution results  
├── summary.json            # Overall summary
└── screenshot-*.png        # Screenshots taken
```

### **Typical Scan Result:**
```json
{
  "success": true,
  "issues": [
    {
      "type": "layout",
      "severity": "critical", 
      "description": "Button overlaps text on mobile",
      "route": "/contact",
      "screenshot": "base64-data"
    }
  ],
  "summary": {
    "totalIssues": 3,
    "criticalIssues": 1,
    "warningIssues": 2
  }
}
```

## 🐛 Troubleshooting

### **Common Issues:**

#### "Claude API key required"
```bash
# Set your API key
export CLAUDE_API_KEY="your-key-here"
# or add to .env.local
echo "CLAUDE_API_KEY=your-key-here" >> .env.local
```

#### "Playwright browser not found"  
```bash
npx playwright install chromium
```

#### "Network timeout"
- Check website is accessible
- Try with simpler site first: `node test-local.js https://example.com`

#### "Out of memory"
```bash
node --max-old-space-size=4096 test-local.js
```

### **Debug Mode:**
```bash
# Enable debug output
DEBUG=yofix:* node test-local.js

# Verbose browser agent logs
DEBUG=browser-agent:* node playground.js
```

## 🎯 Testing Scenarios

### **Local Development Server:**
```bash
# Start your app
npm run dev  # or yarn dev

# Test it
node test-local.js http://localhost:3000
```

### **Staging Environment:**
```bash
node test-local.js https://staging.yourapp.com
```

### **With Authentication:**
```bash
# Set in .env.local
TEST_AUTH_EMAIL=demo@yourapp.com
TEST_AUTH_PASSWORD=demo123
TEST_LOGIN_URL=auto-detect  # AI will find the login page

# Or specify manually
TEST_LOGIN_URL=/signin

# Then test
node test-local.js https://yourapp.com
```

### **Mobile-First Testing:**
```bash
./dist/cli/yofix-cli.js scan https://yourapp.com \
  --viewports 375x667 414x896
```

## 📈 Performance Comparison

| **Testing Method** | **Speed** | **Features** | **Use Case** |
|-------------------|-----------|--------------|--------------|
| CLI Scan | ⚡ Fast | Basic analysis | Quick checks |
| Full Test | 🐢 Slow | All features | Comprehensive |
| Playground | 🎮 Interactive | Live control | Debugging |
| Docker | 🐳 Isolated | Clean env | CI/CD |

## 🔄 Next Steps

1. **Test locally** with your website
2. **Configure GitHub Action** for CI/CD
3. **Set up storage** (Firebase/S3) for team use
4. **Create baselines** for visual regression testing

## 📚 Additional Resources

- **GitHub Action**: Configure for CI/CD pipeline
- **API Documentation**: Extend with custom actions
- **Browser Agent**: Write custom browser automation
- **Storage Setup**: Configure Firebase or AWS S3

---

**🎉 You're ready to test YoFix locally!**

Start with: `node setup-local.js` then `node test-local.js`