# YoFix Comment Commands

YoFix supports triggering operations directly from GitHub pull request comments using `@yofix` commands. This provides an interactive way to run visual testing and other operations on-demand.

## Table of Contents

- [Setup](#setup)
- [Available Commands](#available-commands)
- [Adding New Commands](#adding-new-commands)
- [Architecture](#architecture)

## Setup

### 1. Configure Your Workflow

To enable comment commands, your GitHub Actions workflow must listen to `issue_comment` events:

```yaml
name: YoFix Visual Testing

on:
  pull_request:
    types: [opened, synchronize, reopened]

  # Enable comment commands
  issue_comment:
    types: [created]

jobs:
  visual-testing:
    # Only run on pull requests or when comment contains @yofix
    if: |
      github.event_name == 'pull_request' ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       contains(github.event.comment.body, '@yofix'))

    runs-on: ubuntu-latest

    permissions:
      contents: read
      pull-requests: write
      issues: write

    steps:
      - uses: actions/checkout@v4

      - uses: yofix/yofix@main
        with:
          preview-url: ${{ secrets.PREVIEW_URL }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          claude-api-key: ${{ secrets.CLAUDE_API_KEY }}
          claude-model: 'claude-sonnet-4-5-20250929'
          # ... other configuration
```

See [.github/workflows/yofix-comment-commands.example.yml](../.github/workflows/yofix-comment-commands.example.yml) for a complete example.

### 2. Required Permissions

Ensure your workflow has these permissions:
- `contents: read` - Read repository code
- `pull-requests: write` - Post comments on PRs
- `issues: write` - React to comments with emojis

## Available Commands

### `@yofix test`

Test a specific URL with visual regression testing.

**Syntax:**
```
@yofix test <url> [viewports]
```

**Examples:**

Test with default viewports:
```
@yofix test "https://app.example.com/dashboard"
```

Test with custom viewports:
```
@yofix test https://app.example.com/dashboard 360x700,1080x1200
```

Test multiple viewports:
```
@yofix test https://app.example.com/dashboard 375x667,768x1024,1920x1080
```

**Behavior:**
1. YoFix reacts with 👀 (eyes emoji) to acknowledge the command
2. Captures screenshots in specified viewports (or defaults)
3. Compares with baselines (or creates them from production URL)
4. **Posts results as a reply to your comment** - maintaining conversation continuity
5. Reacts with ✅ (green check) when complete

**Comment Threading:** Results from `@yofix` commands are posted as direct replies to the triggering comment, keeping all related discussion in one thread. Regular PR runs (not triggered by comments) post to the main YoFix comment.

**Notes:**
- URL can be quoted or unquoted
- Viewports format: `widthxheight,widthxheight` (e.g., `360x700,1080x1200`)
- If no viewports specified, uses default from action configuration
- Requires authentication credentials if site needs login

## Adding New Commands

YoFix uses a **scalable command registry pattern** that makes it easy to add new commands without modifying core logic.

### Quick Start: Create a New Command

1. **Create Command Class**

Create a new file in `src/core/github/commands/YourCommand.ts`:

```typescript
import {
  BaseCommand,
  ParsedCommandData,
  CommandValidationResult,
  CommandExecutionResult,
  CommandContext,
} from './BaseCommand';
import { StepData } from '../../../steps/shared/StepDataManager';

export class YourCommand extends BaseCommand {
  readonly name = 'yourcommand';
  readonly description = 'Description of what your command does';
  readonly usage = '@yofix yourcommand <arg1> [arg2]\n\nExample:\n  @yofix yourcommand value1 value2';

  /**
   * Parse command from comment body
   */
  parse(commentBody: string): ParsedCommandData | null {
    const pattern = /@yofix\s+yourcommand\s+([^\s]+)(?:\s+([^\s]+))?/i;
    const match = commentBody.match(pattern);

    if (!match) {
      return null;
    }

    const [raw, arg1, arg2] = match;

    return {
      command: 'yourcommand',
      args: [arg1, arg2].filter(Boolean),
      raw,
    };
  }

  /**
   * Validate command arguments
   */
  validate(parsed: ParsedCommandData): CommandValidationResult {
    if (parsed.args.length === 0) {
      return {
        valid: false,
        error: 'Your command requires at least one argument.\n\nUsage:\n' + this.usage,
      };
    }

    // Add your validation logic here

    return { valid: true };
  }

  /**
   * Execute the command
   */
  async execute(
    parsed: ParsedCommandData,
    context: CommandContext,
    stepData: StepData
  ): Promise<CommandExecutionResult> {
    try {
      // Your command logic here

      return {
        success: true,
        stepData: {
          // Add any data you want to pass to subsequent steps
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute command: ${error}`,
      };
    }
  }
}
```

2. **Register the Command**

In `src/core/github/commands/CommandRegistry.ts`, add your command to `registerBuiltInCommands()`:

```typescript
private registerBuiltInCommands(): void {
  this.registerCommand(new TestCommand());
  this.registerCommand(new YourCommand());  // Add this line
}
```

3. **That's it!**

The command is now automatically available. Users can use it by commenting:
```
@yofix yourcommand arg1 arg2
```

### Example: PageLoad Command

See `src/core/github/commands/PageLoadCommand.example.ts` for a complete example of a future command that measures page load performance.

To enable it:
1. Rename `PageLoadCommand.example.ts` to `PageLoadCommand.ts`
2. Implement the actual measurement logic in `execute()`
3. Register in `CommandRegistry.ts`

## Architecture

### Command Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. User posts comment: @yofix test https://example.com │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 2. GitHub triggers issue_comment event                  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Step 0.5: Handle Comment Command                     │
│    - Detects issue_comment event                        │
│    - Reacts with 👀 to acknowledge                       │
│    - Parses comment using CommandRegistry               │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 4. CommandRegistry.parseComment()                       │
│    - Tries each registered command's parse() method     │
│    - Returns matching command + parsed data             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Command.validate()                                   │
│    - Validates arguments                                │
│    - Returns validation result                          │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Command.execute()                                    │
│    - Performs command-specific logic                    │
│    - Returns step data modifications                    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Continue with normal YoFix workflow                  │
│    - Step 1: Analyze Routes (skipped for test command) │
│    - Step 2: Browse Routes & Capture Screenshots       │
│    - Step 2.5: Compare Baselines                       │
│    - Step 3: Upload to Storage                         │
│    - Step 4: Post Results                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 8. React with ✅ to mark complete                        │
└─────────────────────────────────────────────────────────┘
```

### Key Components

**CommandRegistry** (`src/core/github/commands/CommandRegistry.ts`)
- Singleton that manages all available commands
- Automatically tries each command's `parse()` method
- Provides help text generation
- Easy to extend with new commands

**BaseCommand** (`src/core/github/commands/BaseCommand.ts`)
- Abstract base class for all commands
- Provides common utilities (URL extraction, viewport parsing)
- Enforces consistent interface

**Command Classes** (`src/core/github/commands/*Command.ts`)
- Each command is self-contained
- Implements: `parse()`, `validate()`, `execute()`
- Returns step data modifications

**Step 0.5** (`src/steps/0.5-handle-comment-command.step.ts`)
- Detects comment events
- Coordinates command execution
- Manages emoji reactions
- Posts error replies

### DRY Principles

The command system follows DRY (Don't Repeat Yourself) principles:

1. **Shared Logic in BaseCommand**: Common utilities like URL extraction and viewport parsing
2. **Single Registry**: One place to register all commands
3. **Consistent Interface**: All commands follow the same pattern
4. **Reusable Reactions**: Single functions for emoji reactions and error posting
5. **No Core Modifications**: Adding commands doesn't require modifying core workflow logic

## Future Commands

Examples of commands that can be easily added:

### `@yofix pageload`
Measure page load performance metrics (FCP, LCP, TTI, etc.)

```
@yofix pageload app.example.com/home
```

### `@yofix baseline`
Update baselines for specific routes

```
@yofix baseline /dashboard,/profile
```

### `@yofix compare`
Compare two different URLs

```
@yofix compare https://staging.example.com https://prod.example.com
```

### `@yofix help`
Display all available commands

```
@yofix help
```

## Troubleshooting

### Command Not Working

**Issue**: Comment doesn't trigger YoFix

**Solutions**:
1. Verify workflow has `issue_comment` event trigger
2. Check workflow `if` condition includes comment check
3. Ensure comment is on a pull request (not regular issue)
4. Verify `@yofix` is spelled correctly

### No Reaction Emoji

**Issue**: YoFix doesn't react with 👀

**Solutions**:
1. Check workflow has `issues: write` permission
2. Verify GitHub token has necessary scopes
3. Check logs for reaction errors

### Command Fails

**Issue**: Command execution fails with error

**Solutions**:
1. Check error message in PR comment
2. Review GitHub Actions logs
3. Verify required secrets are configured
4. Check command syntax matches usage

## Best Practices

1. **Always Quote URLs with Spaces**: Use quotes if URL contains query parameters
   ```
   @yofix test "https://example.com/page?foo=bar&baz=qux"
   ```

2. **Test Locally First**: Use the example workflow to test new commands

3. **Provide Clear Error Messages**: When adding commands, include helpful error messages

4. **Document New Commands**: Update this file when adding new commands

5. **Follow Naming Conventions**: Use lowercase, single-word command names

## Related Files

- [Command Registry](../src/core/github/commands/CommandRegistry.ts)
- [Base Command](../src/core/github/commands/BaseCommand.ts)
- [Test Command](../src/core/github/commands/TestCommand.ts)
- [Step 0.5 Handler](../src/steps/0.5-handle-comment-command.step.ts)
- [Example Workflow](../.github/workflows/yofix-comment-commands.example.yml)
