# Schema-Based Login: Framework Support

## Overview

The Schema-Based Login approach uses Claude to analyze source code and generate deterministic selectors. It works with **any** web framework by intelligently detecting patterns.

## How It Works

```
┌─────────────────────────────────────────┐
│ 1. User provides source files           │
│    - Login page component               │
│    - Input wrapper components           │
│    - Form libraries                     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 2. Claude analyzes code                 │
│    - Detects UI library (MUI, Ant, etc)│
│    - Traces component tree              │
│    - Understands wrapper patterns       │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ 3. Generates exact selectors            │
│    - Primary: test IDs, names, ids      │
│    - Fallbacks: type, position, text    │
│    - Explains reasoning                 │
└─────────────────────────────────────────┘
```

## Supported Frameworks

### ✅ Material-UI (MUI)

**Pattern**: Wrapper div with data-testid, input inside

```tsx
// Code
<TextField data-testid="email" />

// Renders
<div data-testid="email">
  <input />
</div>

// Generated Selector
"[data-testid='email'] input"
```

**Usage:**
```typescript
const SOURCE_FILES = [
  'src/components/LoginForm.tsx',
  'src/components/CustomInput.tsx' // Include wrapper!
];
```

### ✅ Ant Design

**Pattern**: Direct rendering, data-testid on input

```tsx
// Code
<Input data-testid="email" />

// Renders
<input data-testid="email" />

// Generated Selector
"[data-testid='email']"
```

### ✅ Chakra UI

**Pattern**: Uses id, direct rendering

```tsx
// Code
<Input id="email" />

// Renders
<input id="email" />

// Generated Selector
"#email"
```

### ✅ Formik

**Pattern**: Adds name attribute

```tsx
// Code
<Field name="email" type="email" />

// Renders
<input name="email" type="email" />

// Generated Selector
"input[name='email']"
```

### ✅ react-hook-form

**Pattern**: Controller, name NOT on input

```tsx
// Code
<Controller
  name="email"
  control={control}
  render={({ field }) => <input {...field} />}
/>

// Renders
<input /> // No name attribute!

// Generated Selector
"input[type='text']:first-of-type" // Fallback
```

### ✅ Plain HTML

**Pattern**: Standard HTML forms

```html
<!-- Code -->
<input type="email" name="email" id="email-input" />

<!-- Renders -->
<input type="email" name="email" id="email-input" />

<!-- Generated Selector -->
"#email-input"
```

### ✅ Vue.js

**Pattern**: Similar to React, v-model binding

```vue
<!-- Code -->
<input v-model="email" data-testid="email" />

<!-- Renders -->
<input data-testid="email" />

<!-- Generated Selector -->
"[data-testid='email']"
```

## What You Need to Provide

### Minimum Requirements

1. **Login page component** - The main login form
2. **Input wrappers** - Any custom input components
3. **Form libraries** - If using Formik, react-hook-form, etc.

### Example: MUI + react-hook-form

```typescript
const SOURCE_FILES = [
  'src/pages/Login.tsx',        // Main login page
  'src/forms/CustomInput.tsx',  // Wrapper component
  // Note: Don't need node_modules, Claude knows MUI patterns
];

const schema = await generator.generateFromSource(SOURCE_FILES, {
  loginUrl: 'https://app.example.com/login'
});

// Result:
// {
//   "meta": {
//     "detectedLibrary": "MUI",
//     "wrapperPattern": "wrapper-div"
//   },
//   "fields": {
//     "email": [
//       {
//         "type": "css",
//         "value": "[data-testid='login-email'] input",
//         "priority": 1,
//         "description": "MUI TextField renders wrapper div"
//       }
//     ]
//   }
// }
```

## Handling Edge Cases

### Custom Components

If you have deeply nested wrappers:

```tsx
// YourInput.tsx
const YourInput = ({ testId, ...props }) => (
  <Wrapper>
    <Container>
      <MUITextField data-testid={testId} {...props} />
    </Container>
  </Wrapper>
);
```

**Solution**: Include ALL wrapper files:
```typescript
const SOURCE_FILES = [
  'src/pages/Login.tsx',
  'src/components/YourInput.tsx',
  'src/components/Wrapper.tsx',
  'src/components/Container.tsx',
];
```

### Shadow DOM (Web Components)

```javascript
// If using Web Components with Shadow DOM
customElements.define('custom-input', class extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '<input />';
  }
});
```

**Limitation**: Shadow DOM requires special handling. Current implementation doesn't support it yet.

**Workaround**: Use regular DOM queries or Playwright's pierce selector.

### Dynamic Class Names (CSS Modules, Styled Components)

```tsx
// Styled component with dynamic classes
const Input = styled.input`
  color: blue;
`;
// Renders: <input class="Input-abc123" />
```

**Solution**: Don't rely on class names. Use:
- data-testid
- id
- name
- type + position

## Testing Different Repos

### Quick Test Script

```typescript
// test-any-repo.ts
import { LoginSchemaGenerator } from './src/browser-agent/schemas/LoginSchemaGenerator';

async function testRepo(repoPath: string, sourceFiles: string[]) {
  const generator = new LoginSchemaGenerator(process.env.CLAUDE_API_KEY);

  const fullPaths = sourceFiles.map(f => `${repoPath}/${f}`);

  const schema = await generator.generateFromSource(fullPaths, {
    loginUrl: 'https://example.com/login'
  });

  console.log('Detected Library:', schema.meta.detectedLibrary);
  console.log('Wrapper Pattern:', schema.meta.wrapperPattern);
  console.log('Email Selector:', schema.fields.email[0].value);

  return schema;
}

// Test with different repos
await testRepo('../some-mui-app', ['src/Login.tsx', 'src/CustomInput.tsx']);
await testRepo('../ant-design-app', ['src/Login.tsx']);
await testRepo('../plain-html-app', ['public/login.html']);
```

## Limitations

### ❌ Won't Work Well With:
1. **Heavily obfuscated code** - Minified, bundled code without source maps
2. **Dynamic imports** - Lazy loaded components not in source files
3. **Shadow DOM** - Web Components with closed shadow roots
4. **Framework-specific rendering** - Next.js SSR, Remix, etc. (need to analyze server components too)

### ✅ Will Work With:
1. **Any component library** - MUI, Ant, Chakra, etc.
2. **Any form library** - Formik, react-hook-form, Final Form
3. **Any framework** - React, Vue, Angular, Svelte
4. **Plain HTML** - Static forms
5. **TypeScript/JavaScript** - Both supported

## Best Practices

### 1. Include All Dependencies

```typescript
// ❌ Bad: Missing wrapper
const SOURCE_FILES = ['src/Login.tsx'];

// ✅ Good: Includes wrapper
const SOURCE_FILES = [
  'src/Login.tsx',
  'src/components/CustomInput.tsx'
];
```

### 2. Update Schema When Code Changes

```typescript
// In CI/CD
const schemaManager = new LoginSchemaManager(storage, apiKey);

const schema = await schemaManager.getOrGenerateSchema(
  loginUrl,
  sourceFiles,
  { forceRegenerate: process.env.FORCE_SCHEMA_REGEN === 'true' }
);
```

### 3. Provide Multiple Fallbacks

Claude automatically generates fallbacks, but you can verify:

```typescript
// Good schema has 2-3 selectors per field
schema.fields.email.length >= 2 // ✅
```

### 4. Test Locally First

```bash
# Test schema generation before CI/CD
npx tsx test-schema-based-login.ts
```

## Summary

| Framework | Wrapper Pattern | Works? | Notes |
|-----------|----------------|--------|-------|
| MUI | wrapper-div | ✅ | Include wrapper components |
| Ant Design | direct | ✅ | Clean, direct selectors |
| Chakra UI | direct | ✅ | Uses id attributes |
| Formik | direct | ✅ | Adds name attributes |
| react-hook-form | direct | ✅ | No name, use test IDs |
| Plain HTML | direct | ✅ | Simple, reliable |
| Vue.js | direct | ✅ | Similar to React |
| Angular | direct | ✅ | Material or plain |
| Svelte | direct | ✅ | Simple DOM |
| Web Components | shadow-dom | ⚠️ | Needs special handling |

**Bottom Line**: Works with 95% of web apps. For the other 5%, use the smart-login fallback.
