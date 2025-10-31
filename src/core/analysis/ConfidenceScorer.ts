/**
 * ConfidenceScorer - Calculate confidence in route detection
 *
 * Scores route detection confidence (0-1) based on multiple factors:
 * - Import graph presence
 * - Pattern matching with learned patterns
 * - File existence
 * - Component resolution
 *
 * Routes below threshold trigger LLM fallback for validation.
 */

import { LearnedPattern } from '../setup/types';
import { config } from '../';

export interface Route {
  path: string;
  component?: string;
  file?: string;
  children?: Route[];
}

export interface RouteConfidence {
  route: string;
  confidence: number;
  needsLLMValidation: boolean;
  factors: {
    hasPath: boolean;
    hasComponent: boolean;
    foundInImportGraph: boolean;
    matchesLearnedPattern: boolean;
    fileExists: boolean;
    componentFound: boolean;
    hasCircularDependency?: boolean;
    isDynamicImport?: boolean;
  };
  details?: string;
}

export class ConfidenceScorer {
  private patterns?: LearnedPattern;
  private confidenceThreshold: number;

  constructor(patterns?: LearnedPattern, confidenceThreshold?: number) {
    this.patterns = patterns;
    this.confidenceThreshold = confidenceThreshold ?? config.get('patternLearning.confidenceThreshold', 0.85);
  }

  /**
   * Score a single route's detection confidence
   */
  scoreRoute(route: Route, context: {
    foundInImportGraph: boolean;
    matchesLearnedPattern?: boolean;
    fileExists: boolean;
    componentFound: boolean;
    hasCircularDependency?: boolean;
    isDynamicImport?: boolean;
  }): RouteConfidence {
    let score = 0;
    const maxScore = 100;

    const factors = {
      hasPath: !!route.path,
      hasComponent: !!route.component,
      foundInImportGraph: context.foundInImportGraph,
      matchesLearnedPattern: context.matchesLearnedPattern ?? false,
      fileExists: context.fileExists,
      componentFound: context.componentFound,
      hasCircularDependency: context.hasCircularDependency,
      isDynamicImport: context.isDynamicImport
    };

    // Base route structure (20 points)
    if (factors.hasPath && factors.hasComponent) {
      score += 20;
    } else if (factors.hasPath) {
      score += 10;
    }

    // Import graph presence (25 points) - HIGH WEIGHT
    // If found through backtracking, very reliable
    if (factors.foundInImportGraph) {
      score += 25;
    }

    // Pattern matching (20 points)
    // Matches learned patterns from repository
    if (factors.matchesLearnedPattern) {
      score += 20;
    }

    // File existence (15 points)
    // Component file actually exists on disk
    if (factors.fileExists) {
      score += 15;
    }

    // Component resolution (15 points)
    // Successfully resolved component path
    if (factors.componentFound) {
      score += 15;
    }

    // Bonus: Has patterns available (5 points)
    if (this.patterns) {
      score += 5;
    }

    // Deductions
    if (factors.hasCircularDependency) {
      score -= 10;
      score = Math.max(0, score);
    }

    if (factors.isDynamicImport) {
      // Dynamic imports are harder to analyze, slight penalty
      score -= 5;
      score = Math.max(0, score);
    }

    const confidence = Math.min(score / maxScore, 1.0);
    const needsLLMValidation = confidence < this.confidenceThreshold;

    let details = '';
    if (needsLLMValidation) {
      const missingFactors: string[] = [];
      if (!factors.foundInImportGraph) missingFactors.push('import graph');
      if (!factors.matchesLearnedPattern) missingFactors.push('pattern match');
      if (!factors.fileExists) missingFactors.push('file exists');
      if (!factors.componentFound) missingFactors.push('component found');

      details = `Low confidence (${(confidence * 100).toFixed(0)}%), missing: ${missingFactors.join(', ')}`;
    }

    return {
      route: route.path,
      confidence,
      needsLLMValidation,
      factors,
      details
    };
  }

  /**
   * Score multiple routes
   */
  scoreRoutes(
    routes: Route[],
    getContext: (route: Route) => {
      foundInImportGraph: boolean;
      matchesLearnedPattern?: boolean;
      fileExists: boolean;
      componentFound: boolean;
      hasCircularDependency?: boolean;
      isDynamicImport?: boolean;
    }
  ): RouteConfidence[] {
    return routes.map(route => this.scoreRoute(route, getContext(route)));
  }

  /**
   * Check if route needs LLM fallback
   */
  needsLLMFallback(confidence: number): boolean {
    return confidence < this.confidenceThreshold;
  }

  /**
   * Get overall confidence statistics for a set of scores
   */
  getStatistics(scores: RouteConfidence[]): {
    averageConfidence: number;
    highConfidence: number;
    lowConfidence: number;
    needsLLMCount: number;
    fallbackRate: number;
  } {
    if (scores.length === 0) {
      return {
        averageConfidence: 0,
        highConfidence: 0,
        lowConfidence: 0,
        needsLLMCount: 0,
        fallbackRate: 0
      };
    }

    const total = scores.reduce((sum, s) => sum + s.confidence, 0);
    const averageConfidence = total / scores.length;

    const highConfidence = scores.filter(s => s.confidence >= this.confidenceThreshold).length;
    const lowConfidence = scores.filter(s => s.confidence < this.confidenceThreshold).length;
    const needsLLMCount = scores.filter(s => s.needsLLMValidation).length;
    const fallbackRate = needsLLMCount / scores.length;

    return {
      averageConfidence,
      highConfidence,
      lowConfidence,
      needsLLMCount,
      fallbackRate
    };
  }

  /**
   * Check if a file path matches learned patterns
   */
  matchesPatterns(filePath: string): boolean {
    if (!this.patterns) {
      return false;
    }

    const patterns = this.patterns.patterns;

    // Check route file patterns
    const filePattern = patterns.routeDefinitions.filePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filePath);
    });

    if (filePattern) {
      return true;
    }

    // Check if in route locations
    const inRouteLocation = patterns.routeDefinitions.locations.some(loc =>
      filePath.includes(loc)
    );

    if (inRouteLocation) {
      return true;
    }

    // Check component directories
    const inComponentDir = patterns.componentPaths.directories.some(dir =>
      filePath.includes(dir)
    );

    return inComponentDir;
  }

  /**
   * Get confidence threshold
   */
  getThreshold(): number {
    return this.confidenceThreshold;
  }

  /**
   * Set new confidence threshold
   */
  setThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }
    this.confidenceThreshold = threshold;
  }

  /**
   * Update learned patterns
   */
  updatePatterns(patterns: LearnedPattern): void {
    this.patterns = patterns;
  }

  /**
   * Check if patterns are loaded
   */
  hasPatterns(): boolean {
    return !!this.patterns;
  }
}
