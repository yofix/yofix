"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandParser = void 0;
class CommandParser {
    constructor() {
        this.botPattern = /@yofix\s+(\w+)(?:\s+(.*))?/i;
        this.issuePattern = /#(\d+)/;
        this.routePattern = /\/[\w\-\/]+/;
        this.optionPattern = /--(\w+)(?:\s+(\w+))?/g;
    }
    parse(commentBody) {
        const match = commentBody.match(this.botPattern);
        if (!match) {
            return null;
        }
        const [, action, args = ''] = match;
        const parsedAction = this.parseAction(action);
        let processedArgs = args.trim();
        if (parsedAction === 'browser') {
            const quotedMatch = args.match(/["'](.+?)["']/);
            if (quotedMatch) {
                processedArgs = quotedMatch[1];
            }
        }
        const command = {
            action: parsedAction,
            args: processedArgs,
            options: this.parseOptions(args),
            raw: commentBody
        };
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
    parseAction(action) {
        const validActions = [
            'scan', 'fix', 'apply', 'explain', 'preview',
            'compare', 'baseline', 'report', 'ignore', 'test', 'browser', 'help'
        ];
        const normalizedAction = action.toLowerCase();
        if (validActions.includes(normalizedAction)) {
            return normalizedAction;
        }
        const actionMap = {
            'check': 'scan',
            'suggest': 'fix',
            'repair': 'fix',
            'update': 'baseline',
            'browse': 'browser',
            'automate': 'browser'
        };
        return actionMap[normalizedAction] || 'help';
    }
    parseOptions(args) {
        const options = {};
        let match;
        while ((match = this.optionPattern.exec(args)) !== null) {
            const [, key, value] = match;
            options[key] = value || true;
        }
        return options;
    }
    validateCommand(command) {
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
    parseMultiple(commentBody) {
        const commands = [];
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
exports.CommandParser = CommandParser;
