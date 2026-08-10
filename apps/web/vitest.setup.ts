import '@testing-library/jest-dom/vitest';
// Real, spec-faithful IndexedDB for jsdom (which has none), so component
// tests that exercise the Studio's persistence flow hit actual IndexedDB
// semantics rather than needing every test to mock the repository layer.
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
