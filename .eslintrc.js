module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off', // We use core.info instead but allow console for debugging
    'prefer-const': 'error',
    'no-var': 'error',
  },
  env: {
    node: true,
    es2022: true,
    jest: true,
    browser: true,
  },
  globals: {
    NodeJS: 'readonly',
    BufferEncoding: 'readonly',
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
      env: {
        jest: true,
      },
    },
    {
      files: ['src/browser-agent/**/*.ts', 'src/browser-context/**/*.ts'],
      env: {
        browser: true,
      },
      globals: {
        document: 'readonly',
        window: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        XPathResult: 'readonly',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '!.eslintrc.js'],
};