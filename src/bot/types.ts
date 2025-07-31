/**
 * Bot command types and interfaces
 */

export type CommandAction = 
  | 'scan'      // Scan for visual issues
  | 'fix'       // Generate fixes
  | 'apply'     // Apply fixes
  | 'explain'   // Explain an issue
  | 'preview'   // Preview fixes
  | 'compare'   // Compare with baseline
  | 'baseline'  // Update baseline
  | 'report'    // Generate full report
  | 'ignore'    // Skip this PR
  | 'test'      // Generate tests
  | 'browser'   // Browser automation
  | 'impact'    // Show route impact tree
  | 'cache'     // Cache management commands
  | 'help';     // Show help

export interface CommandOptions {
  viewport?: string;
  route?: string;
  all?: boolean;
  force?: boolean;
  [key: string]: string | boolean | undefined;
}

export interface BotCommand {
  action: CommandAction;
  args: string;
  targetIssue?: number;
  targetRoute?: string;
  options: CommandOptions;
  raw: string;
}

export interface BotContext {
  prNumber: number;
  repo: {
    owner: string;
    repo: string;
  };
  comment: {
    id: number;
    user: {
      login: string;
    };
    body: string;
  };
  previewUrl?: string;
}

export interface BotResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface VisualIssue {
  id: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  affectedViewports: string[];
  location: {
    route: string;
    selector?: string;
    line?: number;
    file?: string;
  };
  screenshots?: string[];
  screenshot?: {
    current: string;
    baseline?: string;
    diff?: string;
  };
  fix?: CodeFix;
}

export interface CodeFix {
  id: number;
  issueId: number;
  description: string;
  confidence: number;
  files: FileFix[];
  preview?: string;
}

export interface FileFix {
  path: string;
  changes: Change[];
  language: string;
}

export interface Change {
  line: number;
  type: 'add' | 'remove' | 'replace';
  content: string;
  original?: string;
}

export interface ScanResult {
  timestamp: number;
  duration: number;
  routes: string[];
  issues: VisualIssue[];
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  };
  generatedTests?: any[]; // TestTemplate[] from visual issues
}

export interface FixResult {
  generated: number;
  applied: number;
  fixes: CodeFix[];
  errors: string[];
}