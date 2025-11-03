import * as core from '@actions/core';
import { BotContext } from '../types';
import { BaselineManager } from '../../core/baseline/BaselineManager';
import { StorageFactory } from '../../providers/storage/StorageFactory';

/**
 * Handle baseline-related bot commands
 */
export async function handleBaselineCommand(command: string, args: string[], context: BotContext): Promise<string> {
  const subcommand = args[0]?.toLowerCase();
  
  switch (subcommand) {
    case 'create':
      return createBaselines(args.slice(1), context);
    case 'update':
      return updateBaselines(args.slice(1), context);
    case 'status':
      return getBaselineStatus(context);
    default:
      return `Unknown baseline command: ${subcommand || 'none'}. Available commands: create, update, status`;
  }
}

/**
 * Create baselines from production or main branch
 */
async function createBaselines(args: string[], context: BotContext): Promise<string> {
  try {
    // Parse arguments
    const source = args[0] || 'main'; // 'main' or 'production'
    const routes = args.slice(1).filter(arg => arg.startsWith('/')); // Extract route paths
    
    // Create storage provider
    const storageProvider = await StorageFactory.createFromInputs();
    
    // Create baseline manager
    const baselineManager = new BaselineManager({
      storageProvider,
      productionUrl: process.env.PRODUCTION_URL
    });
    
    // Default viewports
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 }
    ];
    
    let result: string;
    
    // Use default routes if none specified
    const routesToCreate = routes.length > 0 ? routes : ['/'];

    if (source === 'main') {
      // Try to create from main branch
      const success = await baselineManager.createBaselinesFromMainBranch(routesToCreate);
      if (success) {
        result = `✅ Successfully created baselines for ${routesToCreate.length} route(s) from main branch`;
      } else {
        result = '❌ Failed to create baselines from main branch. No deployments found.';
      }
    } else if (source === 'production' && process.env.PRODUCTION_URL) {
      // Create from production
      await baselineManager.createBaselines(routesToCreate, viewports);
      result = `✅ Created baselines for ${routesToCreate.length} route(s) from production`;
    } else {
      result = '❌ No production URL configured. Set PRODUCTION_URL environment variable.';
    }
    
    return result;
  } catch (error) {
    core.error(`Baseline creation failed: ${error}`);
    return `❌ Failed to create baselines: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Update specific baselines
 */
async function updateBaselines(args: string[], context: BotContext): Promise<string> {
  try {
    const routes = args.filter(arg => arg.startsWith('/'));
    
    if (routes.length === 0) {
      return '❌ Please specify routes to update. Example: @yofix baseline update /home /about';
    }
    
    // Create storage provider
    const storageProvider = await StorageFactory.createFromInputs();
    
    // Create baseline manager
    const baselineManager = new BaselineManager({
      storageProvider
    });
    
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 }
    ];
    
    // Create missing baselines
    const results = await baselineManager.createMissingBaselines(routes, viewports);
    
    return `✅ Updated ${results.length} baselines`;
  } catch (error) {
    return `❌ Failed to update baselines: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get baseline status
 */
async function getBaselineStatus(context: BotContext): Promise<string> {
  try {
    // Create storage provider
    const storageProvider = await StorageFactory.createFromInputs();
    
    // List baseline files
    const files = await storageProvider.listFiles('baselines/');
    
    if (!files || files.length === 0) {
      return '📊 **Baseline Status**: No baselines found. Run `@yofix baseline create` to create initial baselines.';
    }
    
    // Count baselines by route
    const routeCount = new Map<string, number>();
    
    for (const file of files) {
      const match = file.match(/baselines\/(.+?)_\d+x\d+\.png$/);
      if (match) {
        const route = match[1].replace(/_/g, '/').replace(/^\//, '/');
        routeCount.set(route, (routeCount.get(route) || 0) + 1);
      }
    }
    
    let status = `📊 **Baseline Status**\n\n`;
    status += `Total baselines: ${files.length}\n`;
    status += `Routes covered: ${routeCount.size}\n\n`;
    status += `**Routes:**\n`;
    
    for (const [route, count] of routeCount) {
      status += `- ${route}: ${count} viewports\n`;
    }
    
    return status;
  } catch (error) {
    return `❌ Failed to get baseline status: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Register baseline commands
 */
export function registerBaselineCommands(): Record<string, string> {
  return {
    'baseline create [main|production] [routes...]': 'Create baselines from main branch or production',
    'baseline update [routes...]': 'Update baselines for specific routes',
    'baseline status': 'Show baseline coverage status'
  };
}