#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const VisualAnalyzer_1 = require("../analysis/VisualAnalyzer");
const FixGenerator_1 = require("../fixes/FixGenerator");
const ReportFormatter_1 = require("../bot/ReportFormatter");
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
dotenv.config();
const program = new commander_1.Command();
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
        console.error(chalk_1.default.red('Error: Claude API key required. Set CLAUDE_API_KEY or use --claude-key'));
        process.exit(1);
    }
    console.log(chalk_1.default.blue(`🔍 Scanning ${url}...`));
    try {
        const analyzer = new VisualAnalyzer_1.VisualAnalyzer(claudeKey);
        const formatter = new ReportFormatter_1.ReportFormatter();
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
            fs.writeFileSync(options.output, report);
            console.log(chalk_1.default.green(`✅ Results saved to ${options.output}`));
        }
        else {
            console.log(report);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error: ${error.message}`));
        process.exit(1);
    }
});
program
    .command('fix <issue-file>')
    .description('Generate fixes for issues in a scan result file')
    .option('--claude-key <key>', 'Claude API key (or set CLAUDE_API_KEY env var)')
    .option('-o, --output <file>', 'Output fixes to file')
    .action(async (issueFile, options) => {
    const claudeKey = options.claudeKey || process.env.CLAUDE_API_KEY;
    if (!claudeKey) {
        console.error(chalk_1.default.red('Error: Claude API key required'));
        process.exit(1);
    }
    try {
        const scanResult = JSON.parse(fs.readFileSync(issueFile, 'utf-8'));
        const generator = new FixGenerator_1.FixGenerator(claudeKey);
        const formatter = new ReportFormatter_1.ReportFormatter();
        console.log(chalk_1.default.blue(`🔧 Generating fixes for ${scanResult.issues.length} issues...`));
        const fixResult = await generator.generateFixes(scanResult.issues);
        const report = formatter.formatFixResult(fixResult);
        if (options.output) {
            fs.writeFileSync(options.output, report);
            console.log(chalk_1.default.green(`✅ Fixes saved to ${options.output}`));
        }
        else {
            console.log(report);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error: ${error.message}`));
        process.exit(1);
    }
});
program
    .command('test')
    .description('Test YoFix configuration')
    .action(() => {
    console.log(chalk_1.default.green('✅ YoFix CLI is installed correctly'));
    const claudeKey = process.env.CLAUDE_API_KEY;
    if (claudeKey) {
        console.log(chalk_1.default.green('✅ Claude API key found'));
    }
    else {
        console.log(chalk_1.default.yellow('⚠️ Claude API key not found in environment'));
    }
    const configPath = path.join(process.cwd(), '.yofix.yml');
    if (fs.existsSync(configPath)) {
        console.log(chalk_1.default.green(`✅ Configuration file found at ${configPath}`));
    }
    else {
        console.log(chalk_1.default.yellow('⚠️ No .yofix.yml configuration file found'));
    }
});
program.parse();
