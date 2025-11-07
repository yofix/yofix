#!/usr/bin/env node

import { Command } from "commander";
// VisualAnalyzer and FixGenerator removed - bot functionality no longer available
// ReportFormatter removed - bot functionality no longer available
import { RepositoryLearner } from "../core/setup/RepositoryLearner";
import { PatternStore } from "../core/setup/PatternStore";
import * as dotenv from "dotenv";
import * as path from "path";
import chalk from "chalk";
import * as fs from "fs";
import {
  config,
  exists,
  read,
  write,
  safeJSONParse,
  Validators,
} from "../core";

// Load environment variables with priority: .env.local > .env > system
const projectRoot = path.join(__dirname, "../../");
const envLocal = path.join(projectRoot, ".env.local");
const envDefault = path.join(projectRoot, ".env");

if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (fs.existsSync(envDefault)) {
  dotenv.config({ path: envDefault });
} else {
  dotenv.config(); // Load from system env
}

const program = new Command();

program
  .name("yofix")
  .description("YoFix CLI - AI-powered visual issue detection and auto-fix")
  .version("1.0.0");

program
  .command("scan <url>")
  .description("Scan a URL for visual issues")
  .option("-r, --routes <routes...>", "Specific routes to scan", ["/"])
  .option("-v, --viewports <viewports...>", "Viewports to test", [
    "1920x1080",
    "768x1024",
    "375x667",
  ])
  .option("-o, --output <file>", "Output results to file")
  .option(
    "--claude-key <key>",
    "Claude API key (or set CLAUDE_API_KEY env var)",
  )
  .action(async (url, options) => {
    const claudeKey = options.claudeKey || process.env.CLAUDE_API_KEY;

    if (!claudeKey) {
      console.error(
        chalk.red(
          "Error: Claude API key required. Set CLAUDE_API_KEY or use --claude-key",
        ),
      );
      process.exit(1);
    }

    console.log(chalk.blue(`🔍 Scanning ${url}...`));

    try {
      // const analyzer = new VisualAnalyzer(claudeKey); // Removed - bot functionality unavailable
      // const formatter = new ReportFormatter(); // Removed - bot functionality unavailable

      console.log(
        chalk.yellow(
          "⚠️ Visual analysis removed - only simple screenshot capture supported",
        ),
      );
      console.log(chalk.blue("Use the GitHub Action for full functionality"));
      process.exit(0);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command("fix <issue-file>")
  .description("Generate fixes for issues in a scan result file")
  .option(
    "--claude-key <key>",
    "Claude API key (or set CLAUDE_API_KEY env var)",
  )
  .option("-o, --output <file>", "Output fixes to file")
  .action(async (issueFile, options) => {
    const claudeKey =
      options.claudeKey ||
      config.get("claude-api-key", {
        defaultValue: process.env.CLAUDE_API_KEY,
      });

    if (!claudeKey) {
      console.error(chalk.red("Error: Claude API key required"));
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
      // const scanResult = parseResult.data;
      // const generator = new FixGenerator(claudeKey); // Removed - bot functionality unavailable
      // const formatter = new ReportFormatter(); // Removed - bot functionality unavailable

      console.log(
        chalk.yellow(
          "⚠️ Fix generation removed - only simple screenshot capture supported",
        ),
      );
      console.log(chalk.blue("Use the GitHub Action for full functionality"));
      process.exit(0);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command("setup")
  .description("Learn routing patterns from your codebase (one-time setup)")
  .option(
    "--claude-key <key>",
    "Claude API key (or set CLAUDE_API_KEY env var)",
  )
  .option("--force", "Force re-learning even if patterns exist")
  .option("--no-remote", "Skip remote storage (local only)")
  .action(async (options) => {
    try {
      const repoRoot = process.cwd();
      const claudeKey =
        options.claudeKey ||
        process.env.CLAUDE_API_KEY ||
        process.env.CLAUDE_API_KEY;

      if (!claudeKey) {
        console.error(chalk.red("❌ Error: Claude API key required"));
        console.error(
          chalk.gray(
            "   Set CLAUDE_API_KEY environment variable or use --claude-key",
          ),
        );
        process.exit(1);
      }

      // Check if patterns already exist
      const store = new PatternStore({ repoRoot });
      const metadata = await store.getMetadata();

      if (metadata.exists && !options.force) {
        console.log(chalk.yellow("⚠️  Patterns already exist"));
        console.log(chalk.gray(`   Framework: ${metadata.framework}`));
        console.log(
          chalk.gray(
            `   Confidence: ${((metadata.confidence || 0) * 100).toFixed(1)}%`,
          ),
        );
        console.log(chalk.gray(`   Learned: ${metadata.learnedAt}`));
        console.log(chalk.gray("\n   Use --force to re-learn"));
        process.exit(0);
      }

      console.log(chalk.blue.bold("\n🚀 YoFix Pattern Learning\n"));
      console.log(
        chalk.gray(
          "This will analyze your codebase to learn routing patterns.",
        ),
      );
      console.log(
        chalk.gray("This is a one-time setup that takes ~30-60 seconds.\n"),
      );

      // Create learner and learn patterns
      const learner = new RepositoryLearner(claudeKey, repoRoot);
      const patterns = await learner.learnRepository();
      const metrics = learner.getMetrics();

      // Save patterns
      await store.save(patterns, metrics);

      // Display results
      console.log(chalk.green.bold("\n🎉 Setup Complete!\n"));
      console.log(chalk.cyan("📊 Learned Patterns:"));
      console.log(chalk.gray(`   Framework: ${patterns.framework}`));
      console.log(
        chalk.gray(`   Confidence: ${(patterns.confidence * 100).toFixed(1)}%`),
      );
      console.log(
        chalk.gray(`   Routes Found: ${patterns.metadata?.routesFound || 0}`),
      );
      console.log(
        chalk.gray(
          `   Files Analyzed: ${patterns.metadata?.filesAnalyzed || 0}`,
        ),
      );

      console.log(chalk.cyan("\n💰 Cost:"));
      console.log(
        chalk.gray(`   Tokens Used: ${metrics.tokensUsed.toLocaleString()}`),
      );
      console.log(
        chalk.gray(`   Estimated Cost: $${metrics.estimatedCost.toFixed(4)}`),
      );
      console.log(
        chalk.gray(`   Duration: ${metrics.duration.seconds.toFixed(1)}s`),
      );

      console.log(chalk.cyan("\n📁 Storage:"));
      console.log(chalk.gray(`   Local: .yofix/patterns.json`));
      if (options.remote !== false) {
        console.log(chalk.gray(`   Remote: Saved`));
      }

      console.log(
        chalk.green(
          "\n✅ You can now run yofix with intelligent route detection!",
        ),
      );
      console.log(
        chalk.gray(
          "   Future PR analyses will use these patterns for fast, accurate route detection.\n",
        ),
      );
    } catch (error) {
      console.error(chalk.red(`\n❌ Setup failed: ${error.message}`));
      if (error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// Removed: 'analyze' command - now using route-impact-analyzer package via GitHub Action

program
  .command("test")
  .description("Test YoFix configuration")
  .action(() => {
    console.log(chalk.green("✅ YoFix CLI is installed correctly"));

    const claudeKey = process.env.CLAUDE_API_KEY;
    if (claudeKey) {
      console.log(chalk.green("✅ Claude API key found"));
    } else {
      console.log(chalk.yellow("⚠️ Claude API key not found in environment"));
    }

    const configPath = path.join(process.cwd(), ".yofix.yml");
    if (fs.existsSync(configPath)) {
      console.log(chalk.green(`✅ Configuration file found at ${configPath}`));
    } else {
      console.log(chalk.yellow("⚠️ No .yofix.yml configuration file found"));
    }
  });

program.parse();
