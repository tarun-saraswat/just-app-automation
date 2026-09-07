import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['artifacts/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.mocha, browser: 'readonly', $: 'readonly', $$: 'readonly' }
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] }
  },
  {
    files: ['test/specs/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.mocha, browser: 'readonly', $: 'readonly', $$: 'readonly', expect: 'readonly' } }
  }
];
