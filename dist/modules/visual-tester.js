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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const llm_browser_agent_1 = require("./llm-browser-agent");
const auth_strategies_1 = require("./auth-strategies");
const core_1 = require("../core");
const logger = (0, core_1.createModuleLogger)({
    module: 'VisualTester',
    defaultCategory: core_1.ErrorCategory.BROWSER
});
async function runVisualTests() {
    const previewUrl = core_1.config.get('preview-url', { required: true });
    const routesJson = core_1.config.get('routes', { defaultValue: '[]' });
    const viewportsStr = core_1.config.get('viewports', { defaultValue: '1920x1080' });
    const timeout = core_1.config.get('test-timeout', { defaultValue: '30s' });
    const debug = (0, core_1.getBooleanConfig)('debug');
    const authEmail = core_1.config.get('auth-email');
    const authPassword = core_1.config.get('auth-password');
    const authLoginUrl = core_1.config.get('auth-login-url', { defaultValue: '/login/password' });
    const claudeApiKey = core_1.config.getSecret('claude-api-key');
    if (!previewUrl) {
        await logger.error(new Error('Preview URL is required'), {
            severity: core_1.ErrorSeverity.CRITICAL,
            userAction: 'Start visual tests'
        });
        process.exit(1);
    }
    logger.info(`📸 Running visual tests on ${previewUrl}`);
    const routesResult = (0, core_1.safeJSONParse)(routesJson, {
        defaultValue: [{ path: '/', title: 'Home' }]
    });
    const routes = routesResult.data;
    const viewports = viewportsStr.split(',').map(vp => {
        const [width, height] = vp.split('x').map(Number);
        return {
            width: width || 1920,
            height: height || 1080,
            name: `${width}x${height}`
        };
    });
    logger.info(`🔍 Testing ${routes.length} routes across ${viewports.length} viewports`);
    const outputDir = '.yofix/screenshots';
    await (0, core_1.ensureDirectory)(outputDir);
    const browser = await playwright_1.chromium.launch({
        headless: true,
        timeout: (0, core_1.parseTimeout)(timeout)
    });
    const results = [];
    let screenshots = [];
    try {
        const context = await browser.newContext({
            userAgent: 'YoFix Visual Tester (Playwright)',
            viewport: { width: 1920, height: 1080 }
        });
        if (authEmail && authPassword) {
            logger.info(`🔐 Authenticating at ${authLoginUrl}...`);
            const authResult = await (0, core_1.executeOperation)(() => performAuthentication(context, previewUrl, authLoginUrl, authEmail, authPassword, claudeApiKey, debug), {
                name: 'Authentication',
                category: core_1.ErrorCategory.AUTHENTICATION,
                severity: core_1.ErrorSeverity.HIGH,
                metadata: { authLoginUrl }
            });
            if (!authResult.success || !authResult.data) {
                logger.warn('❌ Authentication failed - continuing with public routes');
            }
            else {
                logger.info('✅ Authentication successful');
            }
        }
        for (const route of routes) {
            logger.info(`\n📍 Testing route: ${route.path}`);
            for (const viewport of viewports) {
                const page = await context.newPage();
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                const result = await (0, core_1.executeOperation)(async () => {
                    const fullUrl = new URL(route.path, previewUrl).href;
                    if (debug) {
                        logger.debug(`  🌐 Navigating to: ${fullUrl}`);
                    }
                    await (0, core_1.retryOperation)(() => page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }), {
                        maxAttempts: 3,
                        delayMs: 2000,
                        onRetry: (attempt) => logger.debug(`Retry attempt ${attempt} for ${fullUrl}`)
                    });
                    await page.waitForTimeout(2000);
                    const currentUrl = page.url();
                    const wasRedirectedToLogin = currentUrl.includes('login') && !route.path.includes('login');
                    if (wasRedirectedToLogin) {
                        logger.warn(`  ⚠️ ${viewport.name} - Redirected to login (auth may have expired)`);
                        if (authEmail && authPassword) {
                            logger.info('  🔐 Re-authenticating...');
                            await page.close();
                            const authPage = await context.newPage();
                            const reAuthResult = await (0, core_1.executeOperation)(() => performAuthentication(context, previewUrl, authLoginUrl, authEmail, authPassword, claudeApiKey, debug), {
                                name: 'Re-authentication',
                                category: core_1.ErrorCategory.AUTHENTICATION,
                                severity: core_1.ErrorSeverity.MEDIUM
                            });
                            if (reAuthResult.success && reAuthResult.data) {
                                const retryPage = await context.newPage();
                                await retryPage.setViewportSize({ width: viewport.width, height: viewport.height });
                                await retryPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                await retryPage.waitForTimeout(2000);
                                const screenshotPath = path.join(outputDir, `${route.path.replace(/\//g, '-')}-${viewport.name}.png`);
                                await retryPage.screenshot({
                                    path: screenshotPath,
                                    fullPage: true
                                });
                                screenshots.push(screenshotPath);
                                logger.info(`  ✅ ${viewport.name} - Screenshot captured after re-auth`);
                                await retryPage.close();
                                return {
                                    route: route.path,
                                    viewport: viewport.name,
                                    screenshot: screenshotPath,
                                    status: 'warning',
                                    message: 'Required re-authentication'
                                };
                            }
                            await authPage.close();
                        }
                        return {
                            route: route.path,
                            viewport: viewport.name,
                            screenshot: '',
                            status: 'warning',
                            message: 'Authentication required'
                        };
                    }
                    const screenshotPath = path.join(outputDir, `${route.path.replace(/\//g, '-')}-${viewport.name}.png`);
                    await page.screenshot({
                        path: screenshotPath,
                        fullPage: true
                    });
                    screenshots.push(screenshotPath);
                    logger.info(`  ✅ ${viewport.name} - Screenshot captured`);
                    return {
                        route: route.path,
                        viewport: viewport.name,
                        screenshot: screenshotPath,
                        status: 'passed'
                    };
                }, {
                    name: `Test route ${route.path} at ${viewport.name}`,
                    category: core_1.ErrorCategory.BROWSER,
                    severity: core_1.ErrorSeverity.MEDIUM,
                    metadata: { route: route.path, viewport: viewport.name }
                });
                if (result.success && result.data) {
                    results.push(result.data);
                }
                else {
                    results.push({
                        route: route.path,
                        viewport: viewport.name,
                        screenshot: '',
                        status: 'failed',
                        message: result.error
                    });
                }
                await page.close();
            }
        }
        const statePath = path.join(outputDir, 'auth-state.json');
        if (authEmail && (await context.storageState()).cookies.length > 0) {
            await context.storageState({ path: statePath });
            logger.info(`\n💾 Saved authentication state to ${statePath}`);
        }
        await context.close();
        const summary = {
            total: results.length,
            passed: results.filter(r => r.status === 'passed').length,
            failed: results.filter(r => r.status === 'failed').length,
            warnings: results.filter(r => r.status === 'warning').length,
            results
        };
        fs.writeFileSync('.yofix/test-results.json', JSON.stringify(summary, null, 2));
        process.stdout.write(`::set-output name=screenshots::${JSON.stringify(screenshots)}\n`);
        process.stdout.write(`::set-output name=results::${JSON.stringify(summary)}\n`);
        logger.info(`\n✅ Visual testing completed: ${results.filter(r => r.status === 'passed').length}/${results.length} passed`);
    }
    catch (error) {
        await logger.error(error, {
            userAction: 'Run visual tests',
            severity: core_1.ErrorSeverity.CRITICAL
        });
        process.exit(1);
    }
    finally {
        await browser.close();
    }
}
async function performAuthentication(context, previewUrl, loginPath, email, password, claudeApiKey, debug) {
    const log = (0, core_1.createModuleLogger)({
        module: 'VisualTester.Auth',
        debug,
        defaultCategory: core_1.ErrorCategory.AUTHENTICATION
    });
    const page = await context.newPage();
    try {
        const loginUrl = new URL(loginPath, previewUrl).href;
        if (debug) {
            log.debug(`  🌐 Navigating to login: ${loginUrl}`);
        }
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const passwordField = await page.$('input[type="password"]');
        if (!passwordField) {
            if (debug) {
                log.debug('  ⚠️ Password field not found within 10 seconds');
                await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
                log.debug('  📸 Debug screenshot saved: debug-login-page.png');
            }
            await page.close();
            return false;
        }
        if (claudeApiKey) {
            log.info('  🤖 Attempting LLM-powered authentication...');
            const llmResult = await (0, core_1.executeOperation)(() => (0, llm_browser_agent_1.authenticateWithLLM)(page, email, password, loginUrl, claudeApiKey, debug), {
                name: 'LLM authentication',
                category: core_1.ErrorCategory.AUTHENTICATION,
                fallback: false
            });
            if (llmResult.success && llmResult.data) {
                log.info('  ✅ LLM authentication successful');
                return true;
            }
            else {
                log.warn('  ⚠️ LLM authentication failed, trying smart strategies...');
            }
        }
        log.info('  🧠 Using smart authentication strategies...');
        const success = await (0, auth_strategies_1.executeAuthStrategies)(page, email, password, debug);
        await page.close();
        return success;
    }
    catch (error) {
        await log.error(error, {
            userAction: 'Perform authentication',
            severity: core_1.ErrorSeverity.HIGH,
            metadata: { loginPath }
        });
        return false;
    }
}
if (require.main === module) {
    runVisualTests().catch(async (error) => {
        await logger.error(error, {
            userAction: 'Run visual tester module',
            severity: core_1.ErrorSeverity.CRITICAL
        });
        process.exit(1);
    });
}
