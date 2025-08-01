"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReliabilityScorer = void 0;
class ReliabilityScorer {
    calculateReliability(plan, result, verifications, state) {
        const metrics = this.calculateMetrics(result, state);
        const factors = this.calculateFactors(plan, metrics, verifications);
        const issues = this.identifyIssues(plan, result, verifications);
        const recommendations = this.generateRecommendations(factors, issues);
        const overall = this.calculateOverallScore(factors);
        return {
            overall,
            factors,
            issues,
            recommendations
        };
    }
    calculateMetrics(result, state) {
        const successfulActions = result.steps.filter(s => s.result.success).length;
        const failedActions = result.steps.filter(s => !s.result.success).length;
        const actionCounts = new Map();
        result.steps.forEach(step => {
            const key = `${step.action}-${JSON.stringify(step.parameters)}`;
            actionCounts.set(key, (actionCounts.get(key) || 0) + 1);
        });
        const retryCount = Array.from(actionCounts.values()).filter(count => count > 1).length;
        const confidences = result.steps
            .map(s => this.extractConfidence(s.thinking || ''))
            .filter(c => c > 0);
        const averageConfidence = confidences.length > 0
            ? confidences.reduce((a, b) => a + b) / confidences.length
            : 0.5;
        return {
            totalActions: result.steps.length,
            successfulActions,
            failedActions,
            retryCount,
            averageConfidence,
            timeToComplete: result.duration
        };
    }
    calculateFactors(plan, metrics, verifications) {
        const requiredSteps = plan.steps.filter(s => s.required);
        const completedRequired = verifications.filter(v => {
            const step = plan.steps.find(s => s.id === v.stepId);
            return step?.required && v.success;
        }).length;
        const taskCompleteness = requiredSteps.length > 0
            ? completedRequired / requiredSteps.length
            : 0;
        const actionSuccess = metrics.totalActions > 0
            ? metrics.successfulActions / metrics.totalActions
            : 0;
        const verificationConfidence = verifications.length > 0
            ? verifications.reduce((sum, v) => sum + v.confidence, 0) / verifications.length
            : 0;
        const errorRecovery = metrics.retryCount === 0
            ? 1.0
            : Math.max(0.5, 1 - (metrics.retryCount * 0.1));
        const plannedActions = plan.steps.map(s => s.action);
        const executedActions = verifications.map(v => {
            const step = plan.steps.find(s => s.id === v.stepId);
            return step?.action;
        }).filter(a => a);
        const consistency = this.calculateConsistency(plannedActions, executedActions);
        return {
            taskCompleteness,
            actionSuccess,
            verificationConfidence,
            errorRecovery,
            consistency
        };
    }
    calculateOverallScore(factors) {
        const weights = {
            taskCompleteness: 0.35,
            verificationConfidence: 0.25,
            actionSuccess: 0.20,
            consistency: 0.15,
            errorRecovery: 0.05
        };
        let score = 0;
        for (const [factor, weight] of Object.entries(weights)) {
            score += factors[factor] * weight;
        }
        return Math.round(score * 100) / 100;
    }
    identifyIssues(plan, result, verifications) {
        const issues = [];
        const incompleteRequired = plan.steps
            .filter(s => s.required)
            .filter(s => !verifications.find(v => v.stepId === s.id && v.success));
        if (incompleteRequired.length > 0) {
            issues.push(`Incomplete required steps: ${incompleteRequired.map(s => s.description).join(', ')}`);
        }
        const failedSteps = result.steps.filter(s => !s.result.success);
        if (failedSteps.length > 0) {
            issues.push(`${failedSteps.length} actions failed during execution`);
        }
        const lowConfidence = verifications.filter(v => v.confidence < 0.7);
        if (lowConfidence.length > 0) {
            issues.push(`Low confidence in ${lowConfidence.length} step verifications`);
        }
        const unmetCriteria = verifications
            .flatMap(v => v.criteriaResults)
            .filter(c => !c.met);
        if (unmetCriteria.length > 0) {
            issues.push(`${unmetCriteria.length} success criteria not met`);
        }
        const retryActions = result.steps.filter((step, idx) => result.steps.slice(0, idx).some(s => s.action === step.action &&
            JSON.stringify(s.parameters) === JSON.stringify(step.parameters)));
        if (retryActions.length > 2) {
            issues.push(`Excessive retries detected (${retryActions.length} retry attempts)`);
        }
        return issues;
    }
    generateRecommendations(factors, issues) {
        const recommendations = [];
        if (factors.taskCompleteness < 1) {
            recommendations.push('Ensure all required steps are completed before marking task as done');
        }
        if (factors.actionSuccess < 0.8) {
            recommendations.push('Improve action selection and parameter validation');
        }
        if (factors.verificationConfidence < 0.8) {
            recommendations.push('Add more specific success criteria for better verification');
        }
        if (factors.errorRecovery < 0.8) {
            recommendations.push('Implement better error handling and alternative strategies');
        }
        if (factors.consistency < 0.8) {
            recommendations.push('Improve task planning to better match execution needs');
        }
        if (issues.some(i => i.includes('retry'))) {
            recommendations.push('Add fallback strategies for commonly failing actions');
        }
        return recommendations;
    }
    extractConfidence(thinking) {
        const confidenceMatch = thinking.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
        if (confidenceMatch) {
            return parseFloat(confidenceMatch[1]);
        }
        const highConfidenceWords = ['certain', 'sure', 'definitely', 'clearly'];
        const lowConfidenceWords = ['might', 'maybe', 'possibly', 'unsure', 'uncertain'];
        const hasHighConfidence = highConfidenceWords.some(word => thinking.toLowerCase().includes(word));
        const hasLowConfidence = lowConfidenceWords.some(word => thinking.toLowerCase().includes(word));
        if (hasHighConfidence && !hasLowConfidence)
            return 0.9;
        if (hasLowConfidence && !hasHighConfidence)
            return 0.5;
        return 0.7;
    }
    calculateConsistency(planned, executed) {
        if (planned.length === 0)
            return 0;
        let matches = 0;
        let execIndex = 0;
        for (const plannedAction of planned) {
            for (let i = execIndex; i < executed.length; i++) {
                if (executed[i] === plannedAction) {
                    matches++;
                    execIndex = i + 1;
                    break;
                }
            }
        }
        return matches / planned.length;
    }
    generateReport(score) {
        const rating = this.getReliabilityRating(score.overall);
        return `
# Task Execution Reliability Report

## Overall Score: ${(score.overall * 100).toFixed(1)}% (${rating})

### Factor Breakdown:
- Task Completeness: ${(score.factors.taskCompleteness * 100).toFixed(1)}%
- Action Success Rate: ${(score.factors.actionSuccess * 100).toFixed(1)}%
- Verification Confidence: ${(score.factors.verificationConfidence * 100).toFixed(1)}%
- Error Recovery: ${(score.factors.errorRecovery * 100).toFixed(1)}%
- Plan Consistency: ${(score.factors.consistency * 100).toFixed(1)}%

### Issues Identified:
${score.issues.length > 0 ? score.issues.map(i => `- ${i}`).join('\n') : '- None'}

### Recommendations:
${score.recommendations.length > 0 ? score.recommendations.map(r => `- ${r}`).join('\n') : '- None'}

### Reliability Assessment:
${this.getReliabilityAssessment(score.overall)}
    `.trim();
    }
    getReliabilityRating(score) {
        if (score >= 0.9)
            return '⭐⭐⭐⭐⭐ Excellent';
        if (score >= 0.8)
            return '⭐⭐⭐⭐ Very Good';
        if (score >= 0.7)
            return '⭐⭐⭐ Good';
        if (score >= 0.6)
            return '⭐⭐ Fair';
        return '⭐ Needs Improvement';
    }
    getReliabilityAssessment(score) {
        if (score >= 0.9) {
            return 'The task was executed with excellent reliability. All critical steps were completed successfully with high confidence.';
        }
        if (score >= 0.8) {
            return 'The task was executed reliably with minor issues. Most objectives were achieved successfully.';
        }
        if (score >= 0.7) {
            return 'The task was completed with acceptable reliability. Some improvements could enhance execution quality.';
        }
        if (score >= 0.6) {
            return 'The task execution showed some reliability concerns. Consider implementing the recommendations for better results.';
        }
        return 'The task execution had significant reliability issues. Major improvements are needed for consistent success.';
    }
}
exports.ReliabilityScorer = ReliabilityScorer;
