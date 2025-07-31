#!/usr/bin/env ts-node

/**
 * Precise Route Impact Analysis
 * 
 * This script provides accurate component-to-route mapping,
 * showing only the specific routes that use each component.
 * 
 * Usage: ts-node precise-route-impact.ts <codebase-path> <file1> [file2] [...]
 */

import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import { ComponentRouteMapper } from '../src/core/analysis/ComponentRouteMapper';
import * as path from 'path';
import * as fs from 'fs';
import Parser from 'tree-sitter';
import TSX from 'tree-sitter-typescript/tsx';

// Disable debug logging
process.env.ACTIONS_STEP_DEBUG = 'false';

interface ComponentRouteImpact {
  component: string;
  directRoutes: string[];
  routeFile: string;
}

async function analyzePreciseRouteImpact(codebasePath: string, files: string[]) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║              Precise Route Impact Analysis                 ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  console.log(`📁 Codebase: ${codebasePath}`);
  console.log(`📄 Analyzing ${files.length} file(s)\n`);
  
  const absolutePath = path.resolve(codebasePath);
  
  // Initialize analyzers
  const analyzer = new TreeSitterRouteAnalyzer(absolutePath);
  const componentMapper = new ComponentRouteMapper(absolutePath);
  
  await analyzer.initialize();
  
  // Analyze each file
  const fileImpacts: Map<string, ComponentRouteImpact[]> = new Map();
  
  for (const file of files) {
    console.log(`\n🔍 Analyzing: ${file}`);
    const impacts = await analyzeFileImpact(file, analyzer, componentMapper, absolutePath);
    fileImpacts.set(file, impacts);
  }
  
  // Print results
  printPreciseImpactGraph(fileImpacts);
}

async function analyzeFileImpact(
  filePath: string, 
  analyzer: TreeSitterRouteAnalyzer,
  componentMapper: ComponentRouteMapper,
  rootPath: string
): Promise<ComponentRouteImpact[]> {
  const impacts: ComponentRouteImpact[] = [];
  
  // Get the component name from file
  const componentName = path.basename(filePath, path.extname(filePath));
  
  // Find which route files import this component
  const graph = (analyzer as any).importGraph;
  const fileNode = graph.get(filePath);
  
  if (!fileNode) {
    console.log(`  ⚠️  File not found in import graph`);
    return impacts;
  }
  
  console.log(`  📦 Imported by ${fileNode.importedBy.size} files`);
  
  // Check each importer to see if it's a route file
  for (const importerPath of fileNode.importedBy) {
    const importerNode = graph.get(importerPath);
    
    if (importerNode?.isRouteFile) {
      console.log(`  🚦 Route file: ${importerPath}`);
      
      // Analyze this route file to find specific routes using our component
      const mappings = await componentMapper.analyzeRouteFile(importerPath);
      
      // Find the local name of our component in this file
      const localName = await findComponentLocalName(importerPath, filePath, rootPath);
      
      if (localName) {
        console.log(`    📌 Component imported as: ${localName}`);
        
        // Debug: show all route mappings
        console.log(`    📊 Route mappings found: ${mappings.length}`);
        mappings.slice(0, 5).forEach(m => {
          console.log(`      - ${m.routePath} → ${m.componentName}`);
        });
        
        // Find routes that use this component
        const componentRoutes = mappings
          .filter(m => m.componentName === localName)
          .map(m => m.routePath);
        
        if (componentRoutes.length > 0) {
          impacts.push({
            component: componentName,
            directRoutes: componentRoutes,
            routeFile: importerPath
          });
          
          console.log(`    ✅ Used in ${componentRoutes.length} route(s): ${componentRoutes.join(', ')}`);
        } else {
          console.log(`    ❌ Not used in any routes (imported but unused)`);
        }
      } else {
        console.log(`    ⚠️  Could not find local name for component`);
      }
    }
  }
  
  return impacts;
}

async function findComponentLocalName(
  routeFile: string, 
  componentFile: string, 
  rootPath: string
): Promise<string | null> {
  try {
    const fullPath = path.join(rootPath, routeFile);
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    
    console.log(`    🔍 Searching for component import in ${routeFile}`);
    console.log(`       Component file: ${componentFile}`);
    
    // Parse the file
    const parser = new Parser();
    parser.setLanguage(TSX);
    const tree = parser.parse(content);
    
    // Look for lazy imports
    const variableDeclarations = tree.rootNode.descendantsOfType('variable_declarator');
    
    for (const decl of variableDeclarations) {
      const id = decl.childForFieldName('name');
      const init = decl.childForFieldName('init');
      
      if (id && init && init.type === 'call_expression') {
        const funcNode = init.childForFieldName('function');
        
        if (funcNode && content.slice(funcNode.startIndex, funcNode.endIndex) === 'lazy') {
          // Check if this lazy import matches our component
          const importCalls = init.descendantsOfType('call_expression');
          
          for (const importCall of importCalls) {
            const importFunc = importCall.childForFieldName('function');
            if (importFunc && content.slice(importFunc.startIndex, importFunc.endIndex) === 'import') {
              const args = importCall.childForFieldName('arguments');
              if (args) {
                const strings = args.descendantsOfType('string');
                if (strings.length > 0) {
                  const importPath = content.slice(strings[0].startIndex + 1, strings[0].endIndex - 1);
                  
                  // Check if this import matches our component file
                  if (importPath === componentFile || 
                      componentFile.endsWith(importPath + '.tsx') ||
                      componentFile.endsWith(importPath + '.ts') ||
                      importPath.endsWith(path.basename(componentFile, path.extname(componentFile)))) {
                    // Found it! Return the local name
                    return content.slice(id.startIndex, id.endIndex);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // TODO: Also check regular imports
    
  } catch (error) {
    console.error(`Error parsing ${routeFile}:`, error);
  }
  
  return null;
}

function printPreciseImpactGraph(fileImpacts: Map<string, ComponentRouteImpact[]>) {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                 Precise Route Impact Graph                 ║
╚═══════════════════════════════════════════════════════════╝
`);
  
  let totalRoutesAffected = 0;
  const allAffectedRoutes = new Set<string>();
  
  for (const [file, impacts] of fileImpacts) {
    console.log(`\n📄 ${file}:`);
    
    if (impacts.length === 0) {
      console.log(`  ❌ No route impact (not used in any route definitions)`);
    } else {
      for (const impact of impacts) {
        console.log(`\n  📍 Via ${impact.routeFile}:`);
        for (const route of impact.directRoutes) {
          console.log(`    └─ ${route}`);
          allAffectedRoutes.add(route);
        }
        totalRoutesAffected += impact.directRoutes.length;
      }
    }
  }
  
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                        Summary                             ║
╚═══════════════════════════════════════════════════════════╝

   📊 Files analyzed: ${fileImpacts.size}
   🔗 Unique routes affected: ${allAffectedRoutes.size}
   📍 Total route references: ${totalRoutesAffected}
`);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: ts-node precise-route-impact.ts <codebase-path> <file1> [file2] [...]

Example:
  ts-node precise-route-impact.ts ../loop-frontend src/pages/members/Testing/Test.tsx

This will show the precise routes affected by each component.
`);
    process.exit(1);
  }
  
  const codebasePath = args[0];
  const files = args.slice(1);
  
  analyzePreciseRouteImpact(codebasePath, files).catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}