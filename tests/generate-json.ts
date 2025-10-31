/**
 * Simple script to generate route JSON using TreeSitterRouteAnalyzer
 *
 * Usage: ts-node tests/generate-json.ts <codebase-path>
 * Example: ts-node tests/generate-json.ts ../loop-frontend
 */

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function main() {
  const codebasePath = "../loop-frontend";

  if (!codebasePath) {
    console.error('Usage: ts-node tests/generate-json.ts <codebase-path>');
    process.exit(1);
  }

  const absolutePath = path.resolve(codebasePath);
  console.log(`Analyzing: ${absolutePath}`);

  const analyzer = new TreeSitterRouteAnalyzer(absolutePath);
  await analyzer.initialize(true);

  const outputPath = path.join(absolutePath, '.yofix-cache', 'import-graph.json');
  console.log(`JSON generated: ${outputPath}`);

  const metrics = analyzer.getMetrics();
  console.log(`Files: ${metrics.totalFiles}, Routes: ${metrics.routeFiles}`);
}

main().catch(console.error);
