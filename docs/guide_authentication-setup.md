# YoFix Authentication Setup Guide

## Overview

YoFix supports authentication for testing protected routes in your application. This guide covers how to configure authentication for different scenarios.

## Basic Authentication

For applications with authentication, provide credentials:

```yaml
- uses: yofix/yofix@v1.0.17
  with:
    preview-url: 'https://app.example.com'
    auth-email: 'test@example.com'
    auth-password: 'secure-password'
```

## Custom Login URL

By default, YoFix navigates to `/login/password` for authentication. If your app uses a different login URL:

```yaml
- uses: yofix/yofix@v1.0.17
  with:
    preview-url: 'https://app.example.com'
    auth-email: 'test@example.com'
    auth-password: 'secure-password'
    auth-login-url: '/auth/signin'  # Your custom login path
```

## How Authentication Works

1. **Initial Login**: YoFix navigates to the login URL and performs authentication
2. **Session Persistence**: Uses browser context to maintain session across route tests
3. **Auto Re-authentication**: If redirected to login during testing, YoFix automatically re-authenticates
4. **State Saving**: Authentication state is saved to `auth-state.json` for debugging

## Supported Login Forms

YoFix automatically detects and fills common login form patterns:

### Email/Username Fields
- `input[type="email"]`
- `input[name="email"]`
- `input[name="username"]`
- Inputs with email/username placeholders
- Inputs with email/username IDs

### Password Fields
- `input[type="password"]`

### Submit Buttons
- `button[type="submit"]`
- Buttons with text: "Log in", "Login", "Sign in", "Continue"
- Elements with role="button" containing login text

## Debugging Authentication

Enable debug mode to see detailed authentication logs:

```yaml
- uses: yofix/yofix@v1.0.17
  with:
    preview-url: 'https://app.example.com'
    auth-email: 'test@example.com'
    auth-password: 'secure-password'
    debug: 'true'
```

Debug output includes:
- Login URL navigation
- Form field detection
- Submit button selection
- Authentication success/failure

## Common Issues

### 1. Login Form Not Found
**Problem**: YoFix can't find the login form fields

**Solution**: Check that your login URL is correct and the form uses standard HTML inputs

### 2. Authentication Fails
**Problem**: Login succeeds but routes still redirect to login

**Solutions**:
- Ensure credentials are correct
- Check if your app requires additional authentication steps (2FA, captcha)
- Verify session cookies are being maintained

### 3. Custom Form Fields
**Problem**: Your app uses non-standard form fields

**Solution**: Consider using AI-powered authentication (coming soon) or file an issue with your form structure

## Example: Loop Kitchen Setup

For apps like Loop Kitchen with `/login/password`:

```yaml
- name: Visual Test with Auth
  uses: yofix/yofix@v1.0.17
  with:
    preview-url: ${{ needs.deploy.outputs.preview-url }}
    auth-email: 'hari@tryloop.ai'
    auth-password: ${{ secrets.LOOP_PASSWORD }}
    auth-login-url: '/login/password'
    viewports: '1920x1080,768x1024,375x667'
    max-routes: '10'
```

## Testing Protected Routes

Once authenticated, YoFix will:
1. Extract/discover routes from your codebase
2. Visit each route while maintaining the session
3. Capture screenshots of protected pages
4. Re-authenticate if session expires

## Security Best Practices

1. **Use GitHub Secrets**: Never hardcode passwords
   ```yaml
   auth-password: ${{ secrets.APP_PASSWORD }}
   ```

2. **Test Accounts**: Use dedicated test accounts with limited permissions

3. **Clean Up**: Authentication state files are not committed to the repository

## Advanced: Multiple Auth Flows

If your app has different authentication methods for different user types, you can run multiple YoFix jobs:

```yaml
jobs:
  test-admin:
    steps:
      - uses: yofix/yofix@v1.0.17
        with:
          auth-email: 'admin@example.com'
          auth-password: ${{ secrets.ADMIN_PASSWORD }}
          auth-login-url: '/admin/login'
  
  test-user:
    steps:
      - uses: yofix/yofix@v1.0.17
        with:
          auth-email: 'user@example.com'
          auth-password: ${{ secrets.USER_PASSWORD }}
          auth-login-url: '/login'
```