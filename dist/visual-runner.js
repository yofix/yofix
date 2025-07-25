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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualRunner = void 0;
const core = __importStar(require("@actions/core"));
const playwright_1 = require("playwright");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class VisualRunner {
    constructor(firebaseConfig, outputDir, testTimeoutMs = 300000) {
        this.browser = null;
        this.context = null;
        this.firebaseConfig = firebaseConfig;
        this.outputDir = outputDir;
        this.testTimeout = testTimeoutMs;
    }
    async initialize() {
        core.info('Initializing Playwright browser for React SPA testing...');
        try {
            await fs_1.promises.mkdir(this.outputDir, { recursive: true });
            this.browser = await playwright_1.chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-backgrounding-occluded-windows'
                ]
            });
            const videoDir = path_1.default.join(this.outputDir, 'videos-temp');
            await fs_1.promises.mkdir(videoDir, { recursive: true });
            this.context = await this.browser.newContext({
                ignoreHTTPSErrors: true,
                recordVideo: {
                    dir: videoDir,
                    size: { width: 1280, height: 720 }
                },
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1
            });
            this.context.setDefaultTimeout(this.testTimeout);
            this.context.setDefaultNavigationTimeout(this.testTimeout);
            core.info('Browser initialized successfully');
        }
        catch (error) {
            core.error(`Failed to initialize browser: ${error}`);
            throw error;
        }
    }
    async runTests(tests) {
        if (!this.context) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }
        const results = [];
        core.info(`Running ${tests.length} tests for React SPA verification...`);
        for (const test of tests) {
            try {
                core.info(`Starting test: ${test.name}`);
                const result = await this.runSingleTest(test);
                results.push(result);
                core.info(`Completed test: ${test.name} - ${result.status}`);
            }
            catch (error) {
                core.error(`Test ${test.name} failed with error: ${error}`);
                results.push({
                    testId: test.id,
                    testName: test.name,
                    status: 'failed',
                    duration: 0,
                    screenshots: [],
                    videos: [],
                    errors: [String(error)],
                    consoleMessages: []
                });
            }
        }
        return results;
    }
    async runSingleTest(test) {
        if (!this.context) {
            throw new Error('Browser context not available');
        }
        const startTime = Date.now();
        const page = await this.context.newPage();
        const consoleMessages = [];
        const errors = [];
        const screenshots = [];
        let videos = [];
        try {
            const hasVideo = page.video() !== null;
            core.info(`Test "${test.name}" - Video recording: ${hasVideo ? 'enabled' : 'disabled'}`);
            if (test.viewport) {
                await page.setViewportSize({
                    width: test.viewport.width,
                    height: test.viewport.height
                });
            }
            page.on('console', (msg) => {
                consoleMessages.push({
                    type: msg.type(),
                    text: msg.text(),
                    timestamp: Date.now()
                });
            });
            page.on('pageerror', (error) => {
                errors.push(`Page Error: ${error.message}`);
            });
            page.on('requestfailed', (request) => {
                errors.push(`Failed Request: ${request.url()} - ${request.failure()?.errorText}`);
            });
            for (const action of test.actions) {
                await this.executeAction(page, action);
            }
            await this.waitForReactSPAReady(page);
            let allAssertionsPassed = true;
            for (const assertion of test.assertions) {
                try {
                    await this.executeAssertion(page, assertion);
                }
                catch (assertionError) {
                    allAssertionsPassed = false;
                    errors.push(`Assertion failed: ${assertionError}`);
                }
            }
            const screenshotName = `${test.id}-${test.viewport?.name || 'default'}-final.png`;
            const screenshotPath = path_1.default.join(this.outputDir, 'screenshots', screenshotName);
            await fs_1.promises.mkdir(path_1.default.dirname(screenshotPath), { recursive: true });
            await page.screenshot({
                path: screenshotPath,
                fullPage: true,
                type: 'png'
            });
            screenshots.push({
                name: screenshotName,
                path: screenshotPath,
                viewport: test.viewport || { width: 1920, height: 1080, name: 'default' },
                timestamp: Date.now()
            });
            const video = page.video();
            if (video) {
                core.info(`Video recording detected for test: ${test.name}`);
                await page.close();
                try {
                    const videoPath = await video.path();
                    core.info(`Video path obtained: ${videoPath}`);
                    if (videoPath) {
                        const videoName = `${test.id}-${test.viewport?.width}x${test.viewport?.height}.webm`;
                        const finalVideoPath = path_1.default.join(this.outputDir, 'videos', videoName);
                        await fs_1.promises.mkdir(path_1.default.dirname(finalVideoPath), { recursive: true });
                        core.info('Waiting for video to be fully written...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        try {
                            await fs_1.promises.access(videoPath);
                            const sourceStats = await fs_1.promises.stat(videoPath);
                            core.info(`Source video size: ${sourceStats.size} bytes`);
                            if (sourceStats.size > 0) {
                                await fs_1.promises.copyFile(videoPath, finalVideoPath);
                                const stats = await fs_1.promises.stat(finalVideoPath);
                                if (stats.size > 0) {
                                    videos.push({
                                        name: videoName,
                                        path: finalVideoPath,
                                        duration: Date.now() - startTime,
                                        timestamp: startTime
                                    });
                                    core.info(`Video saved successfully: ${videoName} (${stats.size} bytes)`);
                                }
                                else {
                                    core.warning(`Video file is empty after copy: ${videoName}`);
                                }
                            }
                            else {
                                core.warning(`Source video file is empty: ${videoPath}`);
                            }
                        }
                        catch (videoError) {
                            core.warning(`Failed to save video ${videoName}: ${videoError}`);
                        }
                    }
                    else {
                        core.warning('Video path is null');
                    }
                }
                catch (error) {
                    core.warning(`Failed to process video: ${error}`);
                }
            }
            else {
                core.info('No video recording for this test');
                await page.close();
            }
            return {
                testId: test.id,
                testName: test.name,
                status: allAssertionsPassed && errors.length === 0 ? 'passed' : 'failed',
                duration: Date.now() - startTime,
                screenshots,
                videos,
                errors,
                consoleMessages
            };
        }
        catch (error) {
            await page.close();
            throw error;
        }
    }
    async executeAction(page, action) {
        const timeout = action.timeout || 30000;
        switch (action.type) {
            case 'goto':
                core.info(`Navigating to: ${action.target}`);
                await page.goto(action.target, {
                    waitUntil: 'networkidle',
                    timeout
                });
                await this.waitForReactSPAReady(page);
                break;
            case 'click':
                core.info(`Clicking: ${action.target}`);
                await page.click(action.target, { timeout });
                await page.waitForTimeout(1000);
                break;
            case 'fill':
                core.info(`Filling: ${action.target} with ${action.value}`);
                await page.fill(action.target, action.value, { timeout });
                break;
            case 'select':
                core.info(`Selecting: ${action.value} in ${action.target}`);
                await page.selectOption(action.target, action.value, { timeout });
                break;
            case 'wait':
                if (action.target) {
                    core.info(`Waiting for element: ${action.target}`);
                    await page.waitForSelector(action.target, { timeout });
                }
                else {
                    core.info(`Waiting for: ${timeout}ms`);
                    await page.waitForTimeout(timeout);
                }
                break;
            case 'scroll':
                core.info(`Scrolling to: ${action.target}`);
                if (action.target) {
                    await page.locator(action.target).scrollIntoViewIfNeeded({ timeout });
                }
                else {
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                }
                break;
            default:
                core.warning(`Unknown action type: ${action.type}`);
        }
    }
    async executeAssertion(page, assertion) {
        const timeout = assertion.timeout || 10000;
        switch (assertion.type) {
            case 'visible':
                await page.waitForSelector(assertion.target, {
                    state: 'visible',
                    timeout
                });
                break;
            case 'hidden':
                await page.waitForSelector(assertion.target, {
                    state: 'hidden',
                    timeout
                });
                break;
            case 'text':
                if (assertion.expected) {
                    const element = page.locator(assertion.target);
                    await element.waitFor({ timeout });
                    const text = await element.textContent();
                    if (!text?.includes(assertion.expected)) {
                        throw new Error(`Expected text "${assertion.expected}" not found in "${text}"`);
                    }
                }
                break;
            case 'url':
                await page.waitForFunction((expectedUrl) => window.location.href.includes(expectedUrl), assertion.target, { timeout });
                break;
            case 'attribute':
                const element = page.locator(assertion.target);
                await element.waitFor({ timeout });
                const attr = await element.getAttribute(assertion.expected);
                if (!attr) {
                    throw new Error(`Attribute "${assertion.expected}" not found`);
                }
                break;
            default:
                core.warning(`Unknown assertion type: ${assertion.type}`);
        }
    }
    async waitForReactSPAReady(page) {
        core.info('Waiting for React SPA to be ready and hydrated...');
        try {
            await page.waitForFunction(() => {
                const root = document.querySelector('#root, #app, [data-reactroot]');
                return root && root.children.length > 0;
            }, { timeout: 15000 });
            await page.waitForLoadState('networkidle', { timeout: 10000 });
            if (this.firebaseConfig.buildSystem === 'vite') {
                await page.waitForFunction(() => {
                    return !document.querySelector('vite-error-overlay') &&
                        window.performance.getEntriesByType('navigation')[0]?.loadEventEnd > 0;
                }, { timeout: 10000 });
            }
            else {
                await page.waitForFunction(() => {
                    return document.readyState === 'complete' &&
                        window.performance.getEntriesByType('navigation')[0]?.loadEventEnd > 0;
                }, { timeout: 10000 });
            }
            await page.waitForTimeout(2000);
            core.info('React SPA is ready and hydrated');
        }
        catch (error) {
            core.warning(`React SPA ready check failed: ${error}. Continuing with test...`);
        }
    }
    async takeScreenshot(page, name, viewport) {
        const screenshotName = `${name}.png`;
        const screenshotPath = path_1.default.join(this.outputDir, 'screenshots', screenshotName);
        await fs_1.promises.mkdir(path_1.default.dirname(screenshotPath), { recursive: true });
        await page.screenshot({
            path: screenshotPath,
            fullPage: true,
            type: 'png',
            animations: 'disabled'
        });
        return {
            name: screenshotName,
            path: screenshotPath,
            viewport: viewport || { width: 1920, height: 1080, name: 'default' },
            timestamp: Date.now()
        };
    }
    async cleanup() {
        core.info('Cleaning up browser resources...');
        try {
            if (this.context) {
                await this.context.close();
                this.context = null;
            }
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            core.info('Browser cleanup completed');
        }
        catch (error) {
            core.warning(`Browser cleanup failed: ${error}`);
        }
    }
}
exports.VisualRunner = VisualRunner;
