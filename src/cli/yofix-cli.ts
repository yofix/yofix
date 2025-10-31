#!/usr/bin/env node

import { Command } from 'commander';
import { VisualAnalyzer } from '../core/analysis/VisualAnalyzer';
import { FixGenerator } from '../core/fixes/FixGenerator';
import { ReportFormatter } from '../bot/ReportFormatter';
import { RepositoryLearner } from '../core/setup/RepositoryLearner';
import { PatternStore } from '../core/setup/PatternStore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';
import * as fs from 'fs';
import { config, exists, read, write, safeJSONParse, Validators } from '../core';

// Load environment variables with priority: .env.local > .env > system
const projectRoot = path.join(__dirname, '../../');
const envLocal = path.join(projectRoot, '.env.local');
const envDefault = path.join(projectRoot, '.env');

if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (fs.existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
} else {
  dotenv.config(); // Load from system env
}

const program = new Command();

program
  .name('yofix')
  .description('YoFix CLI - AI-powered visual issue detection and auto-fix')
  .version('1.0.0');

program
  .command('scan <url>')
  .description('Scan a URL for visual issues')
  .option('-r, --routes <routes...>', 'Specific routes to scan', ['/'])
  .option('-v, --viewports <viewports...>', 'Viewports to test', ['1920x1080', '768x1024', '375x667'])
  .option('-o, --output <file>', 'Output results to file')
  .option('--claude-key <key>', 'Claude API key (or set CLAUDE_API_KEY env var)')
  .action(async (url, options) => {
    const claudeKey = options.claudeKey || process.env.CLAUDE_API_KEY;
    
    if (!claudeKey) {
      console.error(chalk.red('Error: Claude API key required. Set CLAUDE_API_KEY or use --claude-key'));
      process.exit(1);
    }
    
    console.log(chalk.blue(`🔍 Scanning ${url}...`));
    
    try {
      const analyzer = new VisualAnalyzer(claudeKey);
      const formatter = new ReportFormatter();
      
      // Mock PR context for CLI usage
      const result = await analyzer.scan({
        prNumber: 0,
        routes: options.routes,
        viewports: options.viewports,
        options: {
          previewUrl: url,
          maxRoutes: 10
        }
      });
      
      const report = formatter.formatScanResult(result);
      
      if (options.output) {
        await write(options.output, report, { createDirectories: true });
        console.log(chalk.green(`✅ Results saved to ${options.output}`));
      } else {
        console.log(report);
      }
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('fix <issue-file>')
  .description('Generate fixes for issues in a scan result file')
  .option('--claude-key <key>', 'Claude API key (or set CLAUDE_API_KEY env var)')
  .option('-o, --output <file>', 'Output fixes to file')
  .action(async (issueFile, options) => {
    const claudeKey = options.claudeKey || config.get('claude-api-key', {
      defaultValue: process.env.CLAUDE_API_KEY
    });
    
    if (!claudeKey) {
      console.error(chalk.red('Error: Claude API key required'));
      process.exit(1);
    }
    
    try {
      const fileContent = await read(issueFile);
      if (!fileContent) {
        throw new Error(`Could not read file: ${issueFile}`);
      }
      const parseResult = safeJSONParse(fileContent);
      if (!parseResult.success) {
        throw new Error(`Invalid JSON in file: ${parseResult.error}`);
      }
      const scanResult = parseResult.data;
      const generator = new FixGenerator(claudeKey);
      const formatter = new ReportFormatter();
      
      console.log(chalk.blue(`🔧 Generating fixes for ${scanResult.issues.length} issues...`));
      
      const fixResult = await generator.generateFixes(scanResult.issues);
      const report = formatter.formatFixResult(fixResult);
      
      if (options.output) {
        await write(options.output, report, { createDirectories: true });
        console.log(chalk.green(`✅ Fixes saved to ${options.output}`));
      } else {
        console.log(report);
      }
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Learn routing patterns from your codebase (one-time setup)')
  .option('--claude-key <key>', 'Claude API key (or set CLAUDE_API_KEY env var)')
  .option('--force', 'Force re-learning even if patterns exist')
  .option('--no-remote', 'Skip remote storage (local only)')
  .action(async (options) => {
    try {
      const repoRoot = process.cwd();
      const claudeKey = options.claudeKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

      if (!claudeKey) {
        console.error(chalk.red('❌ Error: Claude API key required'));
        console.error(chalk.gray('   Set CLAUDE_API_KEY environment variable or use --claude-key'));
        process.exit(1);
      }

      // Check if patterns already exist
      const store = new PatternStore({ repoRoot });
      const metadata = await store.getMetadata();

      if (metadata.exists && !options.force) {
        console.log(chalk.yellow('⚠️  Patterns already exist'));
        console.log(chalk.gray(`   Framework: ${metadata.framework}`));
        console.log(chalk.gray(`   Confidence: ${((metadata.confidence || 0) * 100).toFixed(1)}%`));
        console.log(chalk.gray(`   Learned: ${metadata.learnedAt}`));
        console.log(chalk.gray('\n   Use --force to re-learn'));
        process.exit(0);
      }

      console.log(chalk.blue.bold('\n🚀 YoFix Pattern Learning\n'));
      console.log(chalk.gray('This will analyze your codebase to learn routing patterns.'));
      console.log(chalk.gray('This is a one-time setup that takes ~30-60 seconds.\n'));

      // Create learner and learn patterns
      const learner = new RepositoryLearner(claudeKey, repoRoot);
      const patterns = await learner.learnRepository();
      const metrics = learner.getMetrics();

      // Save patterns
      await store.save(patterns, metrics);

      // Display results
      console.log(chalk.green.bold('\n🎉 Setup Complete!\n'));
      console.log(chalk.cyan('📊 Learned Patterns:'));
      console.log(chalk.gray(`   Framework: ${patterns.framework}`));
      console.log(chalk.gray(`   Confidence: ${(patterns.confidence * 100).toFixed(1)}%`));
      console.log(chalk.gray(`   Routes Found: ${patterns.metadata?.routesFound || 0}`));
      console.log(chalk.gray(`   Files Analyzed: ${patterns.metadata?.filesAnalyzed || 0}`));

      console.log(chalk.cyan('\n💰 Cost:'));
      console.log(chalk.gray(`   Tokens Used: ${metrics.tokensUsed.toLocaleString()}`));
      console.log(chalk.gray(`   Estimated Cost: $${metrics.estimatedCost.toFixed(4)}`));
      console.log(chalk.gray(`   Duration: ${metrics.duration.seconds.toFixed(1)}s`));

      console.log(chalk.cyan('\n📁 Storage:'));
      console.log(chalk.gray(`   Local: .yofix/patterns.json`));
      if (options.remote !== false) {
        console.log(chalk.gray(`   Remote: Saved`));
      }

      console.log(chalk.green('\n✅ You can now run yofix with intelligent route detection!'));
      console.log(chalk.gray('   Future PR analyses will use these patterns for fast, accurate route detection.\n'));

    } catch (error) {
      console.error(chalk.red(`\n❌ Setup failed: ${error.message}`));
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program
  .command('analyze <file>')
  .description('Analyze which routes are impacted by a file change')
  .option('-v, --verbose', 'Show detailed analysis')
  .action(async (file, options) => {
    try {
      const repoRoot = process.cwd();

      console.log(chalk.blue.bold('\n🔍 YoFix Route Impact Analysis\n'));
      console.log(chalk.gray(`File: ${file}`));
      console.log(chalk.gray('─'.repeat(60)));

      // Check if patterns exist
      const store = new PatternStore({ repoRoot });
      const patterns = await store.load();

      if (!patterns) {
        console.log(chalk.yellow('\n⚠️  No learned patterns found'));
        console.log(chalk.gray('   Run "yofix setup" first to learn routing patterns\n'));
        process.exit(1);
      }

      console.log(chalk.green(`\n✓ Loaded patterns (${patterns.framework}, ${(patterns.confidence * 100).toFixed(0)}% confidence)`));

      // Import analyzer (need to use dynamic import since it's compiled)
      const { TreeSitterRouteAnalyzer } = require('../core/analysis/TreeSitterRouteAnalyzer');

      // Initialize analyzer
      const analyzer = new TreeSitterRouteAnalyzer(repoRoot);
      await analyzer.initialize();

      // Analyze file
      console.log(chalk.blue('\n📊 Analyzing route impact...\n'));
      const routeMap = await analyzer.detectRoutes([file]);

      // Get all routes from the map
      const allRoutes = new Set<string>();
      for (const [_, routes] of routeMap.entries()) {
        routes.forEach(route => allRoutes.add(route));
      }

      if (allRoutes.size === 0) {
        console.log(chalk.yellow('⚠️  No routes found that directly use this file'));
        console.log(chalk.gray('\n   This could mean:'));
        console.log(chalk.gray('   - The file is not a component used in routes'));
        console.log(chalk.gray('   - The file is a utility/helper'));
        console.log(chalk.gray('   - Import graph analysis needs more context\n'));
      } else {
        console.log(chalk.green.bold(`✓ Found ${allRoutes.size} impacted route(s):\n`));

        Array.from(allRoutes).sort().forEach((route, index) => {
          console.log(chalk.cyan(`   ${index + 1}. ${route}`));
        });

        if (options.verbose) {
          console.log(chalk.blue('\n📂 Analysis Details:'));
          console.log(chalk.gray(`   Component directories: ${patterns.patterns.componentPaths.directories.join(', ')}`));
          console.log(chalk.gray(`   Route locations: ${patterns.patterns.routeDefinitions.locations.join(', ')}`));
          console.log(chalk.gray(`   Reference style: ${patterns.patterns.componentPaths.referenceStyle}`));
        }

        console.log(chalk.green('\n✅ Analysis complete!\n'));
      }

    } catch (error) {
      console.error(chalk.red(`\n❌ Analysis failed: ${error.message}`));
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test YoFix configuration')
  .action(() => {
    console.log(chalk.green('✅ YoFix CLI is installed correctly'));

    const claudeKey = process.env.CLAUDE_API_KEY;
    if (claudeKey) {
      console.log(chalk.green('✅ Claude API key found'));
    } else {
      console.log(chalk.yellow('⚠️ Claude API key not found in environment'));
    }

    const configPath = path.join(process.cwd(), '.yofix.yml');
    if (fs.existsSync(configPath)) {
      console.log(chalk.green(`✅ Configuration file found at ${configPath}`));
    } else {
      console.log(chalk.yellow('⚠️ No .yofix.yml configuration file found'));
    }
  });

program.parse();