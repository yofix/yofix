# YoFix Authentication Configuration

## Overview

YoFix supports multiple authentication methods to test protected routes in your application. This guide covers all authentication options and best practices.

## Authentication Methods

### 1. Email/Password Authentication

The most common authentication method for web applications.

#### Basic Configuration

```yaml
# .yofix.yml
auth:
  required: true
  method: email-password
  loginUrl: /login
```

#### GitHub Workflow

```yaml
- uses: yofix/yofix@v1
  with:
    auth-email: ${{ secrets.TEST_USER_EMAIL }}
    auth-password: ${{ secrets.TEST_USER_PASSWORD }}
    auth-login-url: /login
```

#### Advanced Options

```yaml
# .yofix.yml
auth:
  required: true
  method: email-password
  loginUrl: /login
  selectors:
    email: 'input[type="email"]'      # Custom email field selector
    password: 'input[type="password"]' # Custom password field selector
    submit: 'button[type="submit"]'    # Custom submit button
  waitFor:
    selector: '.dashboard'             # Element to wait for after login
    url: '/dashboard'                  # URL to wait for after login
    timeout: 10000                     # Max wait time in ms
```

### 2. Magic Link Authentication

For passwordless authentication systems.

```yaml
# .yofix.yml
auth:
  required: true
  method: magic-link
  loginUrl: /auth/magic
  email: test@example.com
  magicLink:
    # Where to find the magic link
    source: email        # email, sms, or custom
    provider: mailhog    # mailhog, mailtrap, custom
    apiEndpoint: http://localhost:8025/api/v2/messages
```

#### Custom Magic Link Handler

```javascript
// .yofix.auth.js
module.exports = {
  async getMagicLink(email) {
    // Custom logic to retrieve magic link
    const response = await fetch('http://localhost:8025/api/v2/messages');
    const messages = await response.json();
    
    const latestEmail = messages.items.find(msg => 
      msg.Content.Headers.To[0].includes(email)
    );
    
    const linkMatch = latestEmail.Content.Body.match(/https:\/\/.*\/auth\/verify\?token=[\w-]+/);
    return linkMatch ? linkMatch[0] : null;
  }
};
```

### 3. OAuth/Social Login

Support for OAuth providers like Google, GitHub, etc.

```yaml
# .yofix.yml
auth:
  required: true
  method: oauth
  provider: google
  loginUrl: /auth/login
  oauth:
    # For testing, you can provide test account credentials
    email: $TEST_GOOGLE_EMAIL
    password: $TEST_GOOGLE_PASSWORD
    # Or use a pre-authenticated session token
    sessionToken: $TEST_SESSION_TOKEN
```

#### Mock OAuth for Testing

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    // Intercept OAuth redirects
    await page.route('**/oauth/authorize**', route => {
      // Simulate successful OAuth callback
      route.fulfill({
        status: 302,
        headers: {
          'Location': '/auth/callback?code=test-code&state=test-state'
        }
      });
    });
    
    await page.goto('/login');
    await page.click('[data-provider="google"]');
  }
};
```

### 4. API Key Authentication

For applications using API key based auth.

```yaml
# .yofix.yml
auth:
  required: true
  method: api-key
  headers:
    'X-API-Key': $API_KEY
    'Authorization': 'Bearer $API_TOKEN'
  cookies:
    'session': $SESSION_COOKIE
```

### 5. Multi-Factor Authentication (MFA)

Support for 2FA/MFA workflows.

```yaml
# .yofix.yml
auth:
  required: true
  method: email-password
  loginUrl: /login
  mfa:
    enabled: true
    method: totp  # totp, sms, email
    secret: $MFA_SECRET  # For TOTP
```

#### MFA Handler

```javascript
// .yofix.auth.js
const speakeasy = require('speakeasy');

module.exports = {
  async handleMFA(page, mfaConfig) {
    if (mfaConfig.method === 'totp') {
      const token = speakeasy.totp({
        secret: mfaConfig.secret,
        encoding: 'base32'
      });
      
      await page.fill('[name="mfa-code"]', token);
      await page.click('[type="submit"]');
    }
  }
};
```

### 6. Custom Authentication

For complex or unique authentication flows.

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    // Step 1: Navigate to login
    await page.goto('/login');
    
    // Step 2: Fill credentials
    await page.fill('#username', credentials.email);
    await page.fill('#password', credentials.password);
    
    // Step 3: Handle custom captcha
    await page.evaluate(() => {
      window.bypassCaptcha = true;
    });
    
    // Step 4: Submit form
    await page.click('#login-button');
    
    // Step 5: Wait for redirect
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    // Step 6: Verify authentication
    const isAuthenticated = await page.locator('.user-menu').isVisible();
    if (!isAuthenticated) {
      throw new Error('Authentication failed');
    }
  }
};
```

## Session Management

### Persistent Sessions

Save and reuse authentication sessions across tests.

```yaml
# .yofix.yml
auth:
  session:
    persist: true
    storage: file  # file or redis
    ttl: 3600     # Session lifetime in seconds
```

### Session Sharing

```javascript
// .yofix.auth.js
module.exports = {
  async saveSession(page) {
    const cookies = await page.context().cookies();
    const localStorage = await page.evaluate(() => {
      return Object.entries(localStorage);
    });
    
    return {
      cookies,
      localStorage,
      sessionStorage: await page.evaluate(() => Object.entries(sessionStorage))
    };
  },
  
  async loadSession(page, session) {
    // Restore cookies
    await page.context().addCookies(session.cookies);
    
    // Restore localStorage
    await page.goto('/');
    await page.evaluate((items) => {
      items.forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
    }, session.localStorage);
  }
};
```

## Security Best Practices

### 1. Credential Management

**Never commit credentials to your repository!**

```yaml
# Good - Using GitHub Secrets
auth-email: ${{ secrets.TEST_USER_EMAIL }}
auth-password: ${{ secrets.TEST_USER_PASSWORD }}

# Bad - Hardcoded credentials
auth-email: test@example.com
auth-password: password123
```

### 2. Test Account Setup

Create dedicated test accounts with limited permissions:

```sql
-- Example: Create test user with read-only access
INSERT INTO users (email, password, role) VALUES 
  ('yofix-test@example.com', '$2b$10$...', 'viewer');

-- Grant minimal permissions
GRANT SELECT ON products TO 'yofix-test@example.com';
```

### 3. Environment Isolation

Use separate test environments:

```yaml
# .yofix.yml
environments:
  staging:
    url: https://staging.example.com
    auth:
      email: staging-test@example.com
  
  production:
    url: https://example.com
    auth:
      email: prod-test@example.com
      permissions: read-only
```

### 4. Credential Rotation

Regularly rotate test credentials:

```yaml
# .github/workflows/rotate-credentials.yml
name: Rotate Test Credentials
on:
  schedule:
    - cron: '0 0 1 * *'  # Monthly

jobs:
  rotate:
    runs-on: ubuntu-latest
    steps:
      - name: Generate new password
        run: |
          NEW_PASSWORD=$(openssl rand -base64 32)
          # Update password in your system
          # Update GitHub secret
```

## Authentication Debugging

### Enable Debug Mode

```yaml
# .yofix.yml
auth:
  debug: true
  screenshot:
    onError: true
    steps: ['before-login', 'after-login', 'after-redirect']
```

### Common Issues and Solutions

#### 1. Login Form Not Found

```yaml
auth:
  loginUrl: /login
  waitForSelector: 'form[name="login"]'  # Wait for form to appear
  timeout: 20000  # Increase timeout for slow-loading pages
```

#### 2. Dynamic Form Fields

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    // Wait for dynamic form to load
    await page.waitForSelector('[data-testid="email-input"]');
    
    // Use data attributes instead of generic selectors
    await page.fill('[data-testid="email-input"]', credentials.email);
    await page.fill('[data-testid="password-input"]', credentials.password);
  }
};
```

#### 3. CSRF Protection

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    // Get CSRF token
    const csrfToken = await page.locator('meta[name="csrf-token"]')
      .getAttribute('content');
    
    // Include in form submission
    await page.evaluate((token) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = '_csrf';
      input.value = token;
      document.querySelector('form').appendChild(input);
    }, csrfToken);
  }
};
```

#### 4. Rate Limiting

```yaml
# .yofix.yml
auth:
  rateLimit:
    delay: 2000  # Wait 2s between login attempts
    maxRetries: 3
    backoff: exponential
```

## Examples

### Next.js with NextAuth

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    await page.goto('/api/auth/signin');
    await page.click('[data-provider="credentials"]');
    
    await page.fill('input[name="email"]', credentials.email);
    await page.fill('input[name="password"]', credentials.password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('/dashboard');
  }
};
```

### Laravel with Sanctum

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    // Get CSRF cookie
    await page.goto('/sanctum/csrf-cookie');
    
    // Login
    const response = await page.request.post('/login', {
      data: {
        email: credentials.email,
        password: credentials.password
      }
    });
    
    if (response.ok()) {
      await page.goto('/dashboard');
    }
  }
};
```

### Firebase Authentication

```javascript
// .yofix.auth.js
module.exports = {
  async authenticate(page, credentials) {
    await page.goto('/login');
    
    // Use Firebase Auth UI
    await page.fill('.firebaseui-id-email', credentials.email);
    await page.click('.firebaseui-id-submit');
    
    await page.waitForSelector('.firebaseui-id-password');
    await page.fill('.firebaseui-id-password', credentials.password);
    await page.click('.firebaseui-id-submit');
    
    await page.waitForURL('/dashboard');
  }
};
```

## Testing Authentication

### Local Testing

```bash
# Test authentication locally
yofix test-auth --config .yofix.yml --env local

# Debug authentication flow
DEBUG=yofix:auth yofix test-auth --verbose
```

### CI Testing

```yaml
# .github/workflows/test-auth.yml
name: Test Authentication
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Test YoFix Authentication
        run: |
          npx yofix test-auth \
            --email ${{ secrets.TEST_EMAIL }} \
            --password ${{ secrets.TEST_PASSWORD }} \
            --url https://staging.example.com \
            --verbose