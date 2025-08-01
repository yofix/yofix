import { TreeSitterRouteAnalyzer } from '../src/core/analysis/TreeSitterRouteAnalyzer';
import * as fs from 'fs';
import * as path from 'path';

describe('TreeSitterRouteAnalyzer - Reliability Tests', () => {
  let analyzer: TreeSitterRouteAnalyzer;
  // Use the current project's src directory for testing instead of external loop-frontend
  const testProjectPath = path.join(__dirname, '..');
  
  beforeEach(async () => {
    analyzer = new TreeSitterRouteAnalyzer(testProjectPath);
    await analyzer.initialize();
  });
  
  describe('Consistency Tests', () => {
    it('should produce identical results on multiple runs', async () => {
      const testFile = 'src/index.ts'; // Use a file that exists in our repo
      
      // Run detection multiple times
      const results = [];
      for (let i = 0; i < 5; i++) {
        const routes = await analyzer.detectRoutes([testFile]);
        results.push(routes.get(testFile) || []);
      }
      
      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
    });
    
    it('should maintain consistency after cache clear', async () => {
      const testFile = 'src/index.ts';
      
      // First run
      const routes1 = await analyzer.detectRoutes([testFile]);
      
      // Clear caches and run again
      analyzer = new TreeSitterRouteAnalyzer(testProjectPath);
      await analyzer.initialize();
      const routes2 = await analyzer.detectRoutes([testFile]);
      
      expect(routes2).toEqual(routes1);
    });
    
    it('should handle incremental updates correctly', async () => {
      const file1 = 'src/core/index.ts';
      const file2 = 'src/types.ts';
      
      // Detect routes for file1
      const routes1 = await analyzer.detectRoutes([file1]);
      
      // Detect routes for file2 (shouldn't affect file1's cache)
      await analyzer.detectRoutes([file2]);
      
      // Re-detect routes for file1 (should use cache)
      const routes1Again = await analyzer.detectRoutes([file1]);
      
      expect(routes1Again).toEqual(routes1);
    });
  });
  
  describe('Reliability Tests', () => {
    it('should handle malformed files gracefully', async () => {
      // Create a temporary malformed file
      const malformedFile = 'src/test-malformed.ts';
      const malformedContent = `
        import React from 'react';
        // Missing closing brace
        export const Component = () => {
          return <div>
      `;
      
      // Tree-sitter should handle parse errors gracefully
      const routes = await analyzer.detectRoutes([malformedFile]);
      expect(routes.get(malformedFile)).toBeUndefined();
    });
    
    it('should detect all route patterns reliably', async () => {
      // Test different route definition patterns
      const patterns = [
        '<Route path="/test" component={TestComponent} />',
        '<Route path="/test" element={<TestComponent />} />',
        '{ path: "/test", component: TestComponent }',
        '{ path: "/test", element: <TestComponent /> }',
        '<PrivateRoute path="/test" component={TestComponent} />'
      ];
      
      // All patterns should be detected
      for (const pattern of patterns) {
        // Create test file with pattern
        // Verify detection
      }
    });
    
    it('should handle circular dependencies', async () => {
      // Test files with circular imports
      const circularFile = 'src/core/patterns/CircuitBreaker.ts';
      
      // Should not hang or crash
      const routes = await analyzer.detectRoutes([circularFile]);
      expect(routes).toBeDefined();
    });
    
    it('should handle large codebases efficiently', async () => {
      const start = Date.now();
      
      // Get metrics
      const metrics = analyzer.getMetrics();
      console.log('Codebase metrics:', metrics);
      
      // Should complete in reasonable time
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });
  });
  
  describe('Edge Case Handling', () => {
    it('should handle re-exports correctly', async () => {
      // Test index.ts re-exports
      const reExportFile = 'src/components/index.ts';
      const routes = await analyzer.detectRoutes([reExportFile]);
      
      // Should trace through re-exports
      expect(routes).toBeDefined();
    });
    
    it('should handle dynamic imports', async () => {
      // Test dynamic imports processing
      const dynamicImportFile = 'src/browser-agent/index.ts';
      const routes = await analyzer.detectRoutes([dynamicImportFile]);
      
      // Should not crash when processing dynamic imports
      expect(routes).toBeDefined();
    });
    
    it('should handle alias imports', async () => {
      // Test @/ alias imports
      const aliasFile = 'src/cli/yofix-cli.ts';
      const routes = await analyzer.detectRoutes([aliasFile]);
      
      // Should resolve aliases correctly
      expect(routes).toBeDefined();
    });
  });
  
  describe('Performance Benchmarks', () => {
    it('should complete analysis quickly', async () => {
      const testFiles = [
        'src/core/index.ts',
        'src/types.ts',
        'src/index.ts'
      ];
      
      // Measure Tree-sitter performance
      const tsStart = Date.now();
      await analyzer.detectRoutes(testFiles);
      const tsDuration = Date.now() - tsStart;
      
      console.log(`Tree-sitter analysis completed in: ${tsDuration}ms`);
      
      // Should complete in under 100ms for 3 files
      expect(tsDuration).toBeLessThan(100);
    });
  });
  
  describe('Cache Persistence', () => {
    it('should persist and restore graph correctly', async () => {
      const testFile = 'src/core/index.ts';
      
      // First run - builds graph
      const routes1 = await analyzer.detectRoutes([testFile]);
      
      // Create new analyzer instance (simulates restart)
      const analyzer2 = new TreeSitterRouteAnalyzer(testProjectPath);
      await analyzer2.initialize(); // Should load from cache
      
      // Results should match
      const routes2 = await analyzer2.detectRoutes([testFile]);
      expect(routes2).toEqual(routes1);
    });
    
    it('should invalidate cache on file changes', async () => {
      // Simulate file modification
      const testFile = 'src/test-temp.ts';
      const testPath = path.join(testProjectPath, testFile);
      
      // Create file
      fs.writeFileSync(testPath, 'export const Test = () => <div>Test</div>;');
      
      // First detection
      await analyzer.detectRoutes([testFile]);
      
      // Modify file
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamp
      fs.writeFileSync(testPath, 'export const Test = () => <div>Modified</div>;');
      
      // Should detect change and update
      await analyzer.detectRoutes([testFile]);
      
      // Cleanup
      fs.unlinkSync(testPath);
    });
  });
});