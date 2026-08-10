// @ts-check
import tseslint from 'typescript-eslint';
import { baseConfig } from './base.mjs';

/** ESLint flat config for Next.js apps. The app's own eslint.config.mjs layers
 * `next/core-web-vitals` (via FlatCompat) alongside this; this just adds the
 * shared TS rules on top. */
export const nextjsConfig = tseslint.config(...baseConfig);

export default nextjsConfig;
