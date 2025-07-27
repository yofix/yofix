/**
 * MCP (Model Context Protocol) type definitions
 */

export interface MCPOptions {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  browserArgs?: string[];
  contextOptions?: any;
}

export interface MCPAction {
  type: 'navigate' | 'click' | 'type' | 'hover' | 'scroll' | 'screenshot' | 
        'extract' | 'wait' | 'evaluate' | 'select' | 'upload' | 'press';
  params?: any;
  selector?: string;
  url?: string;
  text?: string;
  value?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  fullPage?: boolean;
  timeout?: number;
  script?: string;
  filePath?: string;
  key?: string;
  options?: any;
  timestamp?: number;
}

export interface MCPState {
  url: string;
  title: string;
  elements: Map<string, ElementInfo>;
  viewport: {
    width: number;
    height: number;
  };
  cookies: Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  console: ConsoleMessage[];
  network: NetworkRequest[];
}

export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
  state: MCPState;
  screenshot?: string;
  extractedData?: any;
}

export interface ElementInfo {
  selector: string;
  text?: string;
  html?: string;
  attributes: Record<string, string>;
  visible: boolean;
  clickable: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface ConsoleMessage {
  type: 'log' | 'error' | 'warning' | 'info';
  text: string;
  timestamp: number;
  location?: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  headers: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timestamp?: number;
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
  size?: number;
  type?: string;
}

export interface MCPSecurityValidation {
  valid: boolean;
  error?: string;
  sanitizedAction?: MCPAction;
}

export interface MCPBrowserCommand {
  id: string;
  timestamp: number;
  command: string;
  result?: MCPResult;
  duration?: number;
  error?: string;
}