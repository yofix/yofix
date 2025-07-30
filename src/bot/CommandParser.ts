import { BotCommand, CommandAction, CommandOptions } from './types';

/**
 * Parses YoFix bot commands from PR comments
 */
export class CommandParser {
  private readonly botPattern = /@yofix\s+(\w+)(?:\s+(.*))?/i;
  private readonly issuePattern = /#(\d+)/;
  private readonly routePattern = /\/[\w\-\/]+/;
  private readonly optionPattern = /--(\w+)(?:\s+(\w+))?/g;

  /**
   * Parse a command from a comment body
   */
  parse(commentBody: string): BotCommand | null {
    const match = commentBody.match(this.botPattern);
    
    if (!match) {
      return null;
    }

    const [, action, args = ''] = match;
    const parsedAction = this.parseAction(action);
    
    // Special handling for browser command to preserve quoted strings
    let processedArgs = args.trim();
    if (parsedAction === 'browser') {
      // Extract quoted content as the command
      const quotedMatch = args.match(/["'](.+?)["']/);
      if (quotedMatch) {
        processedArgs = quotedMatch[1];
      }
    }
    
    const command: BotCommand = {
      action: parsedAction,
      args: processedArgs,
      options: this.parseOptions(args),
      raw: commentBody
    };

    // Parse specific targets
    if (command.action === 'fix' || command.action === 'explain' || command.action === 'apply') {
      const issueMatch = args.match(this.issuePattern);
      if (issueMatch) {
        command.targetIssue = parseInt(issueMatch[1], 10);
      }
    }

    if (command.action === 'scan') {
      const routeMatch = args.match(this.routePattern);
      if (routeMatch) {
        command.targetRoute = routeMatch[0];
      }
    }

    return command;
  }

  /**
   * Parse action from command
   */
  private parseAction(action: string): CommandAction {
    const validActions: CommandAction[] = [
      'scan', 'fix', 'apply', 'explain', 'preview',
      'compare', 'baseline', 'report', 'ignore', 'test', 'browser', 'impact', 'help'
    ];

    const normalizedAction = action.toLowerCase() as CommandAction;
    
    if (validActions.includes(normalizedAction)) {
      return normalizedAction;
    }

    // Handle variations
    const actionMap: Record<string, CommandAction> = {
      'check': 'scan',
      'suggest': 'fix',
      'repair': 'fix',
      'update': 'baseline',
      'browse': 'browser',
      'automate': 'browser'
    };
    
    return actionMap[normalizedAction] || 'help';
  }

  /**
   * Parse options from command arguments
   */
  private parseOptions(args: string): CommandOptions {
    const options: CommandOptions = {};
    let match;

    while ((match = this.optionPattern.exec(args)) !== null) {
      const [, key, value] = match;
      options[key] = value || true;
    }

    return options;
  }

  /**
   * Validate command syntax
   */
  validateCommand(command: BotCommand): { valid: boolean; error?: string } {
    // Validate action-specific requirements
    switch (command.action) {
      case 'fix':
      case 'apply':
      case 'explain':
        if (command.args && !command.targetIssue && !command.args.includes('all')) {
          return {
            valid: false,
            error: `Please specify an issue number (e.g., @yofix ${command.action} #3) or use 'all'`
          };
        }
        break;

      case 'baseline':
        if (!command.args.includes('update')) {
          return {
            valid: false,
            error: 'Use `@yofix baseline update` to update the baseline'
          };
        }
        break;

      case 'compare':
        if (!command.args) {
          return {
            valid: false,
            error: 'Please specify what to compare with (e.g., @yofix compare production)'
          };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Extract all commands from a comment (for batch operations)
   */
  parseMultiple(commentBody: string): BotCommand[] {
    const commands: BotCommand[] = [];
    const lines = commentBody.split('\n');

    for (const line of lines) {
      const command = this.parse(line);
      if (command) {
        commands.push(command);
      }
    }

    return commands;
  }
}