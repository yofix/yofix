#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const llm_browser_agent_1 = require("./llm-browser-agent");
const auth_strategies_1 = require("./auth-strategies");
async function runVisualTests() {
    const previewUrl = process.env.INPUT_PREVIEW_URL;
    const routesJson = process.env.INPUT_ROUTES || '[]';
    const viewportsStr = process.env.INPUT_VIEWPORTS || '1920x1080';
    const timeout = process.env.INPUT_TEST_TIMEOUT || '30s';
    const debug = process.env.INPUT_DEBUG === 'true';
    const authEmail = process.env.INPUT_AUTH_EMAIL;
    const authPassword = process.env.INPUT_AUTH_PASSWORD;
    const authLoginUrl = process.env.INPUT_AUTH_LOGIN_URL || '/login/password';
    const claudeApiKey = process.env.INPUT_CLAUDE_API_KEY;
    if (!previewUrl) {
        console.error('❌ Preview URL is required');
        process.exit(1);
    }
    console.log(`📸 Running visual tests on ${previewUrl}`);
    let routes = [];
    try {
        routes = JSON.parse(routesJson);
    }
    catch {
        routes = [{ path: '/', title: 'Home' }];
    }
    const viewports = viewportsStr.split(',').map(vp => {
        const [width, height] = vp.trim().split('x').map(Number);
        return {
            width,
            height,
            name: `${width}x${height}`
        };
    });
    console.log(`🔍 Testing ${routes.length} routes across ${viewports.length} viewports`);
    const browser = await playwright_1.chromium.launch({
        headless: !debug,
        slowMo: debug ? 500 : 0,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const results = [];
    const screenshots = [];
    try {
        const context = await browser.newContext({
            viewport: viewports[0],
            acceptDownloads: false,
            ignoreHTTPSErrors: true,
            storageState: undefined
        });
        if (authEmail && authPassword) {
            console.log(`🔐 Authenticating at ${authLoginUrl}...`);
            const authSuccess = await performAuthentication(context, previewUrl, authLoginUrl, authEmail, authPassword, debug);
            if (!authSuccess) {
                console.error('❌ Authentication failed');
            }
            else {
                console.log('✅ Authentication successful');
            }
        }
        for (const route of routes) {
            console.log(`\n📍 Testing route: ${route.path}`);
            for (const viewport of viewports) {
                const page = await context.newPage();
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                try {
                    page.setDefaultTimeout(parseInt(timeout) * 1000);
                    const fullUrl = new URL(route.path, previewUrl).href;
                    if (debug) {
                        console.log(`  🌐 Navigating to: ${fullUrl}`);
                    }
                    const response = await page.goto(fullUrl, { waitUntil: 'networkidle' });
                    const currentUrl = page.url();
                    const wasRedirectedToLogin = currentUrl.includes('/login') && !route.path.includes('/login');
                    if (wasRedirectedToLogin) {
                        console.log(`  ⚠️ ${viewport.name} - Redirected to login (auth may have expired)`);
                        if (authEmail && authPassword) {
                            console.log('  🔐 Re-authenticating...');
                            await page.close();
                            const reAuthSuccess = await performAuthentication(context, previewUrl, authLoginUrl, authEmail, authPassword, debug);
                            if (reAuthSuccess) {
                                const retryPage = await context.newPage();
                                await retryPage.setViewportSize({ width: viewport.width, height: viewport.height });
                                await retryPage.goto(fullUrl, { waitUntil: 'networkidle' });
                                await page.close();
                                await retryPage.waitForLoadState('networkidle');
                                await retryPage.waitForTimeout(1000);
                                const screenshotName = `${route.path.replace(/\//g, '-')}-${viewport.name}.png`;
                                const screenshotPath = path.join(process.cwd(), 'screenshots', screenshotName);
                                fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
                                await retryPage.screenshot({
                                    path: screenshotPath,
                                    fullPage: true
                                });
                                screenshots.push(screenshotPath);
                                results.push({
                                    route: route.path,
                                    viewport: viewport.name,
                                    screenshot: screenshotPath,
                                    status: 'passed',
                                    message: 'Screenshot captured successfully after re-authentication'
                                });
                                console.log(`  ✅ ${viewport.name} - Screenshot captured after re-auth`);
                                await retryPage.close();
                                continue;
                            }
                        }
                    }
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(1000);
                    const screenshotName = `${route.path.replace(/\//g, '-')}-${viewport.name}.png`;
                    const screenshotPath = path.join(process.cwd(), 'screenshots', screenshotName);
                    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
                    await page.screenshot({
                        path: screenshotPath,
                        fullPage: true
                    });
                    screenshots.push(screenshotPath);
                    results.push({
                        route: route.path,
                        viewport: viewport.name,
                        screenshot: screenshotPath,
                        status: wasRedirectedToLogin ? 'warning' : 'passed',
                        message: wasRedirectedToLogin
                            ? 'Screenshot captured but route may require authentication'
                            : 'Screenshot captured successfully'
                    });
                    console.log(`  ✅ ${viewport.name} - Screenshot captured`);
                }
                catch (error) {
                    console.error(`  ❌ ${viewport.name} - Test failed:`, error.message);
                    results.push({
                        route: route.path,
                        viewport: viewport.name,
                        screenshot: '',
                        status: 'failed',
                        message: error.message
                    });
                }
                finally {
                    await page.close();
                }
            }
        }
        if (authEmail && authPassword) {
            const statePath = path.join(process.cwd(), 'auth-state.json');
            await context.storageState({ path: statePath });
            console.log(`\n💾 Saved authentication state to ${statePath}`);
        }
        const outputPath = path.join(process.cwd(), 'visual-test-results.json');
        fs.writeFileSync(outputPath, JSON.stringify({
            results,
            screenshots,
            summary: {
                total: results.length,
                passed: results.filter(r => r.status === 'passed').length,
                failed: results.filter(r => r.status === 'failed').length,
                warnings: results.filter(r => r.status === 'warning').length
            }
        }, null, 2));
        const githubOutput = process.env.GITHUB_OUTPUT;
        if (githubOutput) {
            fs.appendFileSync(githubOutput, `results=${JSON.stringify(results)}\n`);
            fs.appendFileSync(githubOutput, `screenshots=${JSON.stringify(screenshots)}\n`);
            fs.appendFileSync(githubOutput, `test-count=${results.length}\n`);
            fs.appendFileSync(githubOutput, `passed-count=${results.filter(r => r.status === 'passed').length}\n`);
        }
        console.log(`\n✅ Visual testing completed: ${results.filter(r => r.status === 'passed').length}/${results.length} passed`);
    }
    catch (error) {
        console.error('❌ Visual testing failed:', error);
        process.exit(1);
    }
    finally {
        await browser.close();
    }
}
async function performAuthentication(context, baseUrl, loginPath, email, password, debug) {
    const page = await context.newPage();
    try {
        const loginUrl = new URL(loginPath, baseUrl).href;
        if (debug) {
            console.log(`  🌐 Navigating to login: ${loginUrl}`);
        }
        await page.goto(loginUrl, { waitUntil: 'networkidle' });
        try {
            await page.waitForSelector('input[type="password"]', { timeout: 10000 });
        }
        catch (error) {
            if (debug) {
                console.log('  ⚠️ Password field not found within 10 seconds');
                await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
                console.log('  📸 Debug screenshot saved: debug-login-page.png');
            }
            throw new Error('Login form not found - password field missing');
        }
        const claudeApiKey = process.env.INPUT_CLAUDE_API_KEY;
        if (claudeApiKey) {
            console.log('  🤖 Attempting LLM-powered authentication...');
            const llmSuccess = await (0, llm_browser_agent_1.authenticateWithLLM)(page, email, password, undefined, claudeApiKey, debug);
            if (llmSuccess) {
                console.log('  ✅ LLM authentication successful');
                return true;
            }
            else {
                console.log('  ⚠️ LLM authentication failed, trying smart strategies...');
            }
        }
        console.log('  🧠 Using smart authentication strategies...');
        const success = await (0, auth_strategies_1.executeAuthStrategies)(page, email, password, debug);
        return success;
    }
    catch (error) {
        console.error(`  ❌ Authentication error: ${error.message}`);
        return false;
    }
    finally {
        await page.close();
    }
}
if (require.main === module) {
    runVisualTests().catch(console.error);
}
