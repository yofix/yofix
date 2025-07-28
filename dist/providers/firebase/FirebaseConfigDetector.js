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
exports.FirebaseConfigDetector = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
class FirebaseConfigDetector {
    constructor(githubToken) {
        this.octokit = (0, github_1.getOctokit)(githubToken);
    }
    async getFirebaseConfig() {
        try {
            const context = require('@actions/github').context;
            const { owner, repo } = context.repo;
            const ref = context.payload.pull_request?.head?.sha || context.sha;
            core.info('Fetching firebase.json from repository...');
            const response = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'firebase.json',
                ref
            });
            if ('content' in response.data) {
                const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
                const firebaseConfig = JSON.parse(content);
                core.info('Successfully parsed firebase.json');
                return firebaseConfig;
            }
            return null;
        }
        catch (error) {
            core.warning(`Could not fetch firebase.json: ${error}`);
            return null;
        }
    }
    detectBuildSystemFromConfig(config, targetName) {
        if (!config.hosting) {
            return null;
        }
        const hostingConfig = targetName
            ? config.hosting.find(h => h.target === targetName)
            : config.hosting[0];
        if (!hostingConfig) {
            return null;
        }
        const publicDir = hostingConfig.public;
        if (publicDir === 'dist') {
            core.info('Detected Vite build system from firebase.json (public: "dist")');
            return 'vite';
        }
        if (publicDir === 'build') {
            core.info('Detected React build system from firebase.json (public: "build")');
            return 'react';
        }
        core.info(`Unknown build system from public directory: ${publicDir}`);
        return null;
    }
    getAvailableTargets(config) {
        if (!config.hosting) {
            return [];
        }
        return config.hosting
            .map(h => h.target)
            .filter((target) => target !== undefined);
    }
    detectTargetFromUrl(config, previewUrl) {
        const targets = this.getAvailableTargets(config);
        if (targets.length === 0) {
            return null;
        }
        const urlMatch = previewUrl.match(/--pr-\d+-([^.]+)\.web\.app/);
        if (urlMatch) {
            const urlTarget = urlMatch[1];
            if (targets.includes(urlTarget)) {
                core.info(`Matched URL target "${urlTarget}" with firebase.json configuration`);
                return urlTarget;
            }
        }
        core.info(`Using default target "${targets[0]}" from firebase.json`);
        return targets[0];
    }
    async detectFirebaseConfiguration(previewUrl) {
        let urlMatch = previewUrl.match(/^https:\/\/([^-]+)--pr-(\d+)-([^.]+)\.web\.app/);
        if (!urlMatch) {
            urlMatch = previewUrl.match(/^https:\/\/([^.]+)\.web\.app/);
            if (urlMatch) {
                const fullProjectId = urlMatch[1];
                const parts = fullProjectId.split('--');
                if (parts.length >= 2) {
                    const projectId = parts[0];
                    const prMatch = parts[1].match(/pr-(\d+)-(.+)/);
                    if (prMatch) {
                        return {
                            projectId,
                            target: prMatch[2] || 'default',
                            buildSystem: 'react',
                            hasMultipleTargets: false,
                            availableTargets: []
                        };
                    }
                }
            }
            throw new Error(`Invalid Firebase preview URL format: ${previewUrl}`);
        }
        const [, projectId, prNumber, urlTarget] = urlMatch;
        const firebaseConfig = await this.getFirebaseConfig();
        let finalTarget = urlTarget;
        let buildSystem = 'react';
        let availableTargets = [];
        let hasMultipleTargets = false;
        if (firebaseConfig) {
            availableTargets = this.getAvailableTargets(firebaseConfig);
            hasMultipleTargets = availableTargets.length > 1;
            const detectedTarget = this.detectTargetFromUrl(firebaseConfig, previewUrl);
            if (detectedTarget) {
                finalTarget = detectedTarget;
            }
            const detectedBuildSystem = this.detectBuildSystemFromConfig(firebaseConfig, finalTarget);
            if (detectedBuildSystem) {
                buildSystem = detectedBuildSystem;
            }
            core.info(`Firebase configuration analysis:
        - Available targets: ${availableTargets.join(', ')}
        - Selected target: ${finalTarget}
        - Build system: ${buildSystem}
        - Multiple targets: ${hasMultipleTargets}`);
        }
        else {
            core.warning('No firebase.json found, using URL-based detection');
            if (previewUrl.includes('dist') || urlTarget.includes('app')) {
                buildSystem = 'vite';
            }
        }
        return {
            projectId,
            target: finalTarget,
            buildSystem,
            hasMultipleTargets,
            availableTargets
        };
    }
    async getPackageJsonInfo() {
        try {
            const context = require('@actions/github').context;
            const { owner, repo } = context.repo;
            const ref = context.payload.pull_request?.head?.sha || context.sha;
            const response = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'package.json',
                ref
            });
            if ('content' in response.data) {
                const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
                const packageJson = JSON.parse(content);
                const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
                return {
                    hasVite: 'vite' in dependencies,
                    hasReactScripts: 'react-scripts' in dependencies,
                    buildScript: packageJson.scripts?.build
                };
            }
            return null;
        }
        catch (error) {
            core.warning(`Could not fetch package.json: ${error}`);
            return null;
        }
    }
    async detectBuildSystemComprehensive(previewUrl, targetName) {
        core.info('Running comprehensive build system detection...');
        const firebaseConfig = await this.getFirebaseConfig();
        if (firebaseConfig) {
            const configBasedDetection = this.detectBuildSystemFromConfig(firebaseConfig, targetName);
            if (configBasedDetection) {
                return configBasedDetection;
            }
        }
        const packageInfo = await this.getPackageJsonInfo();
        if (packageInfo) {
            if (packageInfo.hasVite) {
                core.info('Detected Vite build system from package.json dependencies');
                return 'vite';
            }
            if (packageInfo.hasReactScripts) {
                core.info('Detected React Scripts build system from package.json dependencies');
                return 'react';
            }
            if (packageInfo.buildScript) {
                if (packageInfo.buildScript.includes('vite')) {
                    core.info('Detected Vite build system from build script');
                    return 'vite';
                }
            }
        }
        if (previewUrl.includes('--pr-') && previewUrl.includes('-app.web.app')) {
            core.info('Detected Vite build system from URL pattern (likely loop-frontend)');
            return 'vite';
        }
        core.info('Defaulting to React build system');
        return 'react';
    }
}
exports.FirebaseConfigDetector = FirebaseConfigDetector;
