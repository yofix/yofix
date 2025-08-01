#!/usr/bin/env ts-node
/**
 * Test screenshot embedding functionality
 */

import { PRReporter } from '../src/pr-reporter';
import { VerificationResult, Screenshot, TestResult } from '../src/types';

// Mock screenshot data
const mockScreenshots: Screenshot[] = [
  {
    name: 'spa-loading-1920x1080',
    path: '/tmp/spa-loading-1920x1080.png',
    viewport: { name: 'Desktop', width: 1920, height: 1080 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/test-bucket/screenshots/spa-loading-1920x1080.png'
  },
  {
    name: 'spa-loading-768x1024',
    path: '/tmp/spa-loading-768x1024.png',
    viewport: { name: 'Tablet', width: 768, height: 1024 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/test-bucket/screenshots/spa-loading-768x1024.png'
  },
  {
    name: 'spa-loading-375x667',
    path: '/tmp/spa-loading-375x667.png',
    viewport: { name: 'Mobile', width: 375, height: 667 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/test-bucket/screenshots/spa-loading-375x667.png'
  },
  {
    name: 'route-test-1920x1080',
    path: '/tmp/route-test-1920x1080.png',
    viewport: { name: 'Desktop', width: 1920, height: 1080 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/test-bucket/screenshots/route-test-1920x1080.png'
  }
];

// Mock verification result
const mockResult: VerificationResult = {
  status: 'partial',
  totalTests: 4,
  passedTests: 3,
  failedTests: 1,
  skippedTests: 0,
  duration: 52900,
  testResults: [
    {
      testId: 'test-1',
      testName: 'React SPA Loading and Hydration',
      status: 'failed',
      duration: 16400,
      errors: ['Assertion failed: TimeoutError: Timeout 10000ms exceeded.'],
      screenshots: mockScreenshots,
      videos: [],
      consoleMessages: []
    }
  ],
  screenshotsUrl: 'https://storage.googleapis.com/test-bucket/screenshots',
  firebaseConfig: {
    projectId: 'test-project',
    target: 'default',
    buildSystem: 'react',
    previewUrl: 'https://test-project.web.app'
  },
  summary: {
    componentsVerified: ['HomePage', 'Navigation'],
    routesTested: ['/spa-loading', '/route-test'],
    issuesFound: ['TimeoutError: Timeout 10000ms exceeded.']
  }
};

async function testScreenshotEmbedding() {
  console.log('🧪 Testing Screenshot Embedding\n');

  // Mock the GitHub context properly
  jest.mock('@actions/github', () => ({
    context: {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo'
      },
      payload: {
        pull_request: {
          number: 42
        }
      }
    }
  }));

  // Clear module cache and re-require
  delete require.cache[require.resolve('@actions/github')];
  delete require.cache[require.resolve('../src/pr-reporter')];
  
  // Set up the mock before importing
  require('@actions/github').context = {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    },
    payload: {
      pull_request: {
        number: 42
      }
    }
  };

  // Now import the class
  const { PRReporter } = require('../src/pr-reporter');
  const reporter = new PRReporter('fake-token');
  
  // Generate the comment using the private method
  const comment = reporter['generateCommentBody'](mockResult, 'https://console.firebase.google.com/test');
  
  console.log('Generated PR Comment:\n');
  console.log('=' .repeat(80));
  console.log(comment);
  console.log('=' .repeat(80));
  
  // Check if screenshots are embedded
  const hasImages = comment.includes('<img src=');
  const hasTable = comment.includes('<table>');
  
  console.log('\n✅ Validation:');
  console.log(`   - Contains <img> tags: ${hasImages ? '✓' : '✗'}`);
  console.log(`   - Contains <table> layout: ${hasTable ? '✓' : '✗'}`);
  console.log(`   - Screenshots embedded: ${hasImages && hasTable ? 'YES' : 'NO'}`);
  
  // Count embedded images
  const imgCount = (comment.match(/<img /g) || []).length;
  console.log(`   - Number of images: ${imgCount}`);
}

testScreenshotEmbedding().catch(console.error);