#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript').typescript;
const TSX = require('tree-sitter-typescript').tsx;

function extractComponentFromValueNode(valueNode, content) {
  if (valueNode.type === 'jsx_self_closing_element') {
    const nameNode = valueNode.childForFieldName('name');
    if (nameNode) {
      return content.slice(nameNode.startIndex, nameNode.endIndex);
    }
  } else if (valueNode.type === 'jsx_element') {
    const opening = valueNode.childForFieldName('opening_element');
    if (opening) {
      const nameNode = opening.childForFieldName('name');
      if (nameNode) {
        return content.slice(nameNode.startIndex, nameNode.endIndex);
      }
    }
  } else if (valueNode.type === 'identifier') {
    return content.slice(valueNode.startIndex, valueNode.endIndex);
  }
  return null;
}

function parseRouteArray(arrayNode, content, parentPath, results) {
  const routeObjects = arrayNode.children.filter(child => child.type === 'object');

  for (const routeObj of routeObjects) {
    const pairs = routeObj.children.filter(child => child.type === 'pair');

    let routePath = null;
    let isIndex = false;
    let component = null;
    let childrenNode = null;

    // Extract route properties
    for (const pair of pairs) {
      const keyNode = pair.childForFieldName('key');
      const valueNode = pair.childForFieldName('value');

      if (keyNode && valueNode) {
        const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');

        if (keyName === 'path') {
          const value = content.slice(valueNode.startIndex, valueNode.endIndex);
          routePath = value.replace(/['"]/g, '');
        } else if (keyName === 'index') {
          const value = content.slice(valueNode.startIndex, valueNode.endIndex);
          isIndex = (value === 'true');
        } else if (keyName === 'element' || keyName === 'component') {
          component = extractComponentFromValueNode(valueNode, content);
        } else if (keyName === 'children' && valueNode.type === 'array') {
          childrenNode = valueNode;
        }
      }
    }

    // Build full path
    let fullPath;
    if (isIndex) {
      fullPath = parentPath || '/';
    } else if (routePath) {
      if (parentPath === '' || parentPath === '/') {
        fullPath = '/' + routePath.replace(/^\//, '');
      } else {
        fullPath = parentPath + '/' + routePath.replace(/^\//, '');
      }
    } else {
      if (!component) continue;
      fullPath = parentPath || '/';
    }

    // Add this route
    if (component) {
      results.push({
        fullPath,
        component,
        isIndex,
        line: routeObj.startPosition.row + 1
      });
    }

    // Recursively process children
    if (childrenNode) {
      const childParentPath = isIndex ? parentPath : fullPath;
      parseRouteArray(childrenNode, content, childParentPath, results);
    }
  }
}

function findNestedRoutes(tree, content) {
  const routes = [];
  const arrays = tree.rootNode.descendantsOfType('array');
  const processedArrays = new Set();

  for (const array of arrays) {
    // Skip if already processed
    if (processedArrays.has(array)) {
      continue;
    }

    // Check if this array is a children property of a route object
    let isChildrenArray = false;
    let current = array.parent;
    while (current && !isChildrenArray) {
      if (current.type === 'pair') {
        const keyNode = current.childForFieldName('key');
        if (keyNode) {
          const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
          if (keyName === 'children') {
            isChildrenArray = true;
            break;
          }
        }
      }
      current = current.parent;
    }

    // Only process top-level route arrays
    if (isChildrenArray) {
      continue;
    }

    const firstElement = array.children.find(child => child.type === 'object');
    if (firstElement) {
      const pairs = firstElement.children.filter(child => child.type === 'pair');
      const hasRouteProps = pairs.some(pair => {
        const keyNode = pair.childForFieldName('key');
        if (keyNode) {
          const keyName = content.slice(keyNode.startIndex, keyNode.endIndex).replace(/['"]/g, '');
          return ['path', 'element', 'component', 'index'].includes(keyName);
        }
        return false;
      });

      if (hasRouteProps) {
        parseRouteArray(array, content, '', routes);
        // Mark as processed
        processedArrays.add(array);
        const descendantArrays = array.descendantsOfType('array');
        descendantArrays.forEach(a => processedArrays.add(a));
      }
    }
  }

  return routes;
}

// Test both router files
const files = [
  '/Users/hari/2025/lp/loop-frontend/src/routes/PrivateRouter/guardPrivateRouter.tsx',
  '/Users/hari/2025/lp/loop-frontend/src/routes/PrivateRouter/basePrivateRouter.tsx'
];

const parser = new Parser();
parser.setLanguage(TSX);

for (const file of files) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`File: ${path.basename(file)}`);
  console.log('='.repeat(80));

  const content = fs.readFileSync(file, 'utf-8');
  const tree = parser.parse(content);
  const routes = findNestedRoutes(tree, content);

  console.log(`\nFound ${routes.length} routes:`);
  routes.forEach((route, i) => {
    console.log(`${i+1}. ${route.fullPath} → <${route.component} /> (line ${route.line})`);
  });

  // Filter for Configurations component
  const configurationsRoutes = routes.filter(r => r.component === 'Configurations');
  console.log(`\nRoutes using <Configurations />: ${configurationsRoutes.length}`);
  configurationsRoutes.forEach((route, i) => {
    console.log(`  ${i+1}. ${route.fullPath}`);
  });
}
