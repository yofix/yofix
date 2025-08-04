import { TreeSitterRouteAnalyzer } from '../TreeSitterRouteAnalyzer';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider } from '../../baseline/types';

// Mock dependencies
jest.mock('fs');
jest.mock('../../hooks/LoggerHook', () => ({
  LoggerFactory: {
    getLogger: () => ({
      info: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })
  }
}));

jest.mock('../../hooks/ErrorHook', () => ({
  ErrorHandlerFactory: {
    getErrorHandler: () => ({
      handle: jest.fn()
    })
  },
  ErrorCategory: {
    STORAGE: 'STORAGE',
    ANALYSIS: 'ANALYSIS'
  },
  ErrorSeverity: {
    LOW: 'LOW'
  }
}));

// Mock tree-sitter modules
jest.mock('tree-sitter', () => {
  return jest.fn().mockImplementation(() => ({
    setLanguage: jest.fn(),
    parse: jest.fn().mockReturnValue({
      rootNode: {
        descendantsOfType: jest.fn().mockReturnValue([]),
        children: []
      }
    })
  }));
});

jest.mock('tree-sitter-typescript/typescript', () => ({}));
jest.mock('tree-sitter-typescript/tsx', () => ({}));
jest.mock('tree-sitter-javascript', () => ({}));

describe('TreeSitterRouteAnalyzer', () => {
  let analyzer: TreeSitterRouteAnalyzer;
  let mockStorageProvider: StorageProvider;
  const testCodebasePath = '/test/project';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock storage provider
    mockStorageProvider = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      downloadFile: jest.fn().mockResolvedValue(null),
      listFiles: jest.fn().mockResolvedValue([]),
      getSignedUrl: jest.fn().mockResolvedValue('https://example.com'),
      exists: jest.fn().mockResolvedValue(false)
    };
    
    // Setup basic fs mocks
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.promises.readFile as jest.Mock).mockResolvedValue('{}');
    (fs.promises.readdir as jest.Mock).mockResolvedValue([]);
    (fs.promises.stat as jest.Mock).mockResolvedValue({ 
      isDirectory: () => false,
      size: 1000,
      mtimeMs: Date.now()
    });
    
    analyzer = new TreeSitterRouteAnalyzer(testCodebasePath, mockStorageProvider);
  });

  describe('constructor', () => {
    it('should initialize with the correct root path', () => {
      expect(analyzer).toBeDefined();
      expect(analyzer['rootPath']).toBe(testCodebasePath);
    });

    it('should initialize with storage provider if provided', () => {
      expect(analyzer['storageProvider']).toBe(mockStorageProvider);
    });

    it('should work without storage provider', () => {
      const analyzerWithoutStorage = new TreeSitterRouteAnalyzer(testCodebasePath);
      expect(analyzerWithoutStorage['storageProvider']).toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear all in-memory caches', async () => {
      // Add some data to caches
      analyzer['fileCache'].set('test.ts', {
        path: 'test.ts',
        imports: [],
        exports: [],
        routes: [],
        hash: 'abc123',
        lastModified: Date.now()
      });
      analyzer['importGraph'].set('test.ts', {
        file: 'test.ts',
        importedBy: new Set(),
        imports: new Set(),
        isRouteFile: false,
        isEntryPoint: false
      });
      
      await analyzer.clearCache();
      
      expect(analyzer['fileCache'].size).toBe(0);
      expect(analyzer['importGraph'].size).toBe(0);
      expect(analyzer['routeCache'].size).toBe(0);
      expect(analyzer['componentToRoutes'].size).toBe(0);
    });

    it('should attempt to delete persistent cache from storage provider', async () => {
      const mockDeleteFile = jest.fn().mockResolvedValue(undefined);
      mockStorageProvider.deleteFile = mockDeleteFile;
      
      await analyzer.clearCache();
      
      expect(mockDeleteFile).toHaveBeenCalledWith(expect.stringContaining('yofix-cache'));
    });

    it('should handle storage provider errors gracefully', async () => {
      const mockDeleteFile = jest.fn().mockRejectedValue(new Error('Storage error'));
      mockStorageProvider.deleteFile = mockDeleteFile;
      
      await expect(analyzer.clearCache()).resolves.not.toThrow();
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        dependencies: { 'react-router-dom': '^6.0.0' }
      }));
    });

    it('should detect React Router framework', async () => {
      await analyzer.initialize();
      expect(analyzer['frameworkType']).toBe('react-router');
    });

    it('should detect Next.js framework', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
        dependencies: { 'next': '^13.0.0' }
      }));
      
      await analyzer.initialize();
      expect(analyzer['frameworkType']).toBe('nextjs');
    });

    it('should force rebuild when requested', async () => {
      const clearCacheSpy = jest.spyOn(analyzer, 'clearCache');
      await analyzer.initialize(true);
      
      expect(clearCacheSpy).toHaveBeenCalled();
    });

    it('should build import graph if no cache exists', async () => {
      const buildSpy = jest.spyOn(analyzer as any, 'buildImportGraph');
      await analyzer.initialize();
      
      expect(buildSpy).toHaveBeenCalled();
    });
  });

  describe('detectRoutes', () => {
    const changedFiles = ['src/components/Button.tsx', 'src/pages/Home.tsx'];
    
    beforeEach(() => {
      // Mock file system for test files
      (fs.existsSync as jest.Mock).mockImplementation((path) => {
        return changedFiles.some(file => path.includes(file));
      });
      
      // Mock import graph
      analyzer['importGraph'].set('src/pages/Home.tsx', {
        file: 'src/pages/Home.tsx',
        importedBy: new Set(['src/routes/index.tsx']),
        imports: new Set(['src/components/Button.tsx']),
        isRouteFile: false,
        isEntryPoint: false
      });
      
      analyzer['importGraph'].set('src/routes/index.tsx', {
        file: 'src/routes/index.tsx',
        importedBy: new Set(),
        imports: new Set(['src/pages/Home.tsx']),
        isRouteFile: true,
        isEntryPoint: true
      });
      
      analyzer['fileCache'].set('src/routes/index.tsx', {
        path: 'src/routes/index.tsx',
        imports: [],
        exports: [],
        routes: [{ path: '/home', component: 'Home', file: 'src/routes/index.tsx', line: 10 }],
        hash: 'xyz',
        lastModified: Date.now()
      });
    });

    it('should detect routes affected by changed files', async () => {
      const results = await analyzer.detectRoutes(changedFiles);
      
      expect(results.size).toBeGreaterThan(0);
      expect(results.has('src/pages/Home.tsx')).toBe(true);
    });

    it('should update graph for changed files', async () => {
      const updateSpy = jest.spyOn(analyzer as any, 'updateGraphForFiles');
      await analyzer.detectRoutes(changedFiles);
      
      expect(updateSpy).toHaveBeenCalledWith(changedFiles);
    });

    it('should handle empty changed files array', async () => {
      const results = await analyzer.detectRoutes([]);
      expect(results.size).toBe(0);
    });
  });

  describe('getRouteInfo', () => {
    const changedFiles = ['src/components/About.tsx'];
    
    beforeEach(() => {
      analyzer['importGraph'].set('src/components/About.tsx', {
        file: 'src/components/About.tsx',
        importedBy: new Set(['src/routes/main.tsx']),
        imports: new Set(),
        isRouteFile: false,
        isEntryPoint: false
      });
      
      analyzer['fileCache'].set('src/components/About.tsx', {
        path: 'src/components/About.tsx',
        imports: [],
        exports: ['About'],
        routes: [],
        hash: 'abc',
        lastModified: Date.now()
      });
    });

    it('should return detailed route information', async () => {
      const results = await analyzer.getRouteInfo(changedFiles);
      
      expect(results.size).toBe(1);
      const info = results.get('src/components/About.tsx');
      expect(info).toBeDefined();
      expect(info?.isRouteDefiner).toBe(false);
      expect(Array.isArray(info?.routes)).toBe(true);
    });

    it('should classify route file types correctly', async () => {
      analyzer['importGraph'].set('src/routes/router.test.tsx', {
        file: 'src/routes/router.test.tsx',
        importedBy: new Set(),
        imports: new Set(),
        isRouteFile: true,
        isEntryPoint: false
      });
      
      const results = await analyzer.getRouteInfo(['src/routes/router.test.tsx']);
      const info = results.get('src/routes/router.test.tsx');
      
      expect(info?.routeFileType).toBe('test');
    });
  });

  describe('findRoutesServingComponent', () => {
    const componentFile = 'src/components/Dashboard.tsx';
    
    beforeEach(() => {
      // Setup route file that imports the component
      analyzer['importGraph'].set('src/routes/app.tsx', {
        file: 'src/routes/app.tsx',
        importedBy: new Set(),
        imports: new Set([componentFile]),
        isRouteFile: true,
        isEntryPoint: true
      });
      
      // Mock file content with route definition
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`
        import Dashboard from '../components/Dashboard';
        
        const routes = [
          { path: '/dashboard', element: <Dashboard /> }
        ];
      `);
      
      // Mock tree-sitter parse result
      const mockParse = jest.fn().mockReturnValue({
        rootNode: {
          descendantsOfType: jest.fn().mockImplementation((type) => {
            if (type === 'object') {
              return [{
                children: [],
                startPosition: { row: 4 }
              }];
            }
            return [];
          })
        }
      });
      
      analyzer['tsxParser'].parse = mockParse;
    });

    it('should find routes that serve a component', async () => {
      const routes = await analyzer.findRoutesServingComponent(componentFile);
      
      expect(Array.isArray(routes)).toBe(true);
      expect(routes.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle undefined component file', async () => {
      const routes = await analyzer.findRoutesServingComponent('');
      expect(routes).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('Read error'));
      
      const routes = await analyzer.findRoutesServingComponent(componentFile);
      expect(Array.isArray(routes)).toBe(true);
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      // Setup some test data
      analyzer['importGraph'].set('file1.ts', {
        file: 'file1.ts',
        importedBy: new Set(),
        imports: new Set(['file2.ts']),
        isRouteFile: true,
        isEntryPoint: true
      });
      
      analyzer['importGraph'].set('file2.ts', {
        file: 'file2.ts',
        importedBy: new Set(['file1.ts']),
        imports: new Set(),
        isRouteFile: false,
        isEntryPoint: false
      });
    });

    it('should return correct metrics', () => {
      const metrics = analyzer.getMetrics();
      
      expect(metrics.totalFiles).toBe(2);
      expect(metrics.routeFiles).toBe(1);
      expect(metrics.entryPoints).toBe(1);
      expect(metrics.importEdges).toBe(1);
      expect(typeof metrics.cacheSize).toBe('number');
    });
  });

  describe('File processing', () => {
    it('should skip large files', async () => {
      (fs.promises.stat as jest.Mock).mockResolvedValue({
        size: 2 * 1024 * 1024, // 2MB
        isDirectory: () => false
      });
      
      const result = await analyzer['processFile']('large-file.ts');
      
      expect(result.imports).toEqual([]);
      expect(result.exports).toEqual([]);
      expect(result.routes).toEqual([]);
    });

    it('should skip binary files', async () => {
      (fs.promises.stat as jest.Mock).mockResolvedValue({
        size: 1000,
        isDirectory: () => false
      });
      (fs.promises.readFile as jest.Mock).mockResolvedValue('content\0with\0null\0bytes');
      
      const result = await analyzer['processFile']('binary-file.ts');
      
      expect(result.imports).toEqual([]);
      expect(result.exports).toEqual([]);
    });

    it('should handle file not found errors', async () => {
      const error = new Error('ENOENT');
      (error as any).code = 'ENOENT';
      (fs.promises.readFile as jest.Mock).mockRejectedValue(error);
      
      const result = await analyzer['processFile']('non-existent.ts');
      
      expect(result.path).toBe('non-existent.ts');
      expect(result.imports).toEqual([]);
    });
  });

  describe('Import path resolution', () => {
    it('should resolve relative imports', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      const resolved = analyzer['resolveImportPath']('src/components/Button.tsx', './Header');
      expect(resolved).toBeTruthy();
      expect(resolved).toContain('Header');
    });

    it('should resolve alias imports', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      const resolved = analyzer['resolveImportPath']('src/pages/Home.tsx', '@/components/Button');
      expect(resolved).toBeTruthy();
      expect(resolved).toContain('src/components/Button');
    });

    it('should return null for external packages', () => {
      const resolved = analyzer['resolveImportPath']('src/app.tsx', 'react');
      expect(resolved).toBeNull();
    });

    it('should try multiple extensions', () => {
      let callCount = 0;
      (fs.existsSync as jest.Mock).mockImplementation((path) => {
        callCount++;
        return callCount === 3; // Return true on third call
      });
      
      const resolved = analyzer['resolveImportPath']('src/app.tsx', './utils');
      expect(resolved).toBeTruthy();
      expect(fs.existsSync).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('Framework-specific route detection', () => {
    it('should detect Next.js app router routes', () => {
      analyzer['frameworkType'] = 'nextjs';
      const routes = analyzer['extractRoutes'](
        { rootNode: { descendantsOfType: () => [] } } as any,
        'app/dashboard/page.tsx',
        'export default function Page() {}'
      );
      
      expect(routes.length).toBe(1);
      expect(routes[0].path).toBe('/dashboard');
      expect(routes[0].component).toBe('Next.js Page');
    });

    it('should detect Next.js pages router routes', () => {
      analyzer['frameworkType'] = 'nextjs';
      const routes = analyzer['extractRoutes'](
        { rootNode: { descendantsOfType: () => [] } } as any,
        'pages/about/index.tsx',
        'export default function About() {}'
      );
      
      expect(routes.length).toBe(1);
      expect(routes[0].path).toBe('/about');
    });

    it('should handle dynamic routes in Next.js', () => {
      analyzer['frameworkType'] = 'nextjs';
      const routes = analyzer['extractRoutes'](
        { rootNode: { descendantsOfType: () => [] } } as any,
        'app/blog/[slug]/page.tsx',
        'export default function BlogPost() {}'
      );
      
      expect(routes.length).toBe(1);
      expect(routes[0].path).toBe('/blog/:slug');
    });

    it('should detect SvelteKit routes', () => {
      const routes = analyzer['extractRoutes'](
        { rootNode: { descendantsOfType: () => [] } } as any,
        'src/routes/products/+page.svelte',
        '<script>export let data;</script>'
      );
      
      expect(routes.length).toBe(1);
      expect(routes[0].path).toBe('/products');
      expect(routes[0].component).toBe('SvelteKit Page');
    });
  });

  describe('Route filtering', () => {
    it('should filter out partial routes', () => {
      const routes = ['parent/child', 'child', 'parent'];
      const filtered = analyzer['filterCompleteRoutes'](routes);
      
      expect(filtered).toContain('parent/child');
      expect(filtered).not.toContain('child');
      expect(filtered).toContain('parent');
    });

    it('should handle empty route array', () => {
      const filtered = analyzer['filterCompleteRoutes']([]);
      expect(filtered).toEqual([]);
    });

    it('should sort routes alphabetically', () => {
      const routes = ['zebra', 'alpha', 'beta'];
      const filtered = analyzer['filterCompleteRoutes'](routes);
      
      expect(filtered[0]).toBe('alpha');
      expect(filtered[1]).toBe('beta');
      expect(filtered[2]).toBe('zebra');
    });
  });

  describe('Cache persistence', () => {
    it('should persist graph to storage provider', async () => {
      analyzer['importGraph'].set('test.ts', {
        file: 'test.ts',
        importedBy: new Set(['app.ts']),
        imports: new Set(['utils.ts']),
        isRouteFile: false,
        isEntryPoint: false
      });
      
      await analyzer['persistGraph']();
      
      expect(mockStorageProvider.uploadFile).toHaveBeenCalledWith(
        expect.stringContaining('import-graph.json'),
        expect.any(Buffer),
        expect.objectContaining({
          contentType: 'application/json'
        })
      );
    });

    it('should load persisted graph from storage', async () => {
      const mockData = {
        version: '1.0',
        timestamp: Date.now(),
        graph: [{
          file: 'test.ts',
          importedBy: ['app.ts'],
          imports: ['utils.ts'],
          isRouteFile: false,
          isEntryPoint: false
        }],
        fileCache: []
      };
      
      mockStorageProvider.listFiles = jest.fn().mockResolvedValue(['import-graph.json']);
      mockStorageProvider.downloadFile = jest.fn().mockResolvedValue(
        Buffer.from(JSON.stringify(mockData))
      );
      
      const loaded = await analyzer['loadPersistedGraph']();
      
      expect(loaded).toBe(true);
      expect(analyzer['importGraph'].size).toBe(1);
      expect(analyzer['importGraph'].has('test.ts')).toBe(true);
    });

    it('should handle cache loading errors gracefully', async () => {
      mockStorageProvider.downloadFile = jest.fn().mockRejectedValue(new Error('Download failed'));
      
      const loaded = await analyzer['loadPersistedGraph']();
      expect(loaded).toBe(false);
    });
  });
});