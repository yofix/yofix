#!/bin/bash

# Fix imports script for YoFix restructuring

echo "Fixing imports after directory restructuring..."

# 1. Fix MCPCommandHandler imports
sed -i '' 's|from '\''../analysis/VisualAnalyzer'\''|from '\''../../core/analysis/VisualAnalyzer'\''|g' src/automation/mcp/MCPCommandHandler.ts
sed -i '' 's|from '\''../bot/types'\''|from '\''../../bot/types'\''|g' src/automation/mcp/MCPCommandHandler.ts

# 2. Fix MCPManager imports
sed -i '' 's|from '\''./BrowserSecuritySandbox'\''|from '\''../security/BrowserSecuritySandbox'\''|g' src/automation/mcp/MCPManager.ts

# 3. Fix BrowserSecuritySandbox imports
sed -i '' 's|from '\''./MCPManager'\''|from '\''../mcp/MCPManager'\''|g' src/automation/security/BrowserSecuritySandbox.ts

# 4. Fix cli imports
sed -i '' 's|from '\''../analysis/VisualAnalyzer'\''|from '\''../core/analysis/VisualAnalyzer'\''|g' src/cli/yofix-cli.ts
sed -i '' 's|from '\''../baseline/BaselineManager'\''|from '\''../core/baseline/BaselineManager'\''|g' src/cli/yofix-cli.ts
sed -i '' 's|from '\''../firebase-storage'\''|from '\''../providers/storage/FirebaseStorageManager'\''|g' src/cli/yofix-cli.ts

# 5. Fix VisualAnalyzer imports
sed -i '' 's|from '\''../auth-handler'\''|from '\''../../github/AuthHandler'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../firebase-storage'\''|from '\''../../providers/storage/FirebaseStorageManager'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../firebase-url-handler'\''|from '\''../../providers/firebase/FirebaseUrlHandler'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../pr-reporter'\''|from '\''../../github/PRReporter'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../visual-runner'\''|from '\''../testing/VisualRunner'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../test-generator'\''|from '\''../testing/TestGenerator'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../types'\''|from '\''../../types'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../claude-route-analyzer'\''|from '\''./RouteAnalyzer'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../context/types'\''|from '\''../../context/types'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../cache/CacheManager'\''|from '\''../../optimization/CacheManager'\''|g' src/core/analysis/VisualAnalyzer.ts
sed -i '' 's|from '\''../optimization/ImageOptimizer'\''|from '\''../../optimization/ImageOptimizer'\''|g' src/core/analysis/VisualAnalyzer.ts

# 6. Fix TestGenerator imports
sed -i '' 's|from '\''./types'\''|from '\''../../types'\''|g' src/core/testing/TestGenerator.ts

# 7. Fix VisualRunner imports
sed -i '' 's|from '\''./types'\''|from '\''../../types'\''|g' src/core/testing/VisualRunner.ts
sed -i '' 's|from '\''./auth-handler'\''|from '\''../../github/AuthHandler'\''|g' src/core/testing/VisualRunner.ts

# 8. Fix bot types imports
sed -i '' 's|from '\''../bot/types'\''|from '\''../../bot/types'\''|g' src/core/fixes/*.ts
sed -i '' 's|from '\''../context/types'\''|from '\''../../context/types'\''|g' src/core/fixes/*.ts
sed -i '' 's|from '\''../cache/CacheManager'\''|from '\''../../optimization/CacheManager'\''|g' src/core/fixes/SmartFixGenerator.ts

# 9. Fix testing imports
sed -i '' 's|from '\''../bot/types'\''|from '\''../../bot/types'\''|g' src/core/testing/VisualIssueTestGenerator.ts
sed -i '' 's|from '\''../types'\''|from '\''../../types'\''|g' src/core/testing/VisualIssueTestGenerator.ts

# 10. Fix Firebase imports
sed -i '' 's|from '\''./firebase-config-detector'\''|from '\''./FirebaseConfigDetector'\''|g' src/providers/firebase/FirebaseUrlHandler.ts

# 11. Fix S3Storage imports
sed -i '' 's|from '\''../baseline/types'\''|from '\''../../core/baseline/types'\''|g' src/providers/storage/S3Storage.ts

# 12. Fix PRReporter imports
sed -i '' 's|from '\''./types'\''|from '\''../types'\''|g' src/github/PRReporter.ts

echo "Import fixes completed!"