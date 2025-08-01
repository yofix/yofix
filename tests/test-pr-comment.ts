#!/usr/bin/env ts-node
/**
 * Test PR comment generation with embedded screenshots
 */

// First set up the mock context before any imports
const mockContext = {
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

// Mock the @actions/github module
jest.mock('@actions/github', () => ({
  context: mockContext,
  getOctokit: () => ({
    rest: {
      issues: {
        listComments: jest.fn(),
        createComment: jest.fn(),
        updateComment: jest.fn()
      }
    }
  })
}));

import { VerificationResult, Screenshot } from '../src/types';

// Mock screenshot data
const mockScreenshots: Screenshot[] = [
  {
    name: 'home-page-1920x1080',
    path: '/tmp/home-page-1920x1080.png',
    viewport: { name: 'Desktop', width: 1920, height: 1080 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/frontend-qa/screenshots/home-page-1920x1080.png'
  },
  {
    name: 'home-page-768x1024',
    path: '/tmp/home-page-768x1024.png',
    viewport: { name: 'Tablet', width: 768, height: 1024 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/frontend-qa/screenshots/home-page-768x1024.png'
  },
  {
    name: 'home-page-375x667',
    path: '/tmp/home-page-375x667.png',
    viewport: { name: 'Mobile', width: 375, height: 667 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/frontend-qa/screenshots/home-page-375x667.png'
  },
  {
    name: 'dashboard-1920x1080',
    path: '/tmp/dashboard-1920x1080.png',
    viewport: { name: 'Desktop', width: 1920, height: 1080 },
    timestamp: Date.now(),
    firebaseUrl: 'https://storage.googleapis.com/frontend-qa/screenshots/dashboard-1920x1080.png'
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
  screenshotsUrl: 'https://storage.googleapis.com/frontend-qa/screenshots',
  firebaseConfig: {
    projectId: 'arboreal-vision-339901',
    target: 'default',
    buildSystem: 'react',
    previewUrl: 'https://arboreal-vision-339901--pr-3131-92ely4j9.web.app'
  },
  summary: {
    componentsVerified: ['HomePage', 'Navigation', 'Dashboard'],
    routesTested: ['/home', '/dashboard'],
    issuesFound: ['TimeoutError: Timeout 10000ms exceeded.']
  }
};

async function testPRComment() {
  console.log('🧪 Testing PR Comment Generation with Embedded Screenshots\n');

  // Import after mocking
  const { PRReporter } = require('../src/pr-reporter');
  
  try {
    const reporter = new PRReporter('fake-token');
    
    // Access the private method using bracket notation
    const comment = reporter['generateCommentBody'](mockResult, 'https://console.firebase.google.com/u/0/project/arboreal-vision-339901/storage');
    
    console.log('Generated PR Comment:');
    console.log('=' .repeat(80));
    console.log(comment);
    console.log('=' .repeat(80));
    
    // Validation
    const hasImages = comment.includes('<img src=');
    const hasTable = comment.includes('<table>');
    const imgCount = (comment.match(/<img /g) || []).length;
    const tableCount = (comment.match(/<table>/g) || []).length;
    
    console.log('\n✅ Validation Results:');
    console.log(`   - Contains <img> tags: ${hasImages ? '✓' : '✗'}`);
    console.log(`   - Contains <table> layout: ${hasTable ? '✓' : '✗'}`);
    console.log(`   - Number of images: ${imgCount} (expected: 4)`);
    console.log(`   - Number of tables: ${tableCount}`);
    console.log(`   - Screenshots embedded: ${hasImages && hasTable ? 'YES ✓' : 'NO ✗'}`);
    
    // Extract route names to verify
    console.log('\n📋 Routes Detected:');
    const routeMatches = comment.match(/#### Route: `([^`]+)`/g);
    if (routeMatches) {
      routeMatches.forEach(match => {
        const route = match.replace(/#### Route: `/, '').replace(/`/, '');
        console.log(`   - ${route}`);
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPRComment();