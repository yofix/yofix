import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as path from 'path';

async function main() {
  const codebasePath = path.resolve('../loop-frontend');
  const analyzer = new TreeSitterRouteAnalyzer(codebasePath);
  await analyzer.initialize(false);

  const file = 'src/pages/members/Configurations/ConfigurationCenter.tsx';
  const result = await analyzer.detectRoutes([file]);

  const routes = result.get(file) || [];
  console.log('\n=== ConfigurationCenter.tsx Routes ===');
  console.log('Total detected:', routes.length);
  console.log('');
  routes.forEach((route, i) => {
    console.log(`${i+1}. ${route}`);
  });
  console.log('');
}

main().catch(console.error);
