// Jest setup file for global test configuration
/// <reference types="jest" />

// Mock GitHub Actions core module
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
}));

// Mock GitHub context
jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    },
    payload: {
      pull_request: {
        number: 123
      }
    }
  },
  getOctokit: jest.fn(() => ({
    rest: {
      issues: {
        listComments: jest.fn(),
        createComment: jest.fn(),
        updateComment: jest.fn(),
      }
    }
  }))
}));

// Increase timeout for integration tests
jest.setTimeout(60000);