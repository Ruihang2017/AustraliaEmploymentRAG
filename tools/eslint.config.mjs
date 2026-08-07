// FND-01: the `pnpm lint` configuration (PRD section 20.3 gate).
// Kept under tools/ so no unallocated root config file is introduced; invoked as
// `eslint --config tools/eslint.config.mjs .` by tools/workspace-script.mjs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    // Everything below is relative to the repository root, which is this file's parent.
    basePath: '..',
  },
  {
    ignores: [
      '**/node_modules/**',
      'target/**',
      '.venv/**',
      '**/__pycache__/**',
      '.pytest_cache/**',
      'docs/**',
      'templates/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
  },
];
