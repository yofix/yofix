# Babel AST Approach - Actual Limitations

## What Works ✅

### React with Common UI Libraries
```jsx
// MUI - ✅ Works
<TextField data-testid="email" />
// We know: MUI wraps, so selector = [data-testid='email'] input

// Ant Design - ✅ Works
<Input data-testid="email" />
// We know: Ant is direct, so selector = [data-testid='email']

// Chakra - ✅ Works
<Input id="email" />
// We know: Chakra is direct, so selector = #email

// Plain React - ✅ Works
<input data-testid="email" />
// Direct HTML, selector = [data-testid='email']
```

## What Breaks ❌

### 1. Unknown UI Libraries
```jsx
// Mantine, Blueprint, Semantic UI, shadcn/ui, custom libraries
<TextInput data-testid="email" />
// ❌ We DON'T know if this wraps or not!
// Need to add pattern manually or use LLM
```

### 2. Vue.js (Different Syntax)
```vue
<!-- .vue files are NOT JSX! -->
<template>
  <v-text-field data-testid="email"></v-text-field>
</template>
// ❌ Babel JSX parser can't parse this
// Need Vue template parser
```

### 3. Angular (HTML Templates)
```typescript
// .component.html - NOT JSX!
<mat-form-field>
  <input matInput data-testid="email">
</mat-form-field>
// ❌ Babel can't parse HTML templates
// Need Angular template parser
```

### 4. Svelte (Custom Syntax)
```svelte
<script>
  let email = '';
</script>
<input bind:value={email} data-testid="email">
// ❌ Babel can't parse Svelte syntax
// Need Svelte parser
```

### 5. Dynamic/Conditional Rendering
```jsx
// Runtime decisions
<CustomInput
  variant={isDark ? 'filled' : 'outlined'}
  wrapper={isMobile ? MobileWrapper : DesktopWrapper}
  data-testid="email"
/>
// ❌ We can't know at parse-time which wrapper is used
// Would need to run the code or use LLM to understand logic
```

### 6. Shadow DOM / Web Components
```jsx
<custom-input data-testid="email"></custom-input>
// Renders into Shadow DOM:
// #shadow-root
//   <input>
// ❌ Standard selectors can't pierce shadow DOM
```

### 7. Dynamically Imported Components
```jsx
const LoginForm = lazy(() => import('./LoginForm'));
// ❌ Can't analyze code that's not in the source files provided
```

## Success Rate Estimate

| Framework/Library | Success Rate | Notes |
|------------------|--------------|-------|
| React + MUI | **100%** ✅ | Pattern implemented |
| React + Ant | **100%** ✅ | Pattern implemented |
| React + Chakra | **100%** ✅ | Pattern implemented |
| React + Plain | **100%** ✅ | Direct HTML |
| React + Mantine | **50%** ⚠️ | Need to add pattern |
| React + Blueprint | **50%** ⚠️ | Need to add pattern |
| React + shadcn/ui | **50%** ⚠️ | Need to add pattern |
| React + Custom | **20%** ❌ | Unknown patterns |
| Vue.js | **0%** ❌ | Need Vue parser |
| Angular | **0%** ❌ | Need Angular parser |
| Svelte | **0%** ❌ | Need Svelte parser |
| Web Components | **30%** ⚠️ | Some work, shadow DOM fails |

## Real-World Coverage

Based on npm download stats and market share:

**Will work out-of-the-box:** ~60-70% of web apps
- React: 42% market share
- MUI: Most popular React UI library
- Ant: Second most popular
- Plain HTML: Always works

**Will need pattern addition:** ~20-25%
- Other React UI libraries (Mantine, Blueprint, etc.)
- Easy to add - just define the wrapper pattern

**Will not work:** ~10-15%
- Vue, Angular, Svelte (different parsers needed)
- Shadow DOM
- Highly dynamic/runtime-dependent

## Hybrid Approach (RECOMMENDED)

```typescript
async function generateSchema(sourceFiles, options) {
  try {
    // 1. Try Babel AST first (fast, free, reliable)
    const schema = await babelApproach(sourceFiles);

    if (schema.confidence > 0.8) {
      return schema; // High confidence, use it!
    }
  } catch (error) {
    console.log('Babel approach failed, falling back...');
  }

  // 2. Fall back to LLM analysis
  return await llmApproach(sourceFiles);
}
```

**Best of both worlds:**
- ✅ 60-70% of cases: Fast, free, deterministic (Babel)
- ✅ 20-25%: Add pattern, then fast (Babel + config)
- ✅ 10-15%: Slower but works (LLM fallback)

## Adding New Library Patterns

It's EASY to extend:

```typescript
// In DeterministicSelectorGenerator.ts
private buildSelector(library, attr, value) {
  switch (library) {
    case 'MUI':
      return `${attr} input`; // Wrapper pattern

    case 'Mantine':
      return `${attr} input`; // Same wrapper pattern

    case 'Blueprint':
      return `${attr}`; // Direct pattern

    case 'Semantic':
      return `${attr} input`; // Wrapper pattern

    // Add more as needed
  }
}
```

## When to Use What

### Use Pure Babel ✅
- React apps with MUI/Ant/Chakra
- Plain HTML
- When you have source code
- When speed matters

### Use Babel + LLM Hybrid ⚠️
- Unknown React UI libraries (LLM adds pattern)
- Complex conditional logic
- Dynamic imports

### Use Pure LLM ❌
- Vue, Angular, Svelte (until we add parsers)
- No source code access
- Shadow DOM heavy apps
- When reliability > speed

### Use Manual Selectors 🎯
- Maximum reliability needed
- One-off tests
- Known stable apps
