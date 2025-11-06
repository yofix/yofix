/**
 * Step 1: Analyze Routes
 *
 * Analyzes changed files in PR to determine affected routes using
 * the external route-impact-analyzer package.
 *
 * Outputs:
 * - affectedRoutes: Array of route paths to test
 * - impactTree: Full impact analysis tree
 * - routesToTest: Filtered routes based on impact type
 * - components: Affected component names
 * - impactCommentBody: Markdown comment for GitHub
 */

import * as core from '@actions/core';
import path from 'path';
import { GitHubServiceFactory } from '../core/github/GitHubServiceFactory';
import { analyzeRoutesWithExternalTool, ExternalRouteImpactTree } from '../core/analysis/ThirdPartyRouteImpactAnalyzer';
import { getStepDataManager, executeStep, StepData } from './shared/StepDataManager';
import { ErrorSeverity, ErrorCategory, errorHandler } from '../core';

/**
 * Main step execution
 */
export async function analyzeRoutes(stepData: StepData): Promise<StepData> {
  return executeStep('Analyze Routes', async () => {
    const { previewUrl, prNumber, githubContext } = stepData;

    // Skip route analysis if not in PR context
    if (prNumber === 0) {
      core.warning('⚠️ No PR number detected. Skipping route analysis and defaulting to homepage.');
      return {
        ...stepData,
        routes: {
          affectedRoutes: ['/'],
          impactTree: null,
          routesToTest: null,
          components: ['App'],
          impactCommentBody: null
        }
      };
    }

    let impactTree: ExternalRouteImpactTree | null = null;
    let routesToTest: ExternalRouteImpactTree | null = null;
    let impactCommentBody: string | null = null;
    let affectedRoutes: string[] = [];
    let components: string[] = ['App'];

    try {
      core.info('🛰️ Using route-impact-analyzer to discover affected routes...');

      // Configure GitHub service with token (each step is a separate process)
      const githubToken = config.get('github-token');
      const github = GitHubServiceFactory.getService();
      if (githubToken) {
        await github.configure({ token: githubToken });
      }

      // Get changed files from PR
      const prFiles = await github.listPullRequestFiles();
      core.info(`📝 Analyzing ${prFiles.length} changed files: ${prFiles.map(f => f.filename).join(', ')}`);

      // Run external route analysis
      const externalAnalysis = await analyzeRoutesWithExternalTool(prFiles, previewUrl);

      core.info(
        `🎯 Route impact analysis complete: ${externalAnalysis.impactTree.totalRoutesAffected} routes affected, ` +
        `${externalAnalysis.routesToTest.totalRoutesAffected} routes to test`
      );

      impactTree = externalAnalysis.impactTree;
      routesToTest = externalAnalysis.routesToTest;
      impactCommentBody = externalAnalysis.commentBody;

      // Extract routes from impact tree
      affectedRoutes = extractRoutesFromImpactTree(routesToTest || impactTree);

      // Extract components
      components = extractComponentsFromImpactTree(routesToTest || impactTree);

      // Log summary
      logImpactTreeSummary(routesToTest || impactTree);

      // Post impact comment to PR (with timeout)
      if (impactCommentBody) {
        try {
          await Promise.race([
            github.createComment(impactCommentBody),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('GitHub comment timeout')), 15000)
            )
          ]);
          core.info('✅ Posted route impact summary to PR');
        } catch (commentError) {
          core.warning(`Failed to post impact summary to PR: ${commentError}`);
        }
      }

    } catch (error) {
      core.error(`❌ Route impact analyzer error: ${error}`);

      await errorHandler.handleError(error as Error, {
        severity: ErrorSeverity.MEDIUM,
        category: ErrorCategory.PACKAGE,
        location: '@yofix/analyzer',
        recoverable: true
      });

      core.warning('Route analyzer failed. Falling back to testing homepage only.');
      affectedRoutes = ['/'];
    }

    // Ensure we have at least one route
    if (affectedRoutes.length === 0) {
      core.info('ℹ️ No specific routes identified, defaulting to homepage');
      affectedRoutes = ['/'];
    }

    core.info(`📍 Total routes to test: ${affectedRoutes.length}`);
    core.info(`📦 Components found: ${components.length}`);

    // Update step data with results
    return {
      ...stepData,
      routes: {
        affectedRoutes,
        impactTree,
        routesToTest,
        components,
        impactCommentBody
      }
    };
  });
}

/**
 * Extract route paths from impact tree
 */
function extractRoutesFromImpactTree(impactTree: ExternalRouteImpactTree): string[] {
  const routes = new Set<string>();

  // Extract from component route mapping
  if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
    for (const componentRoutes of impactTree.componentRouteMapping.values()) {
      for (const routeInfo of componentRoutes) {
        if (routeInfo.routePath) {
          routes.add(routeInfo.routePath);
        }
      }
    }
  }

  // Extract from affected routes
  if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
    for (const impact of impactTree.affectedRoutes) {
      if (impact.route) {
        routes.add(impact.route);
      }
    }
  }

  return Array.from(routes);
}

/**
 * Extract component names from impact tree
 */
function extractComponentsFromImpactTree(impactTree: ExternalRouteImpactTree): string[] {
  const allComponents = new Set<string>();

  // Get components from affected routes
  if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
    for (const route of impactTree.affectedRoutes) {
      if (route.changedFiles) {
        route.changedFiles.forEach((file: string) => {
          const componentName = path.basename(file, path.extname(file));
          if (componentName && componentName !== 'index') {
            allComponents.add(componentName);
          }
        });
      }
    }
  }

  // Get components from component route mapping
  if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
    for (const [componentFile] of impactTree.componentRouteMapping) {
      const componentName = path.basename(componentFile, path.extname(componentFile));
      if (componentName && componentName !== 'index') {
        allComponents.add(componentName);
      }
    }
  }

  const components = Array.from(allComponents).slice(0, 10); // Limit to avoid spam
  return components.length > 0 ? components : ['App'];
}

/**
 * Log impact tree summary to console
 */
function logImpactTreeSummary(impactTree: ExternalRouteImpactTree): void {
  // Log component mappings
  if (impactTree.componentRouteMapping && impactTree.componentRouteMapping.size > 0) {
    core.info('🎯 Component mappings found:');
    for (const [component, routes] of impactTree.componentRouteMapping) {
      core.info(`  ${component} affects ${routes.length} routes:`);
      for (const route of routes) {
        if (route.routePath) {
          core.info(`    - ${route.routePath} (in ${route.routeFile || 'unknown'})`);
        }
      }
    }
  }

  // Log additional routes from direct changes
  if (impactTree.affectedRoutes && impactTree.affectedRoutes.length > 0) {
    const mappedRoutes = new Set<string>();
    if (impactTree.componentRouteMapping) {
      for (const routes of impactTree.componentRouteMapping.values()) {
        routes.forEach(route => {
          if (route.routePath) {
            mappedRoutes.add(route.routePath);
          }
        });
      }
    }

    const additionalRoutes = impactTree.affectedRoutes
      .filter(impact => impact.route && !mappedRoutes.has(impact.route))
      .map(impact => impact.route);

    if (additionalRoutes.length > 0) {
      core.info(`🎯 Found ${additionalRoutes.length} additional routes from direct changes`);
    }
  }

  // Log total
  const allRoutes = extractRoutesFromImpactTree(impactTree);
  core.info(`📍 Total unique routes: ${allRoutes.length}`);
  if (allRoutes.length > 0 && allRoutes.length <= 20) {
    core.info(`📍 Routes: ${allRoutes.join(', ')}`);
  } else if (allRoutes.length > 20) {
    core.info(`📍 Routes: ${allRoutes.slice(0, 20).join(', ')} ... and ${allRoutes.length - 20} more`);
  }
}

/**
 * Entry point for standalone execution
 */
export async function main(): Promise<void> {
  try {
    const manager = getStepDataManager();
    const stepData = await manager.load();
    const updatedData = await analyzeRoutes(stepData);
    await manager.save(updatedData);

    core.info('✅ Step 1: Analyze Routes completed successfully');
  } catch (error) {
    core.setFailed(`Step 1 failed: ${error}`);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
