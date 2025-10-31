/**
 * Type definitions for learned routing patterns
 * These patterns are extracted once during setup and used for fast deterministic analysis
 */

export type FrameworkType =
  | 'react-router-v6'
  | 'react-router-v5'
  | 'next-app-router'
  | 'next-pages-router'
  | 'vue-router'
  | 'angular-router'
  | 'svelte-kit'
  | 'unknown';

export interface RouteDefinitionPattern {
  /**
   * Where routes are typically defined in the codebase
   * Examples: ["src/routes/", "src/app/", "pages/"]
   */
  locations: string[];

  /**
   * File naming patterns for route files
   * Examples: ["*Router.tsx", "*Routes.tsx", "route.ts", "page.tsx"]
   */
  filePatterns: string[];

  /**
   * AST patterns for identifying route definitions
   * Framework-specific patterns for detecting routes in code
   */
  astPatterns: {
    /**
     * How routes are defined (e.g., JSX elements, function calls, config objects)
     * Examples:
     * - React Router: <Route path="/dashboard" element={<Dashboard />} />
     * - Vue Router: { path: '/dashboard', component: Dashboard }
     */
    definitionStyle: 'jsx-elements' | 'config-array' | 'file-based' | 'function-calls';

    /**
     * Common identifiers used in route definitions
     * Examples: ["Route", "createBrowserRouter", "routes", "path"]
     */
    identifiers: string[];

    /**
     * Example patterns extracted from the codebase
     */
    examples: string[];
  };
}

export interface ComponentPathPattern {
  /**
   * How components are referenced in route definitions
   * Examples:
   * - Direct import: import Dashboard from './Dashboard'
   * - Lazy loading: lazy(() => import('./Dashboard'))
   * - Dynamic import: () => import('./Dashboard')
   */
  referenceStyle: 'direct-import' | 'lazy-import' | 'dynamic-import' | 'string-path';

  /**
   * Common directory structures for components
   * Examples: ["src/pages/", "src/views/", "src/components/", "app/"]
   */
  directories: string[];

  /**
   * File naming conventions for components
   * Examples: ["*.page.tsx", "*.view.tsx", "index.tsx", "page.tsx"]
   */
  fileNamingPatterns: string[];

  /**
   * Whether components are typically colocated with routes
   */
  colocated: boolean;
}

export interface RouteStructurePattern {
  /**
   * Whether routes support nesting
   */
  supportsNesting: boolean;

  /**
   * Whether routes use file-based routing (like Next.js, SvelteKit)
   */
  fileBasedRouting: boolean;

  /**
   * How nested routes are structured
   * Examples:
   * - Config-based: children: [...]
   * - JSX-based: <Route><Route /></Route>
   * - File-based: directory structure mirrors URL structure
   */
  nestingStyle?: 'children-prop' | 'jsx-nesting' | 'file-system';

  /**
   * Common route path patterns found in the codebase
   * Examples: ["/dashboard", "/users/:id", "/settings/*"]
   */
  commonPaths: string[];

  /**
   * Dynamic segment patterns
   * Examples: [":id", ":slug", "*", "**"]
   */
  dynamicSegments: string[];
}

export interface ImportAliasPattern {
  /**
   * Import path aliases used in the codebase
   * Key: alias, Value: actual path
   * Examples: { "@": "src/", "~": "src/", "@components": "src/components/" }
   */
  aliases: Record<string, string>;

  /**
   * Base directory for resolving relative imports
   */
  baseDir: string;

  /**
   * TypeScript paths configuration (from tsconfig.json)
   */
  tsconfigPaths?: Record<string, string[]>;
}

export interface LazyLoadingPattern {
  /**
   * Whether the codebase uses code splitting / lazy loading
   */
  enabled: boolean;

  /**
   * Common patterns for lazy imports
   * Examples:
   * - React.lazy(() => import('./Component'))
   * - lazy: () => import('./Component')
   * - loadable(() => import('./Component'))
   */
  patterns: string[];

  /**
   * Function names used for lazy loading
   * Examples: ["lazy", "loadable", "defineAsyncComponent"]
   */
  loaderFunctions: string[];
}

/**
 * Complete learned pattern structure
 */
export interface LearnedPattern {
  /**
   * Detected framework
   */
  framework: FrameworkType;

  /**
   * Framework version (if detectable)
   */
  version: string;

  /**
   * When the pattern was learned
   */
  learnedAt: string;

  /**
   * All learned patterns
   */
  patterns: {
    routeDefinitions: RouteDefinitionPattern;
    componentPaths: ComponentPathPattern;
    routeStructure: RouteStructurePattern;
    importAliases: ImportAliasPattern;
    lazyLoading: LazyLoadingPattern;
  };

  /**
   * Overall confidence score (0-1)
   * Higher = more confident in the learned patterns
   */
  confidence: number;

  /**
   * Repository-specific metadata
   */
  metadata?: {
    /**
     * Number of route files analyzed
     */
    filesAnalyzed: number;

    /**
     * Total routes discovered
     */
    routesFound: number;

    /**
     * LLM tokens used during learning
     */
    tokensUsed?: number;

    /**
     * Learning duration in seconds
     */
    learningDurationSeconds?: number;
  };
}

/**
 * Metrics collected during pattern learning
 */
export interface LearningMetrics {
  /**
   * Total files scanned
   */
  filesScanned: number;

  /**
   * Files analyzed in detail
   */
  filesAnalyzed: number;

  /**
   * Routes discovered
   */
  routesDiscovered: number;

  /**
   * LLM API calls made
   */
  llmApiCalls: number;

  /**
   * Total tokens used
   */
  tokensUsed: number;

  /**
   * Estimated cost in USD
   */
  estimatedCost: number;

  /**
   * Learning duration
   */
  duration: {
    start: Date;
    end: Date;
    seconds: number;
  };

  /**
   * Confidence breakdown
   */
  confidence: {
    overall: number;
    routeDetection: number;
    componentMapping: number;
    importResolution: number;
  };
}

/**
 * Context provided to LLM for pattern extraction
 */
export interface LearningContext {
  /**
   * Repository information
   */
  repository: {
    framework: string;
    packageJson: any;
    tsconfigJson?: any;
  };

  /**
   * Sample route files
   */
  sampleFiles: Array<{
    path: string;
    content: string;
    size: number;
  }>;

  /**
   * Directory structure
   */
  structure: {
    routeDirectories: string[];
    componentDirectories: string[];
    totalFiles: number;
  };
}

/**
 * Pattern update suggestion from incremental learning
 */
export interface PatternUpdate {
  /**
   * What triggered this update
   */
  reason: string;

  /**
   * Patterns to add or modify
   */
  additions: Partial<LearnedPattern['patterns']>;

  /**
   * Confidence in this update (0-1)
   */
  confidence: number;

  /**
   * Examples that led to this update
   */
  examples: Array<{
    file: string;
    route?: string;
    component?: string;
    issue: string;
  }>;

  /**
   * When this update was suggested
   */
  suggestedAt: string;
}
