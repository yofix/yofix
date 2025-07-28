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
exports.FirebaseUrlHandler = void 0;
const core = __importStar(require("@actions/core"));
const FirebaseConfigDetector_1 = require("./FirebaseConfigDetector");
class FirebaseUrlHandler {
    static parseFirebaseUrl(previewUrl) {
        core.info(`Parsing Firebase URL: ${previewUrl}`);
        const previewMatch = previewUrl.match(this.FIREBASE_PREVIEW_REGEX);
        if (previewMatch) {
            const [, projectId = '', prNumber = '', target = 'default'] = previewMatch;
            core.info(`Detected Firebase preview deployment - Project: ${projectId}, PR: ${prNumber}, Target: ${target}`);
            return {
                projectId,
                target,
                previewUrl
            };
        }
        const combinedMatch = previewUrl.match(this.FIREBASE_COMBINED_REGEX);
        if (combinedMatch) {
            const [, projectId = '', prNumber = '', target = 'default'] = combinedMatch;
            core.info(`Detected Firebase preview deployment (combined format) - Project: ${projectId}, PR: ${prNumber}, Target: ${target}`);
            return {
                projectId,
                target,
                previewUrl
            };
        }
        const mainMatch = previewUrl.match(this.FIREBASE_MAIN_REGEX);
        if (mainMatch) {
            const [, fullProjectId = ''] = mainMatch;
            if (fullProjectId.includes('--pr-')) {
                const parts = fullProjectId.split('--pr-');
                const projectId = parts[0];
                const prPart = parts[1];
                const targetMatch = prPart.match(/(\d+)-(.+)/);
                if (targetMatch) {
                    const [, prNumber, target] = targetMatch;
                    core.info(`Detected Firebase main deployment with PR info - Project: ${projectId}`);
                    return {
                        projectId,
                        target,
                        previewUrl
                    };
                }
            }
            core.info(`Detected Firebase main deployment - Project: ${fullProjectId}`);
            return {
                projectId: fullProjectId,
                target: 'default',
                previewUrl
            };
        }
        throw new Error(`Invalid Firebase URL format: ${previewUrl}. Expected format: https://project--pr-123-target.web.app`);
    }
    static async detectBuildSystem(previewUrl) {
        try {
            core.info('Detecting build system from Firebase deployment...');
            const response = await fetch(previewUrl, {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0'
                }
            });
            if (!response.ok) {
                core.warning(`Firebase deployment not yet accessible (${response.status}). Will retry...`);
                return 'react';
            }
            const htmlResponse = await fetch(previewUrl, {
                headers: {
                    'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0'
                }
            });
            if (htmlResponse.ok) {
                const html = await htmlResponse.text();
                if (html.includes('/@vite/') ||
                    html.includes('vite:preload') ||
                    html.includes('"type":"module"') ||
                    html.includes('/assets/index-') && html.includes('.js')) {
                    core.info('Detected Vite build system');
                    return 'vite';
                }
            }
            core.info('Detected standard React build system');
            return 'react';
        }
        catch (error) {
            core.warning(`Failed to detect build system: ${error}. Defaulting to React.`);
            return 'react';
        }
    }
    static async waitForDeployment(previewUrl, timeoutMs = this.MAX_DEPLOYMENT_WAIT_TIME) {
        core.info(`Waiting for Firebase deployment to be ready: ${previewUrl}`);
        const startTime = Date.now();
        let attempts = 0;
        while (Date.now() - startTime < timeoutMs) {
            attempts++;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(previewUrl, {
                    method: 'HEAD',
                    headers: {
                        'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0'
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (response.ok) {
                    core.info(`Firebase deployment is ready after ${attempts} attempts (${Date.now() - startTime}ms)`);
                    return;
                }
                if (response.status === 404) {
                    core.info(`Deployment not found (404) - attempt ${attempts}. Firebase may still be deploying...`);
                }
                else {
                    core.info(`Deployment returned status ${response.status} - attempt ${attempts}`);
                }
            }
            catch (error) {
                core.info(`Deployment check failed - attempt ${attempts}: ${error}`);
            }
            await new Promise(resolve => setTimeout(resolve, this.DEPLOYMENT_CHECK_INTERVAL));
        }
        throw new Error(`Firebase deployment did not become accessible within ${timeoutMs / 1000} seconds. Last URL checked: ${previewUrl}`);
    }
    static async verifyReactSPA(previewUrl) {
        core.info('Verifying React SPA is properly loaded...');
        try {
            const response = await fetch(previewUrl, {
                headers: {
                    'User-Agent': 'GitHub-Actions-Runtime-Verification/1.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch SPA: HTTP ${response.status}`);
            }
            const html = await response.text();
            if (!html.includes('id="root"') && !html.includes('id="app"')) {
                core.warning('No React root element found. SPA may not be properly configured.');
            }
            if (html.includes('react-router') || html.includes('Router')) {
                core.info('React Router detected - will test client-side navigation');
            }
            if (html.includes('react') || html.includes('React')) {
                core.info('React framework detected in HTML');
            }
            core.info('React SPA verification completed');
        }
        catch (error) {
            core.warning(`React SPA verification failed: ${error}. Proceeding with testing...`);
        }
    }
    static async createFirebaseConfig(previewUrl, githubToken, projectIdOverride, targetOverride, buildSystemOverride) {
        await this.waitForDeployment(previewUrl);
        let config;
        if (buildSystemOverride && projectIdOverride && targetOverride) {
            config = {
                projectId: projectIdOverride,
                target: targetOverride,
                buildSystem: buildSystemOverride,
                previewUrl,
                region: 'us-central1'
            };
        }
        else {
            const detector = new FirebaseConfigDetector_1.FirebaseConfigDetector(githubToken);
            try {
                const detectedConfig = await detector.detectFirebaseConfiguration(previewUrl);
                config = {
                    projectId: projectIdOverride || detectedConfig.projectId,
                    target: targetOverride || detectedConfig.target,
                    buildSystem: buildSystemOverride || detectedConfig.buildSystem,
                    previewUrl,
                    region: 'us-central1'
                };
                if (detectedConfig.hasMultipleTargets) {
                    core.info(`Multiple Firebase targets detected: ${detectedConfig.availableTargets.join(', ')}`);
                }
            }
            catch (error) {
                core.warning(`Enhanced detection failed: ${error}. Falling back to URL parsing.`);
                const urlInfo = this.parseFirebaseUrl(previewUrl);
                const buildSystem = buildSystemOverride || await this.detectBuildSystem(previewUrl);
                config = {
                    projectId: projectIdOverride || urlInfo.projectId || 'unknown',
                    target: targetOverride || urlInfo.target || 'default',
                    buildSystem,
                    previewUrl,
                    region: 'us-central1'
                };
            }
        }
        await this.verifyReactSPA(previewUrl);
        core.info(`Firebase configuration created: ${JSON.stringify(config, null, 2)}`);
        return config;
    }
}
exports.FirebaseUrlHandler = FirebaseUrlHandler;
FirebaseUrlHandler.FIREBASE_PREVIEW_REGEX = /^https:\/\/([^-]+)--pr-(\d+)-([^.]+)\.web\.app\/?/;
FirebaseUrlHandler.FIREBASE_MAIN_REGEX = /^https:\/\/([^.]+)\.web\.app\/?/;
FirebaseUrlHandler.FIREBASE_COMBINED_REGEX = /^https:\/\/(.+?)--pr-(\d+)-([^.]+)\.web\.app\/?/;
FirebaseUrlHandler.MAX_DEPLOYMENT_WAIT_TIME = 10 * 60 * 1000;
FirebaseUrlHandler.DEPLOYMENT_CHECK_INTERVAL = 30 * 1000;
