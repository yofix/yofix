import * as core from '@actions/core';
import { analyzeRouteImpact } from 'route-impact-analyzer';

import { getConfiguration } from '../hooks/ConfigurationHook';
import { GitHubServiceFactory } from '../github/GitHubServiceFactory';

export interface ExternalRouteImpact {
  route: string;
  directChanges: string[];
  componentChanges: string[];
  styleChanges: string[];
  sharedComponents: string[];
  servingRoutes?: Array<{
    routePath: string;
    routeFile: string;
  }>;
}

export interface ExternalRouteImpactTree {
  affectedRoutes: ExternalRouteImpact[];
  sharedComponents: Map<string, string[]>;
  totalFilesChanged: number;
  totalRoutesAffected: number;
  componentRouteMapping: Map<string, Array<{
    routePath: string;
    routeFile: string;
  }>>;
}

interface ExternalImpactResult {
  routes: string[];
  impactTree: ExternalRouteImpactTree;
  commentBody: string;
}

function createEmptyImpactTree(totalFilesChanged: number): ExternalRouteImpactTree {
  return {
    affectedRoutes: [],
    sharedComponents: new Map<string, string[]>(),
    totalFilesChanged,
    totalRoutesAffected: 0,
    componentRouteMapping: new Map<string, Array<{ routePath: string; routeFile: string }>>()
  };
}

export async function analyzeRoutesWithExternalTool(
  prNumber: number,
  previewUrl: string
): Promise<ExternalImpactResult> {
  const configuration = getConfiguration();
  const claudeApiKey = configuration.getInput('claude-api-key');

  if (!claudeApiKey) {
    throw new Error('Claude API key is required for route-impact-analyzer integration.');
  }

  const github = GitHubServiceFactory.getService();
  const prFiles = await github.listPullRequestFiles();

  const changedFiles = prFiles
    .filter(file => file.status !== 'removed')
    .map(file => file.filename);

  core.info(`🧭 route-impact-analyzer inspecting ${changedFiles.length} changed files for PR #${prNumber}`);

  if (changedFiles.length === 0) {
    core.info('No changed files detected, skipping external route impact analysis.');
    return {
      routes: [],
      impactTree: createEmptyImpactTree(0),
      commentBody: ''
    };
  }

  const modelFromConfig = configuration.getInput('claude-model') || 'claude-3-5-sonnet-latest';
  const forceRefresh = configuration.getBooleanInput('route-impact-force-refresh');

  const result = await analyzeRouteImpact({
    codebase: { path: process.cwd() },
    changedFiles,
    options: {
      baseUrl: previewUrl,
      llm: {
        provider: 'anthropic',
        apiKey: claudeApiKey,
        model: modelFromConfig
      },
      cache: {
        enabled: true,
        provider: 'file-system',
        forceRefresh
      },
      analysis: {
        includeLayouts: true,
        maxDepth: 10,
        verbose: true
      }
    }
  });

  if (!result.success) {
    const messages = result.errors?.map(err => `${err.code}: ${err.message}`) || [];
    throw new Error(messages.length > 0 ? messages.join('\n') : 'route-impact-analyzer failed with unknown error');
  }

  const uniqueRoutes = new Set<string>();
  const componentRouteMapping = new Map<string, Array<{ routePath: string; routeFile: string }>>();
  const routeImpactMap = new Map<string, ExternalRouteImpact>();

  result.impacts.forEach(impact => {
    const impactedRoutes = Array.from(new Set(impact.impactedRoutes || []));

    if (impactedRoutes.length === 0) {
      return;
    }

    componentRouteMapping.set(
      impact.changedFile,
      impactedRoutes.map(route => ({
        routePath: route,
        routeFile: impact.changedFile
      }))
    );

    impactedRoutes.forEach(route => {
      uniqueRoutes.add(route);

      if (!routeImpactMap.has(route)) {
        routeImpactMap.set(route, {
          route,
          directChanges: [],
          componentChanges: [],
          styleChanges: [],
          sharedComponents: []
        });
      }

      const impactEntry = routeImpactMap.get(route)!;
      if (!impactEntry.componentChanges.includes(impact.changedFile)) {
        impactEntry.componentChanges.push(impact.changedFile);
      }
    });
  });

  const sharedComponents = new Map<string, string[]>();
  componentRouteMapping.forEach((routes, componentFile) => {
    const uniqueRoutePaths = Array.from(
      new Set(routes.map(route => route.routePath).filter((routePath): routePath is string => !!routePath))
    );
    if (uniqueRoutePaths.length > 1) {
      sharedComponents.set(componentFile, uniqueRoutePaths);
    }
  });

  const impactTree: ExternalRouteImpactTree = {
    affectedRoutes: Array.from(routeImpactMap.values()),
    sharedComponents,
    totalFilesChanged: changedFiles.length,
    totalRoutesAffected: uniqueRoutes.size,
    componentRouteMapping
  };

  const header = '## 🌐 Route Impact (route-impact-analyzer)\n';
  const summaryLines = [
    `- Files analyzed: **${result.metadata?.totalFiles ?? changedFiles.length}**`,
    `- Routes impacted: **${uniqueRoutes.size}**`,
    `- Framework: **${result.metadata?.framework ?? 'unknown'}**`,
    ''
  ];

  const routeLines: string[] = [];
  let lineCount = 0;

  componentRouteMapping.forEach((routes, file) => {
    routeLines.push(`- \`${file}\``);
    routes.forEach(routeInfo => {
      if (lineCount < 20) {
        routeLines.push(`  - \`${routeInfo.routePath}\``);
        lineCount++;
      }
    });
    if (routes.length > 20) {
      routeLines.push(`  - …and ${routes.length - 20} more`);
    }
  });

  const commentBody = uniqueRoutes.size > 0
    ? [header, ...summaryLines, ...routeLines].join('\n')
    : `${header}\nNo impacted routes detected.`;

  return {
    routes: Array.from(uniqueRoutes),
    impactTree,
    commentBody
  };
}
