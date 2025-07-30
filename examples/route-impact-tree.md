# Route Impact Tree Example

The Route Impact Tree feature shows exactly which routes are affected by file changes in a PR, making it easy to understand the scope of changes.

## Usage

### Via Bot Command
```
@yofix impact
```

### Automatic Posting
The route impact tree is automatically posted when YoFix runs on a PR.

## Example Output

### Simple Changes
```
## 🌳 Route Impact Tree

📊 **3** files changed → **2** routes affected

Route Tree:
├── /
│   ├── index.tsx (route file)
│   └── global.css (styles)
└── /products
    └── ProductCard.tsx (component)
```

### Shared Components
```
## 🌳 Route Impact Tree

📊 **5** files changed → **4** routes affected

⚠️ **Shared Components** (changes affect multiple routes):
- `Button.tsx` → affects `/`, `/products`, `/checkout`
- `Header.tsx` → affects `/`, `/about`, `/products`, `/checkout`

Route Tree:
├── /
│   ├── Header.tsx (shared component)
│   └── Button.tsx (shared component)
├── /products
│   ├── products.tsx (route file)
│   ├── ProductCard.tsx (component)
│   ├── Header.tsx (shared component)
│   └── Button.tsx (shared component)
├── /checkout
│   ├── Header.tsx (shared component)
│   └── Button.tsx (shared component)
└── /about
    └── Header.tsx (shared component)
```

### No Changes
```
✅ No routes affected by changes in this PR
```

## How It Works

1. **File Change Detection**: Analyzes all files changed in the PR
2. **AST Parsing**: Uses Babel parser to understand import relationships
3. **Component Graph**: Builds a graph of component dependencies
4. **Route Mapping**: Maps components to the routes that use them
5. **Impact Analysis**: Determines which routes are affected by changes

## Benefits

- **Visual Clarity**: See exactly which routes need testing
- **Shared Component Awareness**: Highlights when a change affects multiple routes
- **Efficient Testing**: Focus testing on affected routes only
- **Code Review Aid**: Helps reviewers understand the scope of changes

## File Types Tracked

- **Route Files**: Direct route/page components
- **Components**: React/Vue/Angular components
- **Styles**: CSS, SCSS, CSS Modules that affect routes
- **Shared Components**: Components used by multiple routes

## Integration

The Route Impact Tree integrates with:
- GitHub PR comments
- Visual testing (only tests affected routes)
- Fix generation (context-aware fixes)
- Test generation (creates tests for affected routes)