#!/usr/bin/env node

import { Command } from 'commander';
import { VisualAnalyzer } from '../core/analysis/VisualAnalyzer';
import { FixGenerator } from '../core/fixes/FixGenerator';
import { ReportFormatter } from '../bot/ReportFormatter';
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