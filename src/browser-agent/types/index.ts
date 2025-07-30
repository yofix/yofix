import { Page, BrowserContext, Browser } from 'playwright';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DOMElement {
  id: string;
  index: number;
  xpath: string;
  selector: string;
  tag: string;
  text?: string;
  attributes: Record<string, string>;
  isInteractive: boolean;
  isVisible: boolean;
  isInViewport: boolean;
  boundingBox?: BoundingBox;
  children: string[];
  parent?: string;
}

export interface IndexedDOM {
  elements: Map<string, DOMElement>;
  interactiveElements: string[];
  screenshot?: Buffer;
  viewport: { width: number; height: number };
  url: string;
  title: string;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: Buffer;
  extractedContent?: string;
  elementIndex?: number;
  duration?: number;
}

export interface ActionDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  examples?: string[];
}

export interface StepResult {
  action: string;
  parameters: any;
  result: ActionResult;
  timestamp: number;
  screenshot?: Buffer;
  thinking?: string;
}

export interface AgentState {
  task: string;
  currentUrl: string;
  history: StepResult[];
  memory: Map<string, any>;
  fileSystem: Map<string, string>;
  completed: boolean;
  error?: string;
}

export interface AgentContext {
  page: Page;
  browser: Browser;
  context: BrowserContext;
  dom: IndexedDOM;
  state: AgentState;
}

export interface LLMResponse {
  action: string;
  parameters: any;
  thinking?: string;
  confidence?: number;
  // Completion check fields
  completed?: boolean;
  reason?: string;
  next_action?: string;
}

export interface TaskResult {
  success: boolean;
  steps: StepResult[];
  finalUrl: string;
  error?: string;
  duration: number;
  screenshots: Buffer[];
}

export interface AgentOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  maxSteps?: number;
  timeout?: number;
  llmProvider?: 'openai' | 'anthropic' | 'custom';
  llmModel?: string;
  debug?: boolean;
  plugins?: string[];
  useVisionMode?: boolean;
}

export interface Plugin {
  name: string;
  version: string;
  initialize(agent: any): Promise<void>;
  actions?: ActionDefinition[];
  middleware?: Array<(context: AgentContext, next: () => Promise<any>) => Promise<any>>;
}

export interface MemoryEntry {
  key: string;
  value: any;
  timestamp: number;
  category?: string;
  ttl?: number;
}

export interface Pattern {
  id: string;
  pattern: string;
  solution: string;
  successRate: number;
  lastUsed: number;
}

export interface VisualIssue {
  type: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  element?: DOMElement;
  screenshot?: Buffer;
  suggestedFix?: string;
}

export interface AuthCredentials {
  username?: string;
  email?: string;
  password: string;
  totpSecret?: string;
  customFields?: Record<string, string>;
}

export interface AuthResult extends ActionResult {
  method: 'smart' | 'selector' | 'manual';
  loginTime: number;
  verificationMethod?: string;
}

export interface BrowserAction {
  type: string;
  parameters?: Record<string, any>;
  params?: Record<string, any>;
  url?: string;
  script?: string;
  text?: string;
  filePath?: string;
  [key: string]: any;
}