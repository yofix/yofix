import * as core from '@actions/core';
import * as github from '@actions/github';
import { createHash } from 'crypto';

export interface AuthAttempt {
  timestamp: number;
  success: boolean;
  method: 'selector' | 'smart' | 'fallback';
  url: string;
  errorType?: string;
  selectorsTried?: number;
  duration: number;
  anonymizedDomain?: string;
}

export interface AuthMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRate: number;
  averageDuration: number;
  methodBreakdown: {
    selector: { attempts: number; success: number };
    smart: { attempts: number; success: number };
    fallback: { attempts: number; success: number };
  };
  commonErrors: Record<string, number>;
  problemDomains: string[];
}

/**
 * Monitors authentication attempts and provides feedback
 */
export class AuthMonitor {
  private attempts: AuthAttempt[] = [];
  private readonly maxAttempts = 100; // Keep last 100 attempts in memory

  /**
   * Record an authentication attempt
   */
  recordAttempt(attempt: Omit<AuthAttempt, 'timestamp' | 'anonymizedDomain'>): void {
    const fullAttempt: AuthAttempt = {
      ...attempt,
      timestamp: Date.now(),
      anonymizedDomain: this.anonymizeDomain(attempt.url)
    };

    this.attempts.push(fullAttempt);
    
    // Keep only recent attempts
    if (this.attempts.length > this.maxAttempts) {
      this.attempts = this.attempts.slice(-this.maxAttempts);
    }

    // Log the attempt
    if (attempt.success) {
      core.info(`✅ Auth succeeded using ${attempt.method} method (${attempt.duration}ms)`);
    } else {
      core.warning(`❌ Auth failed using ${attempt.method} method: ${attempt.errorType} (${attempt.duration}ms)`);
    }

    // Post metrics as workflow output
    this.publishMetrics();
  }

  /**
   * Get current metrics
   */
  getMetrics(): AuthMetrics {
    const totalAttempts = this.attempts.length;
    const successfulAttempts = this.attempts.filter(a => a.success).length;
    const failedAttempts = totalAttempts - successfulAttempts;
    
    const methodBreakdown = {
      selector: this.getMethodStats('selector'),
      smart: this.getMethodStats('smart'),
      fallback: this.getMethodStats('fallback')
    };

    const commonErrors: Record<string, number> = {};
    const domainFailures: Record<string, number> = {};

    this.attempts.forEach(attempt => {
      if (!attempt.success && attempt.errorType) {
        commonErrors[attempt.errorType] = (commonErrors[attempt.errorType] || 0) + 1;
        
        if (attempt.anonymizedDomain) {
          domainFailures[attempt.anonymizedDomain] = (domainFailures[attempt.anonymizedDomain] || 0) + 1;
        }
      }
    });

    // Find domains with high failure rates
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

  /**
   * Generate feedback report
   */
  generateFeedbackReport(): string {
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

    // Recommendations
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

  /**
   * Post metrics to GitHub Action outputs
   */
  private publishMetrics(): void {
    const metrics = this.getMetrics();
    
    core.setOutput('auth-success-rate', metrics.successRate);
    core.setOutput('auth-metrics', JSON.stringify(metrics));
    
    // If success rate is low, post a warning
    if (metrics.totalAttempts > 5 && metrics.successRate < 70) {
      core.warning(`Authentication success rate is low: ${metrics.successRate}%`);
    }
  }

  /**
   * Create anonymous feedback issue if patterns detected
   */
  async createFeedbackIssue(): Promise<void> {
    const metrics = this.getMetrics();
    
    // Only create issue if we have enough data and problems
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
    } catch (error) {
      core.debug(`Could not create feedback issue: ${error}`);
    }
  }

  /**
   * Get stats for a specific method
   */
  private getMethodStats(method: AuthAttempt['method']) {
    const methodAttempts = this.attempts.filter(a => a.method === method);
    return {
      attempts: methodAttempts.length,
      success: methodAttempts.filter(a => a.success).length
    };
  }

  /**
   * Format method stats for display
   */
  private formatMethodStats(stats: { attempts: number; success: number }): string {
    if (stats.attempts === 0) return 'Not used';
    const rate = Math.round((stats.success / stats.attempts) * 100);
    return `${rate}% success (${stats.success}/${stats.attempts})`;
  }

  /**
   * Anonymize domain for privacy
   */
  private anonymizeDomain(url: string): string {
    try {
      const domain = new URL(url).hostname;
      const hash = createHash('sha256').update(domain).digest('hex');
      return `domain-${hash.substring(0, 8)}`;
    } catch {
      return 'unknown-domain';
    }
  }
}

// Global instance
export const authMonitor = new AuthMonitor();