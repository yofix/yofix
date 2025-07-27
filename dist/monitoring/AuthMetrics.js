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
exports.authMonitor = exports.AuthMonitor = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const crypto_1 = require("crypto");
class AuthMonitor {
    constructor() {
        this.attempts = [];
        this.maxAttempts = 100;
    }
    recordAttempt(attempt) {
        const fullAttempt = {
            ...attempt,
            timestamp: Date.now(),
            anonymizedDomain: this.anonymizeDomain(attempt.url)
        };
        this.attempts.push(fullAttempt);
        if (this.attempts.length > this.maxAttempts) {
            this.attempts = this.attempts.slice(-this.maxAttempts);
        }
        if (attempt.success) {
            core.info(`✅ Auth succeeded using ${attempt.method} method (${attempt.duration}ms)`);
        }
        else {
            core.warning(`❌ Auth failed using ${attempt.method} method: ${attempt.errorType} (${attempt.duration}ms)`);
        }
        this.publishMetrics();
    }
    getMetrics() {
        const totalAttempts = this.attempts.length;
        const successfulAttempts = this.attempts.filter(a => a.success).length;
        const failedAttempts = totalAttempts - successfulAttempts;
        const methodBreakdown = {
            selector: this.getMethodStats('selector'),
            smart: this.getMethodStats('smart'),
            fallback: this.getMethodStats('fallback')
        };
        const commonErrors = {};
        const domainFailures = {};
        this.attempts.forEach(attempt => {
            if (!attempt.success && attempt.errorType) {
                commonErrors[attempt.errorType] = (commonErrors[attempt.errorType] || 0) + 1;
                if (attempt.anonymizedDomain) {
                    domainFailures[attempt.anonymizedDomain] = (domainFailures[attempt.anonymizedDomain] || 0) + 1;
                }
            }
        });
        const problemDomains = Object.entries(domainFailures)
            .filter(([_, failures]) => failures > 2)
            .map(([domain]) => domain);
        const durations = this.attempts.map(a => a.duration);
        const averageDuration = durations.length > 0
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : 0;
        return {
            totalAttempts,
            successfulAttempts,
            failedAttempts,
            successRate: totalAttempts > 0 ? Math.round((successfulAttempts / totalAttempts) * 100) : 0,
            averageDuration,
            methodBreakdown,
            commonErrors,
            problemDomains
        };
    }
    generateFeedbackReport() {
        const metrics = this.getMetrics();
        let report = `## 📊 Authentication Metrics\n\n`;
        report += `- **Success Rate**: ${metrics.successRate}% (${metrics.successfulAttempts}/${metrics.totalAttempts})\n`;
        report += `- **Average Duration**: ${metrics.averageDuration}ms\n\n`;
        report += `### Method Performance\n`;
        report += `- Selector-based: ${this.formatMethodStats(metrics.methodBreakdown.selector)}\n`;
        report += `- Smart AI: ${this.formatMethodStats(metrics.methodBreakdown.smart)}\n`;
        report += `- Fallback: ${this.formatMethodStats(metrics.methodBreakdown.fallback)}\n\n`;
        if (Object.keys(metrics.commonErrors).length > 0) {
            report += `### Common Errors\n`;
            Object.entries(metrics.commonErrors)
                .sort(([, a], [, b]) => b - a)
                .forEach(([error, count]) => {
                report += `- ${error}: ${count} occurrences\n`;
            });
            report += '\n';
        }
        if (metrics.problemDomains.length > 0) {
            report += `### Problem Domains\n`;
            report += `The following anonymized domains have high failure rates:\n`;
            metrics.problemDomains.forEach(domain => {
                report += `- ${domain}\n`;
            });
            report += '\n💡 Consider adding custom handling for these domains.\n';
        }
        if (metrics.successRate < 80) {
            report += `\n### 🔧 Recommendations\n`;
            if (metrics.methodBreakdown.smart.attempts === 0) {
                report += `- Enable Smart AI authentication for better success rates\n`;
            }
            if (metrics.commonErrors['Could not find email input field'] > 2) {
                report += `- Many sites have non-standard email fields - consider upgrading to Smart mode\n`;
            }
            if (metrics.averageDuration > 10000) {
                report += `- Authentication is taking long - consider optimizing wait times\n`;
            }
        }
        return report;
    }
    publishMetrics() {
        const metrics = this.getMetrics();
        core.setOutput('auth-success-rate', metrics.successRate);
        core.setOutput('auth-metrics', JSON.stringify(metrics));
        if (metrics.totalAttempts > 5 && metrics.successRate < 70) {
            core.warning(`Authentication success rate is low: ${metrics.successRate}%`);
        }
    }
    async createFeedbackIssue() {
        const metrics = this.getMetrics();
        if (metrics.totalAttempts < 10 || metrics.successRate > 85) {
            return;
        }
        try {
            const octokit = github.getOctokit(process.env.GITHUB_TOKEN || '');
            const report = this.generateFeedbackReport();
            await octokit.rest.issues.create({
                owner: 'yofix',
                repo: 'yofix',
                title: `Auth Handler Feedback: ${metrics.successRate}% success rate`,
                body: report + '\n\n*This issue was automatically generated from anonymous usage data*',
                labels: ['feedback', 'auth-handler']
            });
            core.info('📝 Feedback issue created for auth handler improvements');
        }
        catch (error) {
            core.debug(`Could not create feedback issue: ${error}`);
        }
    }
    getMethodStats(method) {
        const methodAttempts = this.attempts.filter(a => a.method === method);
        return {
            attempts: methodAttempts.length,
            success: methodAttempts.filter(a => a.success).length
        };
    }
    formatMethodStats(stats) {
        if (stats.attempts === 0)
            return 'Not used';
        const rate = Math.round((stats.success / stats.attempts) * 100);
        return `${rate}% success (${stats.success}/${stats.attempts})`;
    }
    anonymizeDomain(url) {
        try {
            const domain = new URL(url).hostname;
            const hash = (0, crypto_1.createHash)('sha256').update(domain).digest('hex');
            return `domain-${hash.substring(0, 8)}`;
        }
        catch {
            return 'unknown-domain';
        }
    }
}
exports.AuthMonitor = AuthMonitor;
exports.authMonitor = new AuthMonitor();
