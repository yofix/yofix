/**
 * Tests for EnvironmentHook
 */

import {
  EnvironmentHook,
  NodeEnvironmentHook,
  MockEnvironmentHook,
  EnvironmentHookFactory,
  getEnvironment,
  env
} from '../EnvironmentHook';

describe('EnvironmentHook', () => {
  describe('NodeEnvironmentHook', () => {
    let hook: NodeEnvironmentHook;
    const originalEnv = process.env;

    beforeEach(() => {
      hook = new NodeEnvironmentHook();
      // Create a clean environment for testing
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('get', () => {
      it('should return environment variable value', () => {
        process.env.TEST_VAR = 'test-value';
        expect(hook.get('TEST_VAR')).toBe('test-value');
      });

      it('should return undefined for non-existent variable', () => {
        expect(hook.get('NON_EXISTENT')).toBeUndefined();
      });

      it('should return default value when variable does not exist', () => {
        expect(hook.get('NON_EXISTENT', 'default')).toBe('default');
      });

      it('should return actual value when variable exists, ignoring default', () => {
        process.env.TEST_VAR = 'actual';
        expect(hook.get('TEST_VAR', 'default')).toBe('actual');
      });
    });

    describe('getRequired', () => {
      it('should return environment variable value', () => {
        process.env.REQUIRED_VAR = 'required-value';
        expect(hook.getRequired('REQUIRED_VAR')).toBe('required-value');
      });

      it('should throw error for missing required variable', () => {
        expect(() => hook.getRequired('MISSING_REQUIRED')).toThrow(
          'Required environment variable MISSING_REQUIRED is not set'
        );
      });
    });

    describe('has', () => {
      it('should return true for existing variable', () => {
        process.env.EXISTS = 'value';
        expect(hook.has('EXISTS')).toBe(true);
      });

      it('should return false for non-existent variable', () => {
        expect(hook.has('DOES_NOT_EXIST')).toBe(false);
      });

      it('should return true even for empty string values', () => {
        process.env.EMPTY = '';
        expect(hook.has('EMPTY')).toBe(true);
      });
    });

    describe('getByPrefix', () => {
      it('should return all variables with prefix', () => {
        process.env.PREFIX_ONE = 'value1';
        process.env.PREFIX_TWO = 'value2';
        process.env.OTHER_VAR = 'other';

        const result = hook.getByPrefix('PREFIX_');
        expect(result).toEqual({
          PREFIX_ONE: 'value1',
          PREFIX_TWO: 'value2'
        });
      });

      it('should return empty object when no variables match prefix', () => {
        const result = hook.getByPrefix('NONEXISTENT_');
        expect(result).toEqual({});
      });
    });

    describe('set and unset', () => {
      it('should set environment variable', () => {
        hook.set('NEW_VAR', 'new-value');
        expect(process.env.NEW_VAR).toBe('new-value');
        expect(hook.get('NEW_VAR')).toBe('new-value');
      });

      it('should unset environment variable', () => {
        process.env.TO_DELETE = 'will-be-deleted';
        hook.unset('TO_DELETE');
        expect(process.env.TO_DELETE).toBeUndefined();
        expect(hook.has('TO_DELETE')).toBe(false);
      });
    });

    describe('getWithDefaults', () => {
      it('should return environment variable if set', () => {
        process.env.TEST_VAR = 'real-value';
        expect(hook.getWithDefaults('TEST_VAR')).toBe('real-value');
      });

      it('should return GitHub token default when no env var', () => {
        delete process.env.GITHUB_TOKEN;
        expect(hook.getWithDefaults('GITHUB_TOKEN')).toBe('mock-github-token');
      });
      
      it('should return Firebase defaults when no env vars', () => {
        delete process.env.FIREBASE_PROJECT_ID;
        expect(hook.getWithDefaults('FIREBASE_PROJECT_ID')).toBe('yofix-test-project');
      });
      
      it('should return S3 defaults when no env vars', () => {
        delete process.env.AWS_ACCESS_KEY_ID;
        expect(hook.getWithDefaults('AWS_ACCESS_KEY_ID')).toBe('MOCK_ACCESS_KEY_ID');
      });
      
      it('should return undefined for unknown variables', () => {
        expect(hook.getWithDefaults('UNKNOWN_VAR')).toBeUndefined();
      });

      it('should integrate with .env.local loading system', () => {
        // This test verifies that the enhanced getWithDefaults includes .env.local support
        // The actual .env.local values will be loaded if the file exists
        const claudeKey = hook.getWithDefaults('CLAUDE_API_KEY');
        
        // Should either return the value from .env.local or the default
        expect(claudeKey).toBeDefined();
        expect(typeof claudeKey).toBe('string');
        
        // If .env.local exists and has a real key, it should start with 'sk-ant-'
        // Otherwise it should be the mock key
        if (claudeKey?.startsWith('sk-ant-')) {
          expect(claudeKey).toMatch(/^sk-ant-/);
        } else {
          expect(claudeKey).toBe('mock-claude-api-key');
        }
      });
    });

    describe('getEnvironment', () => {
      it('should return production for NODE_ENV=production', () => {
        process.env.NODE_ENV = 'production';
        expect(hook.getEnvironment()).toBe('production');
      });

      it('should return development for NODE_ENV=development', () => {
        process.env.NODE_ENV = 'development';
        expect(hook.getEnvironment()).toBe('development');
      });

      it('should return test for NODE_ENV=test', () => {
        process.env.NODE_ENV = 'test';
        expect(hook.getEnvironment()).toBe('test');
      });

      it('should return unknown for unrecognized NODE_ENV', () => {
        process.env.NODE_ENV = 'staging';
        expect(hook.getEnvironment()).toBe('unknown');
      });

      it('should return unknown when NODE_ENV is not set', () => {
        delete process.env.NODE_ENV;
        expect(hook.getEnvironment()).toBe('unknown');
      });
    });
  });

  describe('MockEnvironmentHook', () => {
    let hook: MockEnvironmentHook;

    beforeEach(() => {
      hook = new MockEnvironmentHook({
        EXISTING_VAR: 'existing-value',
        NODE_ENV: 'test'
      });
    });

    describe('get', () => {
      it('should return mock environment variable value', () => {
        expect(hook.get('EXISTING_VAR')).toBe('existing-value');
      });

      it('should return undefined for non-existent variable', () => {
        expect(hook.get('NON_EXISTENT')).toBeUndefined();
      });

      it('should return default value when variable does not exist', () => {
        expect(hook.get('NON_EXISTENT', 'default')).toBe('default');
      });
    });

    describe('getRequired', () => {
      it('should return mock environment variable value', () => {
        expect(hook.getRequired('EXISTING_VAR')).toBe('existing-value');
      });

      it('should throw error for missing required variable', () => {
        expect(() => hook.getRequired('MISSING_REQUIRED')).toThrow(
          'Required environment variable MISSING_REQUIRED is not set'
        );
      });
    });

    describe('set and unset', () => {
      it('should set mock environment variable', () => {
        hook.set('NEW_VAR', 'new-value');
        expect(hook.get('NEW_VAR')).toBe('new-value');
        expect(hook.has('NEW_VAR')).toBe(true);
      });

      it('should unset mock environment variable', () => {
        hook.unset('EXISTING_VAR');
        expect(hook.get('EXISTING_VAR')).toBeUndefined();
        expect(hook.has('EXISTING_VAR')).toBe(false);
      });
    });

    describe('clear and loadFromObject', () => {
      it('should clear all variables', () => {
        hook.clear();
        expect(hook.get('EXISTING_VAR')).toBeUndefined();
        expect(hook.get('NODE_ENV')).toBeUndefined();
      });

      it('should load variables from object', () => {
        hook.loadFromObject({
          VAR1: 'value1',
          VAR2: 'value2'
        });

        expect(hook.get('VAR1')).toBe('value1');
        expect(hook.get('VAR2')).toBe('value2');
        expect(hook.get('EXISTING_VAR')).toBeUndefined(); // Should be cleared
      });
    });

    describe('getByPrefix', () => {
      it('should return variables with prefix from mock data', () => {
        hook.set('PREFIX_ONE', 'value1');
        hook.set('PREFIX_TWO', 'value2');
        hook.set('OTHER_VAR', 'other');

        const result = hook.getByPrefix('PREFIX_');
        expect(result).toEqual({
          PREFIX_ONE: 'value1',
          PREFIX_TWO: 'value2'
        });
      });
    });
  });

  describe('EnvironmentHookFactory', () => {
    afterEach(() => {
      EnvironmentHookFactory.reset();
    });

    it('should return singleton instance', () => {
      const hook1 = EnvironmentHookFactory.getHook();
      const hook2 = EnvironmentHookFactory.getHook();
      expect(hook1).toBe(hook2);
    });

    it('should allow custom hook override', () => {
      const customHook = new MockEnvironmentHook();
      EnvironmentHookFactory.setHook(customHook);
      
      const hook = EnvironmentHookFactory.getHook();
      expect(hook).toBe(customHook);
    });

    it('should reset to clean state', () => {
      const hook1 = EnvironmentHookFactory.getHook();
      EnvironmentHookFactory.reset();
      const hook2 = EnvironmentHookFactory.getHook();
      
      expect(hook1).not.toBe(hook2);
    });

    it('should create NodeEnvironmentHook by default in non-test environment', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      EnvironmentHookFactory.reset();
      const hook = EnvironmentHookFactory.getHook();
      
      expect(hook).toBeInstanceOf(NodeEnvironmentHook);
      
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('getEnvironment helper', () => {
    afterEach(() => {
      EnvironmentHookFactory.reset();
    });

    it('should return the factory hook instance', () => {
      const factoryHook = EnvironmentHookFactory.getHook();
      const helperHook = getEnvironment();
      
      expect(helperHook).toBe(factoryHook);
    });
  });

  describe('env convenience object', () => {
    let mockHook: MockEnvironmentHook;

    beforeEach(() => {
      mockHook = new MockEnvironmentHook({
        TEST_VAR: 'test-value',
        NODE_ENV: 'development'
      });
      EnvironmentHookFactory.setHook(mockHook);
    });

    afterEach(() => {
      EnvironmentHookFactory.reset();
    });

    it('should provide get method', () => {
      expect(env.get('TEST_VAR')).toBe('test-value');
      expect(env.get('MISSING', 'default')).toBe('default');
    });
    
    it('should provide getWithDefaults method', () => {
      expect(env.getWithDefaults('TEST_VAR')).toBe('test-value');
      
      // GitHub token might be loaded from .env.local or use mock default
      const githubToken = env.getWithDefaults('GITHUB_TOKEN');
      expect(githubToken).toBeDefined();
      expect(typeof githubToken).toBe('string');
      
      // Should be either real token from .env.local or mock token
      if (githubToken?.startsWith('ghp_') || githubToken?.startsWith('gho_') || githubToken?.startsWith('ghs_')) {
        // Real GitHub token from .env.local
        expect(githubToken).toMatch(/^gh[phos]_/);
      } else {
        // Mock token
        expect(githubToken).toBe('mock-github-token');
      }
    });

    it('should provide getRequired method', () => {
      expect(env.getRequired('TEST_VAR')).toBe('test-value');
      expect(() => env.getRequired('MISSING')).toThrow();
    });

    it('should provide has method', () => {
      expect(env.has('TEST_VAR')).toBe(true);
      expect(env.has('MISSING')).toBe(false);
    });

    it('should provide is method', () => {
      expect(env.is('TEST_VAR', 'test-value')).toBe(true);
      expect(env.is('TEST_VAR', 'wrong-value')).toBe(false);
    });

    it('should provide environment check methods', () => {
      expect(env.isDevelopment()).toBe(true);
      expect(env.isProduction()).toBe(false);
      expect(env.isTest()).toBe(false);

      mockHook.set('NODE_ENV', 'production');
      expect(env.isProduction()).toBe(true);
      expect(env.isDevelopment()).toBe(false);

      mockHook.set('NODE_ENV', 'test');
      expect(env.isTest()).toBe(true);
      expect(env.isProduction()).toBe(false);
    });
  });
});