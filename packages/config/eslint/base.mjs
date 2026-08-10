// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Base ESLint flat config shared by every ThreadForm package. */
export const baseConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', 'out/**'],
  },
);

export default baseConfig;
