import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared utility for resolving import paths
 * DRY: Used by RouteDetector, ComponentTreeAnalyzer, etc.
 */
export class ImportResolver {
  private static extensions = ['.tsx', '.ts', '.jsx', '.js'];

  /**
   * Resolve import path to absolute file path
   * @param importSource - The import source string (e.g., './Component', '../utils')
   * @param fromDir - Directory containing the file with the import
   * @returns Absolute path to the imported file, or null if not found
   */
  static resolveImport(importSource: string, fromDir: string): string | null {
    const basePath = path.resolve(fromDir, importSource);

    // Try direct file with extensions
    for (const ext of this.extensions) {
      const fullPath = basePath + ext;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // Try index file in directory
    for (const ext of this.extensions) {
      const indexPath = path.join(basePath, `index${ext}`);
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }
}
