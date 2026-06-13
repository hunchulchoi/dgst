import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';
import ts from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '.DS_Store',
      'node_modules/**',
      'build/**',
      '.svelte-kit/**',
      'package/**',
      '.env',
      '.env.*',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock'
    ]
  },
  js.configs.recommended,
  ...svelte.configs.recommended,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2017,
        ...globals.node
      }
    }
  },
  {
    rules: {
      'no-empty': [
        'error',
        {
          allowEmptyCatch: true
        }
      ],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'none'
        }
      ]
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig
      }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'svelte/no-navigation-without-resolve': 'off',
      'svelte/no-unused-svelte-ignore': 'off',
      'svelte/no-useless-mustaches': 'off',
      'svelte/prefer-svelte-reactivity': 'off',
      'svelte/prefer-writable-derived': 'off',
      'svelte/require-each-key': 'off'
    }
  }
);
