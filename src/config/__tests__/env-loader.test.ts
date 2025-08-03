/**
 * Tests for .env.local file loading functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadEnvLocal, loadEnvironmentConfig, initializeEnvironment } from '../env-loader';

describe('env-loader', () => {
  const testDir = '/tmp/yofix-test';
  const envLocalPath = path.join(testDir, '.env.local');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(envLocalPath)) {
      fs.unlinkSync(envLocalPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });

  describe('loadEnvLocal', () => {
    it('should return empty object when .env.local does not exist', () => {
      const result = loadEnvLocal(testDir);
      expect(result).toEqual({});
    });

    it('should parse simple KEY=VALUE pairs', () => {
      const envContent = `
# Comment line
API_KEY=test-key-123
DATABASE_URL=postgresql://localhost:5432/test

# Another comment
DEBUG=true
`;

      fs.writeFileSync(envLocalPath, envContent);
      const result = loadEnvLocal(testDir);

      expect(result).toEqual({
        API_KEY: 'test-key-123',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        DEBUG: 'true'
      });
    });

    it('should handle quoted values', () => {
      const envContent = `
QUOTED_SINGLE='single quoted value'
QUOTED_DOUBLE="double quoted value"
UNQUOTED=unquoted value
`;

      fs.writeFileSync(envLocalPath, envContent);
      const result = loadEnvLocal(testDir);

      expect(result).toEqual({
        QUOTED_SINGLE: 'single quoted value',
        QUOTED_DOUBLE: 'double quoted value',
        UNQUOTED: 'unquoted value'
      });
    });

    it('should skip empty lines and comments', () => {
      const envContent = `
# This is a comment

# Another comment
VALID_KEY=valid_value
# Final comment
`;

      fs.writeFileSync(envLocalPath, envContent);
      const result = loadEnvLocal(testDir);

      expect(result).toEqual({
        VALID_KEY: 'valid_value'
      });
    });

    it('should handle values with equals signs', () => {
      const envContent = `
BASE64_KEY=dGVzdD1rZXk=
URL_WITH_PARAMS=http://example.com?param1=value1&param2=value2
`;

      fs.writeFileSync(envLocalPath, envContent);
      const result = loadEnvLocal(testDir);

      expect(result).toEqual({
        BASE64_KEY: 'dGVzdD1rZXk=',
        URL_WITH_PARAMS: 'http://example.com?param1=value1&param2=value2'
      });
    });
  });

  describe('loadEnvironmentConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Create a clean environment
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should merge .env.local with process.env, giving precedence to process.env', () => {
      const envContent = `
API_KEY=from-env-local
DATABASE_URL=from-env-local
ONLY_IN_ENV_LOCAL=local-only
`;

      fs.writeFileSync(envLocalPath, envContent);
      
      // Set some process.env values
      process.env.API_KEY = 'from-process-env';
      process.env.ONLY_IN_PROCESS_ENV = 'process-only';

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue(testDir);

      const result = loadEnvironmentConfig();

      expect(result).toEqual(expect.objectContaining({
        API_KEY: 'from-process-env',          // process.env wins
        DATABASE_URL: 'from-env-local',       // from .env.local
        ONLY_IN_ENV_LOCAL: 'local-only',      // from .env.local
        ONLY_IN_PROCESS_ENV: 'process-only'   // from process.env
      }));

      process.cwd = originalCwd;
    });
  });

  describe('initializeEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should only set variables that are not already in process.env', () => {
      const envContent = `
API_KEY=from-env-local
DATABASE_URL=from-env-local
NEW_VAR=new-value
`;

      fs.writeFileSync(envLocalPath, envContent);
      
      // Set one variable in process.env
      process.env.API_KEY = 'existing-value';

      // Mock process.cwd to return our test directory
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue(testDir);

      initializeEnvironment();

      expect(process.env.API_KEY).toBe('existing-value');      // Should not be overridden
      expect(process.env.DATABASE_URL).toBe('from-env-local'); // Should be set from .env.local
      expect(process.env.NEW_VAR).toBe('new-value');           // Should be set from .env.local

      process.cwd = originalCwd;
    });
  });

  describe('Real .env.local integration', () => {
    it('should load actual .env.local file from project root', () => {
      // This test uses the actual .env.local file in the project
      const projectRoot = path.resolve(__dirname, '../../..');
      const envLocalPath = path.join(projectRoot, '.env.local');
      
      // Skip test if .env.local doesn't exist
      if (!fs.existsSync(envLocalPath)) {
        console.log('Skipping .env.local integration test - file not found');
        return;
      }
      
      const result = loadEnvLocal(projectRoot);

      // Check that it contains expected keys from the actual .env.local
      expect(result).toEqual(expect.objectContaining({
        CLAUDE_API_KEY: expect.any(String),
        ANTHROPIC_API_KEY: expect.any(String),
        TEST_WEBSITE_URL: expect.any(String)
      }));

      // Verify specific values from the actual file
      expect(result.TEST_WEBSITE_URL).toBe('app.tryloop.ai');
      expect(result.TEST_AUTH_EMAIL).toBe('hari@tryloop.ai');
      expect(result.YOFIX_HEADLESS).toBe('false');
    });
  });
});