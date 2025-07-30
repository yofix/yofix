#!/usr/bin/env node

/**
 * Diagnostic script to troubleshoot GitHub comment posting issues
 * Usage: node diagnose-comments.js
 */

const { getOctokit } = require('@actions/github');
const core = require('@actions/core');

async function diagnose() {
  console.log('🔍 YoFix GitHub Comment Diagnostics\n');
  
  // Check environment
  const token = process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.GITHUB_PR_NUMBER || process.env.GITHUB_EVENT_NUMBER;
  
  console.log('1️⃣ Environment Check:');
  console.log(`   Repository: ${repo || '❌ NOT FOUND'}`);
  console.log(`   PR Number: ${prNumber || '❌ NOT FOUND'}`);
  console.log(`   Token: ${token ? '✅ Found' : '❌ NOT FOUND'}`);
  console.log('');
  
  if (!token || !repo) {
    console.error('❌ Missing required environment variables');
    console.log('\nMake sure you are running this in a GitHub Actions context');
    process.exit(1);
  }
  
  const [owner, repoName] = repo.split('/');
  const octokit = getOctokit(token);
  
  // Check token permissions
  console.log('2️⃣ Token Permissions Check:');
  try {
    const { data: rateLimit } = await octokit.rest.rateLimit.get();
    console.log(`   API Rate Limit: ${rateLimit.rate.remaining}/${rateLimit.rate.limit}`);
    
    // Try to get repo info
    const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo: repoName });
    console.log(`   Read Repository: ✅ ${repoInfo.full_name}`);
    
    // Check if we can list PRs
    if (prNumber) {
      try {
        const { data: pr } = await octokit.rest.pulls.get({
          owner,
          repo: repoName,
          pull_number: parseInt(prNumber)
        });
        console.log(`   Read PR #${prNumber}: ✅ "${pr.title}"`);
      } catch (e) {
        console.log(`   Read PR #${prNumber}: ❌ ${e.message}`);
      }
    }
    
    // Check if we can list comments
    if (prNumber) {
      try {
        const { data: comments } = await octokit.rest.issues.listComments({
          owner,
          repo: repoName,
          issue_number: parseInt(prNumber),
          per_page: 1
        });
        console.log(`   List Comments: ✅ (${comments.length} found)`);
      } catch (e) {
        console.log(`   List Comments: ❌ ${e.message}`);
      }
    }
    
    // Try to create a test comment
    if (prNumber && process.env.YOFIX_TEST_COMMENT === 'true') {
      try {
        const { data: comment } = await octokit.rest.issues.createComment({
          owner,
          repo: repoName,
          issue_number: parseInt(prNumber),
          body: '🔍 YoFix Diagnostic Test Comment\n\nThis is a test comment to verify permissions.\n\n_This comment can be deleted._'
        });
        console.log(`   Create Comment: ✅ (ID: ${comment.id})`);
        
        // Clean up test comment
        await octokit.rest.issues.deleteComment({
          owner,
          repo: repoName,
          comment_id: comment.id
        });
        console.log(`   Delete Comment: ✅`);
      } catch (e) {
        console.log(`   Create Comment: ❌ ${e.message}`);
        console.log('\n   💡 This is likely the issue - token lacks write permissions');
      }
    }
    
  } catch (error) {
    console.error(`   API Access: ❌ ${error.message}`);
  }
  
  console.log('');
  
  // Check GitHub Action context
  console.log('3️⃣ GitHub Action Context:');
  const eventName = process.env.GITHUB_EVENT_NAME;
  console.log(`   Event: ${eventName || 'Unknown'}`);
  
  if (eventName !== 'pull_request' && eventName !== 'pull_request_target') {
    console.log('   ⚠️  Warning: Not running in PR context');
    console.log('   Comments can only be posted on pull_request events');
  }
  
  // Check for common issues
  console.log('\n4️⃣ Common Issues Check:');
  
  // Check if running on fork
  const headRepo = process.env.GITHUB_HEAD_REF;
  const baseRepo = process.env.GITHUB_BASE_REF;
  if (headRepo && baseRepo) {
    console.log(`   Fork PR: ${headRepo !== baseRepo ? '⚠️  Yes (may have limited permissions)' : '✅ No'}`);
  }
  
  // Check workflow permissions
  const workflowPath = process.env.GITHUB_WORKFLOW;
  console.log(`   Workflow: ${workflowPath || 'Unknown'}`);
  console.log('\n   📝 Required workflow permissions:');
  console.log('      permissions:');
  console.log('        contents: read');
  console.log('        pull-requests: write');
  console.log('        issues: write');
  
  // Provide recommendations
  console.log('\n5️⃣ Recommendations:');
  
  if (!token) {
    console.log('   ❌ Add github-token to your YoFix action:');
    console.log('      with:');
    console.log('        github-token: ${{ secrets.GITHUB_TOKEN }}');
  }
  
  if (eventName !== 'pull_request') {
    console.log('   ❌ Use pull_request event trigger:');
    console.log('      on:');
    console.log('        pull_request:');
    console.log('          types: [opened, synchronize, reopened]');
  }
  
  console.log('\n✅ Diagnostic complete!');
  
  // Exit with appropriate code
  const hasIssues = !token || !prNumber || eventName !== 'pull_request';
  process.exit(hasIssues ? 1 : 0);
}

// Run diagnostics
diagnose().catch(error => {
  console.error('Diagnostic failed:', error);
  process.exit(1);
});