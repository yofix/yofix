import * as core from "@actions/core";
import { analyzeRouteImpact } from "@yofix/analyzer";
import { config } from "../index";

export interface ExternalRouteImpact {
  route: string;
  changedFiles: string[];
  reason?: 'layout' | 'direct' | 'shared-component';
  confidence?: 'high' | 'medium' | 'low';
}

export interface ExternalRouteImpactTree {
  affectedRoutes: ExternalRouteImpact[];
  sharedComponents: Map<string, string[]>;
  totalFilesChanged: number;
  totalRoutesAffected: number;
  componentRouteMapping: Map<
    string,
    Array<{
      routePath: string;
      routeFile: string;
    }>
  >;
  framework?: string;
}

interface ExternalImpactResult {
  routes: string[];
  impactTree: ExternalRouteImpactTree;
  routesToTest: ExternalRouteImpactTree;
  commentBody: string;
}

function createEmptyImpactTree(
  totalFilesChanged: number,
): ExternalRouteImpactTree {
  return {
    affectedRoutes: [],
    sharedComponents: new Map<string, string[]>(),
    totalFilesChanged,
    totalRoutesAffected: 0,
    componentRouteMapping: new Map<
      string,
      Array<{ routePath: string; routeFile: string }>
    >(),
  };
}

export async function analyzeRoutesWithExternalTool(
  prFiles: Array<{ filename: string; status: string }>,
  previewUrl: string,
): Promise<ExternalImpactResult> {
  // Get configuration using ConfigurationManager (proper way)
  const claudeApiKey = config.get('claude-api-key', { required: true });
  const modelFromConfig = config.get('claude-model', { required: true });
  const forceRefreshInput = config.get('analyzer-force-refresh', { defaultValue: 'auto' });

  if (!claudeApiKey) {
    throw new Error(
      "Claude API key is required for route-impact-analyzer integration.",
    );
  }

  if (!modelFromConfig) {
    throw new Error(
      "Claude model is required. Please specify 'claude-model' input (e.g., claude-sonnet-4-5-20250929)."
    );
  }

  const changedFiles = prFiles
    .filter((file) => file.status !== "removed")
    .map((file) => file.filename);

  core.info(
    `🧭 route-impact-analyzer inspecting ${changedFiles.length} changed files`,
  );

  if (changedFiles.length === 0) {
    core.info(
      "No changed files detected, skipping external route impact analysis.",
    );
    const emptyTree = createEmptyImpactTree(0);
    return {
      routes: [],
      impactTree: emptyTree,
      routesToTest: emptyTree,
      commentBody: "",
    };
  }

  // Handle force-refresh: 'true' = force, 'false' = disable, 'auto' = let cache decide (default)
  const forceRefresh =
    forceRefreshInput === "true" ||
    forceRefreshInput === "True" ||
    forceRefreshInput === "TRUE";

  // Use GITHUB_WORKSPACE for user's repo, not action's installation directory
  const codebasePath = process.env.GITHUB_WORKSPACE || process.cwd();

  core.info(`📊 Calling route-impact-analyzer with:`);
  core.info(`  - Codebase path: ${codebasePath}`);
  core.info(`  - Changed files count: ${changedFiles.length}`);
  core.info(`  - Base URL: ${previewUrl}`);
  core.info(`  - Model: ${modelFromConfig}`);
  core.info(`  - Force refresh: ${forceRefresh}`);

  const result = await analyzeRouteImpact({
    codebase: { path: codebasePath },
    changedFiles,
    options: {
      baseUrl: previewUrl,
      llm: {
        provider: "anthropic",
        apiKey: claudeApiKey,
        model: modelFromConfig,
      },
      cache: {
        enabled: true,
        provider: "file-system",
        forceRefresh,
      },
      analysis: {
        includeLayouts: true,
        maxDepth: 10,
        verbose: true,
      },
    },
  });

  core.info(`📊 Route analysis result: success=${result.success}`);

  if (!result.success) {
    const messages =
      result.errors?.map((err) => `${err.code}: ${err.message}`) || [];
    const errorMessage =
      messages.length > 0
        ? messages.join("\n")
        : "route-impact-analyzer failed with unknown error";
    core.error(`❌ Route impact analysis failed: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  const uniqueRoutes = new Set<string>();
  const componentRouteMapping = new Map<
    string,
    Array<{ routePath: string; routeFile: string }>
  >();
  const routeImpactMap = new Map<string, ExternalRouteImpact>();

  // Track impact reasons for filtering later
  const impactReasons = new Map<string, { reason: string; confidence: string }>();

  result.impacts.forEach((impact) => {
    const impactedRoutes = Array.from(new Set(impact.impactedRoutes || []));

    if (impactedRoutes.length === 0) {
      return;
    }

    componentRouteMapping.set(
      impact.changedFile,
      impactedRoutes.map((route) => ({
        routePath: route,
        routeFile: impact.changedFile,
      })),
    );

    impactedRoutes.forEach((route) => {
      uniqueRoutes.add(route);

      if (!routeImpactMap.has(route)) {
        routeImpactMap.set(route, {
          route,
          changedFiles: [],
          reason: impact.reason as 'layout' | 'direct' | 'shared-component',
          confidence: impact.confidence as 'high' | 'medium' | 'low',
        });
      }

      const impactEntry = routeImpactMap.get(route)!;
      if (!impactEntry.changedFiles.includes(impact.changedFile)) {
        impactEntry.changedFiles.push(impact.changedFile);
      }

      // Store the reason for this route (use highest priority reason if multiple)
      if (!impactReasons.has(route) || impact.reason === 'direct') {
        impactReasons.set(route, {
          reason: impact.reason,
          confidence: impact.confidence
        });
      }
    });
  });

  const sharedComponents = new Map<string, string[]>();
  componentRouteMapping.forEach((routes, componentFile) => {
    const uniqueRoutePaths = Array.from(
      new Set(
        routes
          .map((route) => route.routePath)
          .filter((routePath): routePath is string => !!routePath),
      ),
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
    componentRouteMapping,
    framework: result.metadata?.framework,
  };

  // Create filtered routesToTest tree
  // For layout impacts: only take first route
  // For direct/shared-component: take all routes
  const routesToTestMap = new Map<string, ExternalRouteImpact>();
  const routesToTestComponentMapping = new Map<
    string,
    Array<{ routePath: string; routeFile: string }>
  >();

  result.impacts.forEach((impact) => {
    const impactedRoutes = Array.from(new Set(impact.impactedRoutes || []));

    if (impactedRoutes.length === 0) {
      return;
    }

    // For layout impacts, only take the first route
    const routesToInclude = impact.reason === 'layout'
      ? impactedRoutes.slice(0, 1)
      : impactedRoutes;

    if (routesToInclude.length > 0) {
      const newRoutes: Array<{ routePath: string; routeFile: string }> = [];

      routesToInclude.forEach((route) => {
        if (!routesToTestMap.has(route)) {
          // This is a new unique route - add it to the map and track it for this file
          routesToTestMap.set(route, {
            route,
            changedFiles: [impact.changedFile],
            reason: impact.reason as 'layout' | 'direct' | 'shared-component',
            confidence: impact.confidence as 'high' | 'medium' | 'low',
          });
          newRoutes.push({
            routePath: route,
            routeFile: impact.changedFile,
          });
        } else {
          // Route already exists - merge the changed files
          const existing = routesToTestMap.get(route)!;
          if (!existing.changedFiles.includes(impact.changedFile)) {
            existing.changedFiles.push(impact.changedFile);
          }
          // Don't add to newRoutes - this route is already tracked by another file
        }
      });

      // Only add routes that are new/unique for this file
      if (newRoutes.length > 0) {
        routesToTestComponentMapping.set(impact.changedFile, newRoutes);
      }
    }

    // Log the filtering decision
    if (impact.reason === 'layout' && impactedRoutes.length > 1) {
      core.info(
        `📊 Layout impact for ${impact.changedFile}: Testing 1 of ${impactedRoutes.length} routes (${routesToInclude[0]})`
      );
    }
  });

  const routesToTest: ExternalRouteImpactTree = {
    affectedRoutes: Array.from(routesToTestMap.values()),
    sharedComponents,
    totalFilesChanged: changedFiles.length,
    totalRoutesAffected: routesToTestMap.size,
    componentRouteMapping: routesToTestComponentMapping,
    framework: result.metadata?.framework,
  };

  core.info(`📊 Routes summary: ${uniqueRoutes.size} total affected, ${routesToTestMap.size} to test`);

  // Ensure preview URL doesn't have trailing slash for clean route concatenation
  const basePreviewUrl = previewUrl.replace(/\/$/, '');

  const header = "## 🌐 Route Impact (route-impact-analyzer)\n";
  const summaryLines = [
    `- Files analyzed: **${result.metadata?.totalFiles ?? changedFiles.length}**`,
    `- Routes impacted: **${uniqueRoutes.size}**`,
    `- Routes to test: **${routesToTestMap.size}**`,
    `- Framework: **${result.metadata?.framework ?? "unknown"}**`,
    `- Preview URL: **${basePreviewUrl}**`,
    "",
  ];

  const routeLines: string[] = [];
  let lineCount = 0;

  componentRouteMapping.forEach((routes, file) => {
    const fileImpact = result.impacts.find(i => i.changedFile === file);
    const reason = fileImpact?.reason || 'unknown';
    const routeCount = routes.length;
    const testCount = routesToTestComponentMapping.get(file)?.length || 0;

    routeLines.push(`- \`${file}\` (${reason}: ${testCount} to test / ${routeCount} affected)`);

    const routesToShow = routesToTestComponentMapping.get(file) || routes.slice(0, 5);
    routesToShow.forEach((routeInfo, idx) => {
      if (lineCount < 20 && idx < 5) {
        // Make route a clickable link with preview URL
        const fullUrl = `${basePreviewUrl}${routeInfo.routePath}`;
        routeLines.push(`  - [${routeInfo.routePath}](${fullUrl})`);
        lineCount++;
      }
    });

    if (routes.length > 5) {
      routeLines.push(`  - …and ${routes.length - 5} more routes`);
    }
  });

  const commentBody =
    uniqueRoutes.size > 0
      ? [header, ...summaryLines, ...routeLines].join("\n")
      : `${header}\nNo impacted routes detected.`;

  return {
    routes: Array.from(uniqueRoutes),
    impactTree,
    routesToTest,
    commentBody,
  };
}
