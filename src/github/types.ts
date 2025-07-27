/**
 * GitHub integration types
 */

export interface PRComment {
  body: string;
  issue_number: number;
}

export interface PRStatus {
  state: 'pending' | 'success' | 'failure' | 'error';
  description: string;
  context: string;
  target_url?: string;
}

export interface AuthConfig {
  loginUrl: string;
  email: string;
  password: string;
  sessionCookieName?: string;
}