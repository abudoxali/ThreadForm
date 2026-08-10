import { FlatCompat } from '@eslint/eslintrc';
import { nextjsConfig } from '@threadform/config/eslint/nextjs';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals'),
  ...nextjsConfig,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];

export default config;
