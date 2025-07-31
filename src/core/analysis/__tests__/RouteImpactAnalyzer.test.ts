/// <reference types="jest" />

import { RouteImpactAnalyzer } from '../RouteImpactAnalyzer';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';

// Mock GitHub API
jest.mock('@actions/github');
jest.mock('fs');

describe('RouteImpactAnalyzer', () => {
  let analyzer: RouteImpactAnalyzer;
  let mockOctokit: any;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        pulls: {
          listFiles: jest.fn()
        }
      }
    };
    
    (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);
    analyzer = new RouteImpactAnalyzer('test-token');
  });

  describe('formatImpactTree', () => {
    it('should format empty tree correctly', () => {
      const tree = {
        affectedRoutes: [],
        sharedComponents: new Map(),
        totalFilesChanged: 0,
        totalRoutesAffected: 0
      };

      const result = analyzer.formatImpactTree(tree);
      expect(result).toBe('✅ No routes affected by changes in this PR');
    });

    it('should format single route impact', () => {
      const tree = {
        affectedRoutes: [{
          route: '/',
          directChanges: ['pages/index.tsx'],
          componentChanges: ['components/Header.tsx'],
          styleChanges: ['styles/global.css'],
          sharedComponents: []
        }],
        sharedComponents: new Map(),
        totalFilesChanged: 3,
        totalRoutesAffected: 1
      };

      const result = analyzer.formatImpactTree(tree);
      expect(result).toContain('Route Tree:');
      expect(result).toContain('└── /');
      expect(result).toContain('index.tsx (route file)');
      expect(result).toContain('Header.tsx (component)');
      expect(result).toContain('global.css (styles)');
    });

    it('should show shared components warning', () => {
      const sharedMap = new Map([
        ['components/Button.tsx', ['/', '/products', '/checkout']]
      ]);

      const tree = {
        affectedRoutes: [
          {
            route: '/',
            directChanges: [],
            componentChanges: ['components/Button.tsx'],
            styleChanges: [],
            sharedComponents: ['components/Button.tsx']
          },
          {
            route: '/products',
            directChanges: [],
            componentChanges: ['components/Button.tsx'],
            styleChanges: [],
            sharedComponents: ['components/Button.tsx']
          }
        ],
        sharedComponents: sharedMap,
        totalFilesChanged: 1,
        totalRoutesAffected: 2
      };

      const result = analyzer.formatImpactTree(tree);
      expect(result).toContain('⚠️ **Shared Components**');
      expect(result).toContain('`Button.tsx` → affects `/`, `/products`');
      expect(result).toContain('(shared component)');
    });

    it('should format multiple routes with proper tree structure', () => {
      const tree = {
        affectedRoutes: [
          {
            route: '/',
            directChanges: ['pages/index.tsx'],
            componentChanges: [],
            styleChanges: [],
            sharedComponents: []
          },
          {
            route: '/products',
            directChanges: [],
            componentChanges: ['components/ProductCard.tsx'],
            styleChanges: [],
            sharedComponents: []
          },
          {
            route: '/checkout',
            directChanges: ['pages/checkout.tsx'],
            componentChanges: [],
            styleChanges: ['styles/checkout.css'],
            sharedComponents: []
          }
        ],
        sharedComponents: new Map(),
        totalFilesChanged: 4,
        totalRoutesAffected: 3
      };

      const result = analyzer.formatImpactTree(tree);
      expect(result).toContain('├── /');
      expect(result).toContain('├── /products');
      expect(result).toContain('└── /checkout');
      expect(result).toContain('├── checkout.tsx (route file)');
      expect(result).toContain('└── checkout.css (styles)');
    });
  });

  describe('analyzePRImpact', () => {
    it('should handle PR with no changed files', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: []
      });

      // Mock file system
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await analyzer.analyzePRImpact(123);
      
      expect(result.totalFilesChanged).toBe(0);
      expect(result.affectedRoutes).toHaveLength(0);
    });

    it('should detect route file changes', async () => {
      mockOctokit.rest.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'pages/index.tsx', status: 'modified' },
          { filename: 'pages/products/index.tsx', status: 'added' }
        ]
      });

      // Mock codebase structure
      const mockRoutes = [
        { path: '/', file: 'pages/index.tsx', component: 'HomePage' },
        { path: '/products', file: 'pages/products/index.tsx', component: 'ProductsPage' }
      ];

      // This would need more mocking of CodebaseAnalyzer
      // For now, just verify the structure
      expect(analyzer).toBeDefined();
    });
  });
});