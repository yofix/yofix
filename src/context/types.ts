/**
 * Types for codebase context management
 */

export interface CodebaseContext {
  // Repository information
  repository: {
    name: string;
    owner: string;
    defaultBranch: string;
  };
  
  // Detected framework and tools
  framework: 'react' | 'nextjs' | 'vue' | 'angular' | 'unknown';
  styleSystem: 'css' | 'tailwind' | 'styled-components' | 'css-modules' | 'sass';
  buildTool: 'vite' | 'webpack' | 'nextjs' | 'cra' | 'unknown';
  
  // Code structure
  structure: FileTree;
  routes: Route[];
  components: Component[];
  patterns: Pattern[];
  dependencies: Dependency[];
  
  // Metadata
  lastUpdated: number;
  version: string;
}

export interface FileTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTree[];
  language?: string;
  size?: number;
}

export interface Route {
  path: string;
  component: string;
  file: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  dynamic?: boolean;
  params?: string[];
}

export interface Component {
  name: string;
  type: 'functional' | 'class' | 'unknown';
  file: string;
  props?: PropDefinition[];
  dependencies: string[];
  routes?: string[]; // Routes that use this component
  hasStyles?: boolean;
  styleFiles?: string[];
}

export interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: any;
}

export interface Pattern {
  id: string;
  type: 'positioning' | 'responsive' | 'color' | 'layout' | 'animation' | 'other';
  description: string;
  code: string;
  usage: string;
  files?: string[];
  frequency?: number;
  score?: number;
}

export interface Dependency {
  name: string;
  version: string;
  type: 'production' | 'development';
  isUILibrary?: boolean;
}

export interface StylePattern {
  selector: string;
  properties: Record<string, string>;
  mediaQueries?: MediaQuery[];
  file: string;
  line: number;
}

export interface MediaQuery {
  condition: string;
  properties: Record<string, string>;
}

export interface RouteAnalysis {
  routes: Route[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  changeType: string;
}

export interface ContextUpdateResult {
  added: number;
  updated: number;
  removed: number;
  duration: number;
}